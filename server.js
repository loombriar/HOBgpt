const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;
const ALLOWED_CATEGORIES = new Set(['home', 'wellness', 'gift', 'apparel', 'accessories', 'other']);

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    return crypto.timingSafeEqual(
      crypto.createHash('sha256').update(a).digest(),
      crypto.createHash('sha256').update(b).digest()
    );
  } catch {
    return false;
  }
}

function parseDesignerTokens(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function makeId() {
  return crypto.randomUUID();
}

function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function validateListingInput(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const price = Number(body.price);
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';

  if (!title || title.length > 120) return { error: 'Provide a valid title between 1 and 120 characters.' };
  if (description.length > 2000) return { error: 'Description must be 2,000 characters or fewer.' };
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid price between 0 and 1,000,000.' };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: 'Choose a supported product category.' };

  return { value: { title, description, price, category } };
}

function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(rootDir, '.data'));
  const imagesDir = path.join(dataDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const db = options.db || new Database(options.databasePath || path.join(dataDir, 'catalog.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      designer_id TEXT NOT NULL,
      idempotency_key TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','pending_review','published','rejected','archived','deleted')),
      moderation_status TEXT NOT NULL CHECK (moderation_status IN ('pending','approved','rejected')),
      legacy_image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','canceled')),
      currency TEXT NOT NULL DEFAULT 'usd',
      subtotal_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      designer_amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS designer_transfers (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      designer_id TEXT NOT NULL,
      stripe_account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      stripe_transfer_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending','paid','failed')),
      error_message TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      UNIQUE(order_id, designer_id),
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      listing_id TEXT NOT NULL,
      designer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      unit_amount_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      designer_amount_cents INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS listings_unique_idempotency
      ON listings(designer_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS listing_images (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      client_image_key TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      position INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      upload_status TEXT NOT NULL CHECK (upload_status IN ('ready','deleted')),
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(listing_id, client_image_key)
    );

    CREATE INDEX IF NOT EXISTS listing_images_listing ON listing_images(listing_id, upload_status, position);
  `);

  const designerTokens = parseDesignerTokens(options.designerTokens ?? process.env.DESIGNER_TOKENS_JSON);
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const reviewRequired = options.reviewRequired ?? process.env.REVIEW_REQUIRED !== 'false';

  const seedProducts = options.seedProducts || JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed-products.json'), 'utf8'));
  const insertSeed = db.prepare(`
    INSERT OR IGNORE INTO listings (
      id, designer_id, title, description, price, category, status, moderation_status,
      legacy_image_url, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', 'approved', ?, ?, ?, ?)
  `);
  const seedTx = db.transaction((rows) => {
    const now = new Date().toISOString();
    for (const row of rows) {
      insertSeed.run(
        row.id,
        row.designerId || 'house-of-briar',
        row.title,
        row.description || '',
        Number(row.price) || 0,
        row.category || 'home',
        row.legacyImageUrl || null,
        now,
        now,
        now
      );
    }
  });
  seedTx(seedProducts);

  function fail(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
  }

  function authDesigner(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in with a designer access token.');
    for (const [configuredToken, designerId] of Object.entries(designerTokens)) {
      if (safeEqual(token, configuredToken) && typeof designerId === 'string' && designerId.trim()) {
        req.designerId = designerId.trim();
        return next();
      }
    }
    return fail(res, 401, 'unauthorized', 'This designer token is invalid.');
  }

  function authAdmin(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!adminToken || !safeEqual(token, adminToken)) {
      return fail(res, 403, 'forbidden', 'Administrator access is required.');
    }
    return next();
  }

  function getListing(id) {
    return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  }

  function getImages(listingId, mode = 'public') {
    const rows = db.prepare(`
      SELECT *
      FROM listing_images
      WHERE listing_id = ? AND upload_status = 'ready'
      ORDER BY position ASC, created_at ASC
    `).all(listingId);

    return rows.map((image) => ({
      id: image.id,
      position: image.position,
      mimeType: image.mime_type,
      sizeBytes: image.size_bytes,
      width: image.width,
      height: image.height,
      url: mode === 'public' ? `/media/${encodeURIComponent(image.id)}` : `/api/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image.id)}/content`,
      legacy: false,
    }));
  }

  function serializeListing(row, mode = 'public') {
    if (!row) return null;
    const images = getImages(row.id, mode);
    const primaryImage = images[0] || (row.legacy_image_url ? { url: row.legacy_image_url, legacy: true, id: `legacy-${row.id}` } : null);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      designerId: row.designer_id,
      status: row.status,
      moderationStatus: row.moderation_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      imageUrl: primaryImage?.url || null,
      primaryImage,
      images
    };
  }

  function ownedEditableListing(req, res) {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') {
      fail(res, 404, 'not_found', 'Listing not found.');
      return null;
    }
    if (!['draft', 'rejected'].includes(row.status)) {
      fail(res, 409, 'not_editable', 'Only draft or rejected listings can be edited.');
      return null;
    }
    return row;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
  });

  let app;
  app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  async function stripeApi(pathname, options = {}) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured.');
    const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {})
      },
      body: options.body
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || 'Stripe request failed.');
    return payload;
  }

  const connectAccounts = parseDesignerTokens(options.connectAccounts ?? process.env.STRIPE_CONNECT_ACCOUNTS_JSON);

  async function processDesignerTransfers(orderId) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").get(orderId);
    if (!order) return [];
    const groups = db.prepare(`SELECT designer_id, SUM(designer_amount_cents) AS amount_cents FROM order_items WHERE order_id = ? GROUP BY designer_id`).all(orderId);
    const results = [];
    for (const group of groups) {
      const existing = db.prepare('SELECT * FROM designer_transfers WHERE order_id = ? AND designer_id = ?').get(orderId, group.designer_id);
      if (existing?.status === 'paid') { results.push(existing); continue; }
      const accountId = connectAccounts[group.designer_id];
      if (typeof accountId !== 'string' || !accountId.startsWith('acct_')) {
        results.push({ designer_id: group.designer_id, status: 'pending', reason: 'connect_account_missing' });
        continue;
      }
      const transferId = existing?.id || makeId();
      if (!existing) db.prepare(`INSERT INTO designer_transfers (id, order_id, designer_id, stripe_account_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(transferId, orderId, group.designer_id, accountId, group.amount_cents, new Date().toISOString());
      try {
        const body = new URLSearchParams({
          amount: String(group.amount_cents),
          currency: order.currency,
          destination: accountId,
          transfer_group: orderId,
          'metadata[order_id]': orderId,
          'metadata[designer_id]': group.designer_id
        });
        const transfer = await stripeApi('transfers', { method: 'POST', body: body.toString(), idempotencyKey: `hob-transfer-${orderId}-${group.designer_id}` });
        db.prepare("UPDATE designer_transfers SET stripe_transfer_id = ?, status = 'paid', error_message = NULL, paid_at = ? WHERE id = ?").run(transfer.id, new Date().toISOString(), transferId);
        results.push({ designer_id: group.designer_id, status: 'paid', stripe_transfer_id: transfer.id });
      } catch (error) {
        db.prepare("UPDATE designer_transfers SET status = 'failed', error_message = ? WHERE id = ?").run(String(error.message || error).slice(0, 500), transferId);
        results.push({ designer_id: group.designer_id, status: 'failed' });
      }
    }
    return results;
  }

  function buildCheckoutQuote(requested) {
    if (!Array.isArray(requested) || !requested.length || requested.length > 50) throw Object.assign(new Error('Add at least one item before checkout.'), { statusCode: 422 });
    const quantities = new Map();
    for (const item of requested) {
      const id = typeof item?.id === 'string' ? item.id : '';
      const quantity = Number(item?.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw Object.assign(new Error('Cart quantities must be whole numbers between 1 and 10.'), { statusCode: 422 });
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }
    const rows = [];
    for (const [id, quantity] of quantities) {
      const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'published' AND moderation_status = 'approved'").get(id);
      if (!listing) throw Object.assign(new Error('One or more pieces are no longer available.'), { statusCode: 409 });
      const unitAmountCents = Math.round(Number(listing.price) * 100);
      const lineTotalCents = unitAmountCents * quantity;
      const platformFeeCents = Math.round(lineTotalCents * 0.10);
      rows.push({ id: listing.id, title: listing.title, designerId: listing.designer_id, quantity, unitAmountCents, lineTotalCents, platformFeeCents, designerAmountCents: lineTotalCents - platformFeeCents });
    }
    const subtotalCents = rows.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const platformFeeCents = rows.reduce((sum, item) => sum + item.platformFeeCents, 0);
    return { currency: 'usd', items: rows, subtotalCents, platformFeeCents, designerAmountCents: subtotalCents - platformFeeCents };
  }
  app.post('/api/checkout/quote', (req, res) => {
    try { return res.json(buildCheckoutQuote(req.body?.items)); }
    catch (error) { return fail(res, error.statusCode || 422, 'invalid_cart', error.message); }
  });

  app.post('/api/checkout/session', async (req, res, next) => {
    try {
      const quote = buildCheckoutQuote(req.body?.items);
      const orderId = makeId();
      const now = new Date().toISOString();
      const origin = `${req.protocol}://${req.get('host')}`;
      const body = new URLSearchParams({
        mode: 'payment',
        success_url: `${origin}/checkout?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout?checkout=canceled&order_id=${encodeURIComponent(orderId)}`,
        'metadata[order_id]': orderId,
        'payment_intent_data[metadata][order_id]': orderId
      });
      quote.items.forEach((item, index) => {
        body.set(`line_items[${index}][price_data][currency]`, quote.currency);
        body.set(`line_items[${index}][price_data][product_data][name]`, item.title);
        body.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
        body.set(`line_items[${index}][quantity]`, String(item.quantity));
      });
      const session = await stripeApi('checkout/sessions', { method: 'POST', body: body.toString() });
      db.transaction(() => {
        db.prepare(`INSERT INTO orders (id, stripe_session_id, status, currency, subtotal_cents, platform_fee_cents, designer_amount_cents, created_at) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`).run(orderId, session.id, quote.currency, quote.subtotalCents, quote.platformFeeCents, quote.designerAmountCents, now);
        const stmt = db.prepare(`INSERT INTO order_items (id, order_id, listing_id, designer_id, title, unit_amount_cents, quantity, line_total_cents, platform_fee_cents, designer_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        quote.items.forEach(item => stmt.run(makeId(), orderId, item.id, item.designerId, item.title, item.unitAmountCents, item.quantity, item.lineTotalCents, item.platformFeeCents, item.designerAmountCents));
      })();
      return res.status(201).json({ orderId, sessionId: session.id, url: session.url });
    } catch (error) { return next(error); }
  });

  app.get('/api/checkout/session/:sessionId', async (req, res, next) => {
    try {
      if (!/^cs_[A-Za-z0-9_]+$/.test(req.params.sessionId)) return fail(res, 400, 'invalid_session', 'Invalid checkout session.');
      const session = await stripeApi(`checkout/sessions/${encodeURIComponent(req.params.sessionId)}`);
      const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(session.id);
      if (!order) return fail(res, 404, 'order_not_found', 'Order not found.');
      const paid = session.payment_status === 'paid' && session.status === 'complete';
      if (paid && order.status !== 'paid') db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), order.id);
      if (paid) await processDesignerTransfers(order.id);
      return res.json({ orderId: order.id, paid, status: paid ? 'paid' : order.status });
    } catch (error) { return next(error); }
  });

