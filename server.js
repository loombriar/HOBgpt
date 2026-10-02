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
      tracking_carrier TEXT,
      tracking_number TEXT,
      tracking_submitted_at TEXT,
      tracking_provider_id TEXT,
      tracking_status TEXT,
      tracking_verified_at TEXT,
      release_reason TEXT,
      UNIQUE(order_id, designer_id),
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_reservations (
      listing_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved','sold','released')),
      reserved_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sold_at TEXT,
      FOREIGN KEY(listing_id) REFERENCES listings(id),
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

  function ensureColumn(table, name, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  ensureColumn('orders', 'buyer_email', 'TEXT');
  ensureColumn('listings', 'designer_email', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_carrier', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_number', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_submitted_at', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_provider_id', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_status', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_verified_at', 'TEXT');
  ensureColumn('designer_transfers', 'release_reason', 'TEXT');

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

  async function authDesigner(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in to your designer account.');

    for (const [configuredToken, designerId] of Object.entries(designerTokens)) {
      if (safeEqual(token, configuredToken) && typeof designerId === 'string' && designerId.trim()) {
        req.designerId = designerId.trim();
        return next();
      }
    }

    try {
      const origin = `${req.protocol}://${req.get('host')}`;
      const discovery = await fetch(`${origin}/_genesis/auth/.well-known/openid-configuration`);
      if (!discovery.ok) return fail(res, 401, 'unauthorized', 'Designer sign-in could not be verified.');
      const metadata = await discovery.json();
      if (typeof metadata.userinfo_endpoint !== 'string') return fail(res, 401, 'unauthorized', 'Designer sign-in could not be verified.');
      const userInfo = await fetch(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!userInfo.ok) return fail(res, 401, 'unauthorized', 'Your designer session is no longer valid.');
      const profile = await userInfo.json();
      if (typeof profile.sub !== 'string' || !profile.sub.trim()) return fail(res, 401, 'unauthorized', 'Designer identity is missing.');
      req.designerId = profile.sub.trim();
      req.designerEmail = typeof profile.email === 'string' ? profile.email : '';
      if (req.designerEmail) db.prepare('UPDATE listings SET designer_email = ? WHERE designer_id = ?').run(req.designerEmail, req.designerId);
      return next();
    } catch (error) {
      return next(error);
    }
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

  app.post('/api/easypost/webhook', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      const secret = process.env.EASYPOST_WEBHOOK_SECRET;
      const supplied = req.get('x-hob-easypost-secret') || '';
      if (!secret || !safeEqual(supplied, secret)) return res.status(401).json({ error: { code: 'invalid_webhook', message: 'Invalid webhook authentication.' } });

      const tracker = req.body?.result?.object === 'Tracker' ? req.body.result : req.body?.result;
      if (!tracker?.id) return res.json({ received: true, ignored: true });

      const transfer = db.prepare('SELECT * FROM designer_transfers WHERE tracking_provider_id = ?').get(tracker.id);
      if (!transfer || transfer.status === 'paid') return res.json({ received: true, ignored: true });

      const accepted = new Set(['pre_transit','in_transit','out_for_delivery','delivered','available_for_pickup']);
      const hasEvent = Array.isArray(tracker.tracking_details) && tracker.tracking_details.length > 0;
      const verifiedAt = accepted.has(tracker.status) && hasEvent ? new Date().toISOString() : null;
      db.prepare('UPDATE designer_transfers SET tracking_status = ?, tracking_verified_at = COALESCE(tracking_verified_at, ?) WHERE id = ?').run(tracker.status || 'unknown', verifiedAt, transfer.id);

      if (verifiedAt) await processDesignerTransfers(transfer.order_id, transfer.designer_id, 'tracking_verified');
      return res.json({ received: true });
    } catch (error) {
      console.error('EasyPost webhook failed:', error);
      return res.status(500).json({ error: { code: 'webhook_failed', message: 'Tracking update could not be processed.' } });
    }
  });

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const signature = req.get('stripe-signature') || '';
      if (!secret || !signature) return res.status(400).send('Webhook signature configuration is missing.');
      const parts = Object.fromEntries(signature.split(',').map(part => part.split('=', 2)));
      const timestamp = parts.t;
      const supplied = parts.v1;
      if (!timestamp || !supplied) return res.status(400).send('Invalid Stripe signature.');
      if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return res.status(400).send('Expired Stripe signature.');
      const signed = Buffer.concat([Buffer.from(String(timestamp) + '.'), req.body]);
      const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
      if (!safeEqual(expected, supplied)) return res.status(400).send('Invalid Stripe signature.');

      const event = JSON.parse(req.body.toString('utf8'));
      if (event.type === 'checkout.session.expired') {
        const session = event.data?.object;
        const orderId = session?.metadata?.order_id;
        if (orderId) releaseOrderInventory(orderId);
      }
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data?.object;
        const orderId = session?.metadata?.order_id;
        if (orderId && session.payment_status === 'paid') {
          const order = db.prepare('SELECT * FROM orders WHERE id = ? AND stripe_session_id = ?').get(orderId, session.id);
          if (order) {
            if (order.status !== 'paid') db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, buyer_email = COALESCE(?, buyer_email) WHERE id = ?").run(new Date().toISOString(), session.customer_details?.email || session.customer_email || null, order.id);
            markOrderInventorySold(order.id);
            await prepareDesignerTransfers(order.id);
            if (order.status !== 'paid') void notifySale(order.id);
          }
        }
      }
      return res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook failed:', error);
      return res.status(500).send('Webhook processing failed.');
    }
  });
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

  async function sendEmail({ to, subject, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from || !to) return false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text })
      });
      if (!response.ok) console.error('Resend email failed:', response.status, await response.text());
      return response.ok;
    } catch (error) {
      console.error('Resend email failed:', error);
      return false;
    }
  }

  function designerOrderContact(orderId, designerId) {
    return db.prepare(`SELECT MAX(l.designer_email) AS email, GROUP_CONCAT(oi.title, ', ') AS titles,
      SUM(oi.designer_amount_cents) AS earnings_cents
      FROM order_items oi JOIN listings l ON l.id = oi.listing_id
      WHERE oi.order_id = ? AND oi.designer_id = ?`).get(orderId, designerId);
  }

  async function notifySale(orderId) {
    const groups = db.prepare('SELECT DISTINCT designer_id FROM order_items WHERE order_id = ?').all(orderId);
    for (const group of groups) {
      const contact = designerOrderContact(orderId, group.designer_id);
      if (!contact?.email) continue;
      await sendEmail({ to: contact.email, subject: 'You made a sale on House of Briar',
        text: `A piece sold on House of Briar.\n\nOrder: ${orderId}\nItems: ${contact.titles}\nYour earnings: ${(contact.earnings_cents / 100).toFixed(2)}\n\nOpen your Designer Studio to ship the order and add tracking. Your payout remains held until carrier tracking is verified.` });
    }
  }

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

  function prepareDesignerTransfers(orderId) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").get(orderId);
    if (!order) return [];
    const groups = db.prepare(`SELECT designer_id, SUM(designer_amount_cents) AS amount_cents FROM order_items WHERE order_id = ? GROUP BY designer_id`).all(orderId);
    const prepared = [];
    for (const group of groups) {
      const existing = db.prepare('SELECT * FROM designer_transfers WHERE order_id = ? AND designer_id = ?').get(orderId, group.designer_id);
      if (existing) { prepared.push(existing); continue; }
      const accountId = connectAccounts[group.designer_id];
      const transferId = makeId();
      db.prepare(`INSERT INTO designer_transfers (id, order_id, designer_id, stripe_account_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(transferId, orderId, group.designer_id, typeof accountId === 'string' ? accountId : '', group.amount_cents, new Date().toISOString());
      prepared.push(db.prepare('SELECT * FROM designer_transfers WHERE id = ?').get(transferId));
    }
    return prepared;
  }

  async function verifyShipmentTracking(trackingNumber, carrier) {
    const apiKey = process.env.EASYPOST_API_KEY;
    if (!apiKey) throw Object.assign(new Error('Shipment verification is not configured.'), { statusCode: 503 });
    const response = await fetch('https://api.easypost.com/v2/trackers', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tracker: { tracking_code: trackingNumber, carrier } })
    });
    const tracker = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(tracker?.error?.message || 'Carrier could not verify this tracking number.'), { statusCode: 422 });
    const acceptedStatuses = new Set(['pre_transit','in_transit','out_for_delivery','delivered','available_for_pickup']);
    const hasCarrierEvent = Array.isArray(tracker.tracking_details) && tracker.tracking_details.length > 0;
    const verified = acceptedStatuses.has(tracker.status) && hasCarrierEvent;
    return { verified, id: tracker.id || '', carrier: tracker.carrier || carrier, status: tracker.status || 'unknown' };
  }

  async function processDesignerTransfers(orderId, designerId, releaseReason = 'tracking_submitted') {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").get(orderId);
    if (!order) return [];
    const groups = db.prepare(`SELECT designer_id, SUM(designer_amount_cents) AS amount_cents FROM order_items WHERE order_id = ? AND designer_id = ? GROUP BY designer_id`).all(orderId, designerId);
    const results = [];
    for (const group of groups) {
      const existing = db.prepare('SELECT * FROM designer_transfers WHERE order_id = ? AND designer_id = ?').get(orderId, group.designer_id);
      if (existing?.status === 'paid') { results.push(existing); continue; }
      if (!existing) { results.push({ designer_id: group.designer_id, status: 'pending', reason: 'transfer_not_prepared' }); continue; }
      if (releaseReason === 'tracking_verified' && (!existing.tracking_number || !existing.tracking_verified_at)) { results.push({ designer_id: group.designer_id, status: 'pending', reason: 'tracking_required' }); continue; }
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
        db.prepare("UPDATE designer_transfers SET stripe_transfer_id = ?, status = 'paid', error_message = NULL, paid_at = ?, release_reason = ? WHERE id = ?").run(transfer.id, new Date().toISOString(), releaseReason, transferId);
        results.push({ designer_id: group.designer_id, status: 'paid', stripe_transfer_id: transfer.id });
      } catch (error) {
        db.prepare("UPDATE designer_transfers SET status = 'failed', error_message = ? WHERE id = ?").run(String(error.message || error).slice(0, 500), transferId);
        results.push({ designer_id: group.designer_id, status: 'failed' });
      }
    }
    return results;
  }

  function releaseExpiredInventoryReservations() {
    const now = new Date().toISOString();
    db.prepare("UPDATE inventory_reservations SET status = 'released' WHERE status = 'reserved' AND expires_at <= ?").run(now);
  }

  function reserveInventory(orderId, items, now) {
    releaseExpiredInventoryReservations();
    const expiresAt = new Date(new Date(now).getTime() + 30 * 60 * 1000).toISOString();
    const find = db.prepare("SELECT * FROM inventory_reservations WHERE listing_id = ? AND status IN ('reserved','sold')");
    const upsert = db.prepare(`INSERT INTO inventory_reservations (listing_id, order_id, status, reserved_at, expires_at)
      VALUES (?, ?, 'reserved', ?, ?)
      ON CONFLICT(listing_id) DO UPDATE SET order_id=excluded.order_id, status='reserved', reserved_at=excluded.reserved_at, expires_at=excluded.expires_at, sold_at=NULL`);
    for (const item of items) {
      if (item.quantity !== 1) throw Object.assign(new Error('One-of-a-kind pieces can only be purchased one at a time.'), { statusCode: 409 });
      const active = find.get(item.id);
      if (active) throw Object.assign(new Error('One or more pieces are already reserved or sold.'), { statusCode: 409 });
      upsert.run(item.id, orderId, now, expiresAt);
    }
    return expiresAt;
  }

  function markOrderInventorySold(orderId) {
    const now = new Date().toISOString();
    db.prepare("UPDATE inventory_reservations SET status = 'sold', sold_at = ? WHERE order_id = ? AND status = 'reserved'").run(now, orderId);
    db.prepare("UPDATE listings SET status = 'archived', updated_at = ?, version = version + 1 WHERE id IN (SELECT listing_id FROM order_items WHERE order_id = ?)").run(now, orderId);
  }

  function releaseOrderInventory(orderId) {
    const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    if (!order || order.status === 'paid') return false;
    db.transaction(() => {
      db.prepare("UPDATE inventory_reservations SET status = 'released' WHERE order_id = ? AND status = 'reserved'").run(orderId);
      db.prepare("UPDATE orders SET status = 'canceled' WHERE id = ? AND status = 'pending'").run(orderId);
    })();
    return true;
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
        reserveInventory(orderId, quote.items, now);
        const stmt = db.prepare(`INSERT INTO order_items (id, order_id, listing_id, designer_id, title, unit_amount_cents, quantity, line_total_cents, platform_fee_cents, designer_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        quote.items.forEach(item => stmt.run(makeId(), orderId, item.id, item.designerId, item.title, item.unitAmountCents, item.quantity, item.lineTotalCents, item.platformFeeCents, item.designerAmountCents));
      })();
      return res.status(201).json({ orderId, sessionId: session.id, url: session.url });
    } catch (error) { return next(error); }
  });

  app.post('/api/checkout/cancel/:orderId', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
    if (!order) return fail(res, 404, 'order_not_found', 'Order not found.');
    if (order.status === 'paid') return fail(res, 409, 'already_paid', 'Paid orders cannot be canceled from checkout.');
    releaseOrderInventory(order.id);
    return res.json({ orderId: order.id, status: 'canceled', inventoryReleased: true });
  });

  app.get('/api/admin/operations', authAdmin, (_req, res) => {
    releaseExpiredInventoryReservations();
    const orders = db.prepare(`SELECT o.id,o.status,o.currency,o.subtotal_cents,o.platform_fee_cents,o.designer_amount_cents,o.created_at,o.paid_at,
      COUNT(DISTINCT oi.designer_id) designer_count,COUNT(oi.id) item_count
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`).all();
    const payouts = db.prepare(`SELECT dt.order_id,dt.designer_id,dt.amount_cents,dt.status,dt.error_message,dt.created_at,dt.paid_at,
      dt.tracking_carrier,dt.tracking_number,dt.tracking_status,dt.tracking_verified_at,dt.release_reason
      FROM designer_transfers dt ORDER BY dt.created_at DESC LIMIT 300`).all();
    const inventory = db.prepare(`SELECT ir.listing_id,ir.order_id,ir.status,ir.reserved_at,ir.expires_at,ir.sold_at,l.title,l.designer_id
      FROM inventory_reservations ir LEFT JOIN listings l ON l.id=ir.listing_id
      WHERE ir.status IN ('reserved','sold') ORDER BY ir.reserved_at DESC LIMIT 300`).all();
    const summary = {
      paidOrders: orders.filter(row=>row.status==='paid').length,
      pendingOrders: orders.filter(row=>row.status==='pending').length,
      heldPayouts: payouts.filter(row=>row.status==='pending').length,
      failedPayouts: payouts.filter(row=>row.status==='failed').length,
      releasedPayouts: payouts.filter(row=>row.status==='paid').length,
      activeReservations: inventory.filter(row=>row.status==='reserved').length
    };
    return res.json({summary,orders,payouts,inventory});
  });

  app.get('/api/admin/orders/:orderId', authAdmin, (req,res)=>{
    const order=db.prepare('SELECT id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at FROM orders WHERE id=?').get(req.params.orderId);
    if(!order)return fail(res,404,'order_not_found','Order not found.');
    const items=db.prepare('SELECT listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents FROM order_items WHERE order_id=?').all(order.id);
    const payouts=db.prepare('SELECT designer_id,amount_cents,status,error_message,paid_at,tracking_carrier,tracking_number,tracking_status,tracking_verified_at,release_reason FROM designer_transfers WHERE order_id=?').all(order.id);
    return res.json({order,items,payouts});
  });

  app.post('/api/admin/orders/:orderId/cancel', authAdmin, (req,res)=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
    if(!order)return fail(res,404,'order_not_found','Order not found.');
    if(order.status==='paid')return fail(res,409,'refund_required','Paid orders require a Stripe refund rather than cancellation.');
    releaseOrderInventory(order.id);
    return res.json({ok:true,status:'canceled'});
  });

  app.post('/api/admin/orders/:orderId/inventory/release', authAdmin, (req,res)=>{
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
    if(!order)return fail(res,404,'order_not_found','Order not found.');
    if(order.status==='paid')return fail(res,409,'paid_order','Inventory for a paid order cannot be released.');
    const result=db.prepare("UPDATE inventory_reservations SET status='released' WHERE order_id=? AND status='reserved'").run(order.id);
    return res.json({ok:true,released:result.changes});
  });

  app.post('/api/admin/orders/:orderId/designers/:designerId/release', authAdmin, async (req,res,next)=>{
    try{
      const order=db.prepare("SELECT * FROM orders WHERE id=? AND status='paid'").get(req.params.orderId);
      if(!order)return fail(res,404,'order_not_found','Paid order not found.');
      const transfer=db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id,req.params.designerId);
      if(!transfer)return fail(res,404,'payout_not_found','Designer payout not found.');
      const reason=transfer.status==='failed'?'admin_retry':'admin_override';
      const results=await processDesignerTransfers(order.id,req.params.designerId,reason);
      return res.json({ok:true,results});
    }catch(error){return next(error);}
  });

  app.get('/api/my/orders', authDesigner, (req, res) => {
    const rows = db.prepare(`SELECT o.id order_id,o.status order_status,o.currency,o.created_at,o.paid_at,oi.title,oi.quantity,oi.line_total_cents,oi.designer_amount_cents,
      dt.status payout_status,dt.tracking_carrier,dt.tracking_number,dt.tracking_status,dt.tracking_verified_at,dt.paid_at payout_paid_at
      FROM orders o JOIN order_items oi ON oi.order_id=o.id LEFT JOIN designer_transfers dt ON dt.order_id=o.id AND dt.designer_id=oi.designer_id
      WHERE oi.designer_id=? ORDER BY o.created_at DESC`).all(req.designerId);
    const map=new Map();
    for(const row of rows){if(!map.has(row.order_id)){let fulfillmentStatus=row.order_status;if(row.order_status==='paid')fulfillmentStatus='awaiting_shipment';if(row.tracking_number)fulfillmentStatus='tracking_submitted';if(row.tracking_verified_at)fulfillmentStatus='tracking_verified';if(row.payout_status==='paid')fulfillmentStatus='payout_released';map.set(row.order_id,{id:row.order_id,orderStatus:row.order_status,fulfillmentStatus,currency:row.currency,createdAt:row.created_at,paidAt:row.paid_at,payoutStatus:row.payout_status||'pending',trackingCarrier:row.tracking_carrier,trackingNumber:row.tracking_number,trackingStatus:row.tracking_status,payoutPaidAt:row.payout_paid_at,earningsCents:0,items:[]});}const order=map.get(row.order_id);order.earningsCents+=row.designer_amount_cents;order.items.push({title:row.title,quantity:row.quantity,lineTotalCents:row.line_total_cents,earningsCents:row.designer_amount_cents});}
    return res.json({orders:[...map.values()]});
  });

  app.post('/api/orders/:orderId/tracking', authDesigner, async (req,res,next)=>{
    try{
      const order=db.prepare("SELECT * FROM orders WHERE id=? AND status='paid'").get(req.params.orderId);
      if(!order)return fail(res,404,'order_not_found','Paid order not found.');
      const owns=db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND designer_id=?').get(order.id,req.designerId);
      if(!owns)return fail(res,404,'order_not_found','Order not found.');
      const carrier=String(req.body?.carrier||'').trim();const trackingNumber=String(req.body?.trackingNumber||'').trim();
      if(!carrier||trackingNumber.length<6||trackingNumber.length>100)return fail(res,422,'invalid_tracking','Add a valid carrier and tracking number.');
      prepareDesignerTransfers(order.id);
      const tracker=await verifyShipmentTracking(trackingNumber,carrier);
      const verifiedAt=tracker.verified?new Date().toISOString():null;
      db.prepare(`UPDATE designer_transfers SET tracking_carrier=?,tracking_number=?,tracking_submitted_at=?,tracking_provider_id=?,tracking_status=?,tracking_verified_at=? WHERE order_id=? AND designer_id=?`).run(tracker.carrier,trackingNumber,new Date().toISOString(),tracker.id,tracker.status,verifiedAt,order.id,req.designerId);
      const contact=designerOrderContact(order.id,req.designerId);
      if(contact?.email)void sendEmail({to:contact.email,subject:'Tracking received for your House of Briar sale',text:`Order ${order.id}\nTracking: ${tracker.carrier} ${trackingNumber}\nStatus: ${tracker.status}\n\n${tracker.verified?'Carrier tracking is verified and your payout is being released.':'Your payout remains held until the carrier verifies the shipment.'}`});
      if(order.buyer_email)void sendEmail({to:order.buyer_email,subject:'Your House of Briar order is shipping',text:`Your order ${order.id} has tracking.\nCarrier: ${tracker.carrier}\nTracking: ${trackingNumber}`});
      if(!tracker.verified)return res.status(202).json({verified:false,status:tracker.status});
      const transfers=await processDesignerTransfers(order.id,req.designerId,'tracking_verified');
      return res.json({verified:true,status:tracker.status,transfers});
    }catch(error){return next(error);}
  });

  app.get('/api/checkout/session/:sessionId', async (req, res, next) => {
    try {
      if (!/^cs_[A-Za-z0-9_]+$/.test(req.params.sessionId)) return fail(res, 400, 'invalid_session', 'Invalid checkout session.');
      const session = await stripeApi(`checkout/sessions/${encodeURIComponent(req.params.sessionId)}`);
      const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(session.id);
      if (!order) return fail(res, 404, 'order_not_found', 'Order not found.');
      const paid = session.payment_status === 'paid' && session.status === 'complete';
      if (paid && order.status !== 'paid') db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, buyer_email = COALESCE(?, buyer_email) WHERE id = ?").run(new Date().toISOString(), session.customer_details?.email || session.customer_email || null, order.id);
      if (paid) {
        markOrderInventorySold(order.id);
        await prepareDesignerTransfers(order.id);
      }
      return res.json({ orderId: order.id, paid, status: paid ? 'paid' : order.status });
    } catch (error) { return next(error); }
  });

