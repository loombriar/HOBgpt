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
const CHECKOUT_RESERVATION_MINUTES = 31;
const ALLOWED_CATEGORIES = new Set(['home', 'wellness', 'gift', 'apparel', 'accessories', 'costumes', 'other', 'one-of-a-kind', 'upcycled', 'vintage-inspired', 'handmade', 'botanical', 'limited edition', 'statement piece']);

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

const FIT_KEYS = ['bust', 'waist', 'hips', 'inseam'];
function validateFitRanges(value) {
  if (value === undefined) return { value: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Enter valid body measurement ranges.' };
  const ranges = {};
  for (const key of FIT_KEYS) {
    if (value[key] === undefined) continue;
    const range = value[key];
    if (!range || typeof range !== 'object' || Array.isArray(range)) return { error: `Enter a minimum and maximum ${key} measurement.` };
    const min = range.min, max = range.max;
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max > 150 || min > max) {
      return { error: `Enter a valid ${key} range in inches, with the minimum no larger than the maximum.` };
    }
    ranges[key] = { min, max };
  }
  return { value: ranges };
}

function validateListingInput(body = {}, existing = null) {
  const fit = validateFitRanges(body.fitMeasurements);
  if (fit.error) return fit;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const price = Number(body.price);
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  const style = typeof body.style === 'string' ? body.style.trim() : '';
  const size = typeof body.size === 'string' ? body.size.trim() : '';
  const aesthetic = typeof body.aesthetic === 'string' ? body.aesthetic.trim() : '';
  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : '';
  const materials = typeof body.materials === 'string' ? body.materials.trim() : '';
  const careInstructions = typeof body.careInstructions === 'string' ? body.careInstructions.trim() : '';
  const productionType = typeof body.productionType === 'string' ? body.productionType.trim() : 'One of a Kind';
  const availability = typeof body.availability === 'string' ? body.availability.trim() : 'floor';
  const alterationsAvailable = body.alterationsAvailable === true;
  const takesRequests = body.takesRequests === true;
  const seoTitle = typeof body.seoTitle === 'string' ? body.seoTitle.trim() : '';
  const seoDescription = typeof body.seoDescription === 'string' ? body.seoDescription.trim() : '';
  const seoTags = typeof body.seoTags === 'string' ? body.seoTags.trim() : '';
  const shareImageUrl = typeof body.shareImageUrl === 'string' ? body.shareImageUrl.trim() : '';
  const shippingCostCents = body.shippingCostCents === '' || body.shippingCostCents == null ? null : Number(body.shippingCostCents);
  const freeShippingThresholdCents = body.freeShippingThresholdCents === '' || body.freeShippingThresholdCents == null ? null : Number(body.freeShippingThresholdCents);
  const handlingDaysMin = body.handlingDaysMin === '' || body.handlingDaysMin == null ? null : Number(body.handlingDaysMin);
  const handlingDaysMax = body.handlingDaysMax === '' || body.handlingDaysMax == null ? null : Number(body.handlingDaysMax);
  const internationalShipping = body.internationalShipping === true;
  const sku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase() : '';
  const stockQuantity = body.stockQuantity === '' || body.stockQuantity == null ? (productionType === 'One of a Kind' ? 1 : productionType === 'Made to Order' ? 0 : 1) : Number(body.stockQuantity);
  const lowStockThreshold = body.lowStockThreshold === '' || body.lowStockThreshold == null ? 1 : Number(body.lowStockThreshold);

  if (!title || title.length > 120) return { error: 'Provide a valid title between 1 and 120 characters.' };
  if (description.length > 2000) return { error: 'Description must be 2,000 characters or fewer.' };
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid price between 0 and 1,000,000.' };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: 'Choose a supported product category.' };
  if (style.length > 80) return { error: 'Style must be 80 characters or fewer.' };
  if (size.length > 40) return { error: 'Size must be 40 characters or fewer.' };
  if (aesthetic.length > 80) return { error: 'Aesthetic style must be 80 characters or fewer.' };
  if (pattern.length > 80) return { error: 'Print / Pattern must be 80 characters or fewer.' };
  if (materials.length > 500) return { error: 'Materials must be 500 characters or fewer.' };
  if (careInstructions.length > 1000) return { error: 'Care instructions must be 1,000 characters or fewer.' };
  if (!['One of a Kind','Limited Quantity','Made to Order'].includes(productionType)) return { error: 'Choose one of a kind, limited quantity, or made to order.' };
  if (!['floor','backstock'].includes(availability)) return { error: 'Choose floor or backstock availability.' };
  if (seoTitle.length > 70) return { error: 'SEO title must be 70 characters or fewer.' };
  if (seoDescription.length > 180) return { error: 'SEO description must be 180 characters or fewer.' };
  if (seoTags.length > 500) return { error: 'SEO tags must be 500 characters or fewer.' };
  if (shareImageUrl && !/^https?:\/\//i.test(shareImageUrl)) return { error: 'Share image must use an absolute HTTP(S) URL.' };
  if (shippingCostCents !== null && (!Number.isInteger(shippingCostCents) || shippingCostCents < 0 || shippingCostCents > 1000000)) return { error: 'Shipping cost must be a valid amount.' };
  if (freeShippingThresholdCents !== null && (!Number.isInteger(freeShippingThresholdCents) || freeShippingThresholdCents < 0 || freeShippingThresholdCents > 100000000)) return { error: 'Free-shipping threshold must be a valid amount.' };
  if (handlingDaysMin !== null && (!Number.isInteger(handlingDaysMin) || handlingDaysMin < 0 || handlingDaysMin > 365)) return { error: 'Minimum handling days must be between 0 and 365.' };
  if (handlingDaysMax !== null && (!Number.isInteger(handlingDaysMax) || handlingDaysMax < 0 || handlingDaysMax > 365)) return { error: 'Maximum handling days must be between 0 and 365.' };
  if (handlingDaysMin !== null && handlingDaysMax !== null && handlingDaysMax < handlingDaysMin) return { error: 'Maximum handling days cannot be less than minimum handling days.' };
  if (sku && !/^[A-Z0-9._-]{2,64}$/.test(sku)) return { error: 'SKU may use letters, numbers, periods, underscores, and hyphens.' };
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000) return { error: 'Stock quantity must be a whole number between 0 and 100,000.' };
  if (productionType === 'One of a Kind' && stockQuantity !== 1 && !(existing && stockQuantity === 0)) return { error: 'One-of-a-kind pieces must have a stock quantity of exactly 1.' };
  if (productionType === 'Limited Quantity' && stockQuantity < 1 && !existing) return { error: 'Limited-quantity pieces must have at least 1 item in stock.' };
  if (productionType === 'Made to Order' && stockQuantity !== 0) return { error: 'Made-to-order pieces do not use on-hand stock; set stock quantity to 0.' };
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 100000) return { error: 'Low-stock threshold must be a whole number between 0 and 100,000.' };

  return { value: { fitMeasurements: fit.value, title, description, price, category, style, size, aesthetic, pattern, materials, careInstructions, productionType, availability, alterationsAvailable, takesRequests, seoTitle, seoDescription, seoTags, shareImageUrl, shippingCostCents, freeShippingThresholdCents, handlingDaysMin, handlingDaysMax, internationalShipping, sku, stockQuantity, lowStockThreshold } };
}

function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(rootDir, '.data'));
  const configuredAppOrigin = String(options.appOrigin || process.env.APP_ORIGIN || '').replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production' && !configuredAppOrigin) {
    throw new Error('APP_ORIGIN must be configured in production.');
  }
  if (configuredAppOrigin) {
    const parsedAppOrigin = new URL(configuredAppOrigin);
    if (!['http:', 'https:'].includes(parsedAppOrigin.protocol) || parsedAppOrigin.origin !== configuredAppOrigin) {
      throw new Error('APP_ORIGIN must be an absolute HTTP(S) origin without a path.');
    }
  }
  if (process.env.NODE_ENV === 'production' && new URL(configuredAppOrigin).protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production.');
  }
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
      style TEXT,
      pattern TEXT,
      materials TEXT,
      care_instructions TEXT,
      status TEXT NOT NULL CHECK (status IN ('draft','pending_review','published','rejected','archived','deleted')),
      moderation_status TEXT NOT NULL CHECK (moderation_status IN ('pending','approved','rejected')),
      legacy_image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS designer_applications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      portfolio_url TEXT,
      statement TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
      designer_id TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS designer_profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      application_id TEXT UNIQUE,
      stripe_account_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('active','suspended')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES designer_applications(id)
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
      listing_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved','sold','released')),
      reserved_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sold_at TEXT,
      FOREIGN KEY(listing_id) REFERENCES listings(id),
      FOREIGN KEY(order_id) REFERENCES orders(id),
      UNIQUE(listing_id, order_id)
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
  db.exec(`CREATE TABLE IF NOT EXISTS listing_enhancements (
    listing_id TEXT PRIMARY KEY,
    gift_wrap_available INTEGER NOT NULL DEFAULT 0,
    gift_wrap_price_cents INTEGER NOT NULL DEFAULT 0,
    try_on_video_url TEXT,
    movement_video_url TEXT,
    photo_angles TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  function recordMigration(version, name) {
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(version, name, new Date().toISOString());
  }
  recordMigration(1, 'baseline_schema');

  function ensureColumn(table, name, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  ensureColumn('listings', 'moderation_reason', 'TEXT');
  ensureColumn('listings', 'style', 'TEXT');
  ensureColumn('listings', 'fit_measurements', 'TEXT');
  ensureColumn('listings', 'aesthetic', 'TEXT');
  ensureColumn('listings', 'pattern', 'TEXT');
  ensureColumn('listings', 'materials', 'TEXT');
  ensureColumn('listings', 'care_instructions', 'TEXT');
  ensureColumn('listings', 'production_type', 'TEXT');
  ensureColumn('listings', 'availability', "TEXT NOT NULL DEFAULT 'floor'");
  ensureColumn('listings', 'alterations_available', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('listings', 'takes_requests', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('listings', 'size', 'TEXT');
  ensureColumn('designer_applications', 'location', 'TEXT');
  ensureColumn('designer_applications', 'social_url', 'TEXT');
  ensureColumn('designer_applications', 'categories', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('designer_applications', 'price_range', 'TEXT');
  ensureColumn('designer_applications', 'production_method', 'TEXT');
  ensureColumn('designer_applications', 'originality_confirmed', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_applications', 'marketplace_terms_accepted', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_profiles', 'bio', 'TEXT');
  ensureColumn('designer_profiles', 'location', 'TEXT');
  ensureColumn('designer_profiles', 'production_method', 'TEXT');
  ensureColumn('designer_profiles', 'categories', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('designer_profiles', 'portfolio_url', 'TEXT');
  ensureColumn('designer_profiles', 'social_url', 'TEXT');
  ensureColumn('designer_profiles', 'portrait_storage_key', 'TEXT');
  ensureColumn('designer_profiles', 'logo_storage_key', 'TEXT');
  ensureColumn('designer_profiles', 'stripe_payouts_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_profiles', 'stripe_details_submitted', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_profiles', 'stripe_requirements_due', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('designer_profiles', 'stripe_status_checked_at', 'TEXT');
  ensureColumn('orders', 'buyer_email', 'TEXT');
  ensureColumn('orders', 'buyer_subject', 'TEXT');
  ensureColumn('orders', 'cancel_token_hash', 'TEXT');
  ensureColumn('orders', 'stripe_payment_intent_id', 'TEXT');
  ensureColumn('orders', 'payment_provider', "TEXT NOT NULL DEFAULT 'stripe'");
  ensureColumn('orders', 'paypal_order_id', 'TEXT');
  ensureColumn('orders', 'paypal_capture_id', 'TEXT');
  ensureColumn('orders', 'refund_status', 'TEXT');
  ensureColumn('orders', 'stripe_refund_id', 'TEXT');
  ensureColumn('orders', 'refunded_at', 'TEXT');
  ensureColumn('designer_transfers', 'stripe_reversal_id', 'TEXT');
  ensureColumn('designer_transfers', 'payout_success_notified_at', 'TEXT');
  ensureColumn('designer_transfers', 'payout_failure_notified_at', 'TEXT');
  ensureColumn('listings', 'designer_email', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_carrier', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_number', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_submitted_at', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_provider_id', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_status', 'TEXT');
  ensureColumn('designer_transfers', 'tracking_verified_at', 'TEXT');
  ensureColumn('designer_transfers', 'release_reason', 'TEXT');
  recordMigration(2, 'marketplace_profile_order_and_tracking_columns');

  ensureColumn('designer_profiles', 'vacation_mode', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_profiles', 'vacation_message', 'TEXT');
  ensureColumn('designer_profiles', 'vacation_return_at', 'TEXT');
  ensureColumn('listings', 'paused_by_designer', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_transfers', 'shipping_cost_cents', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_transfers', 'delivery_days_min', 'INTEGER');
  ensureColumn('designer_transfers', 'delivery_days_max', 'INTEGER');
  db.exec(`CREATE TABLE IF NOT EXISTS designer_promo_codes (
    id TEXT PRIMARY KEY, designer_id TEXT NOT NULL, code TEXT NOT NULL, discount_type TEXT NOT NULL CHECK(discount_type IN ('percent','fixed')),
    discount_value INTEGER NOT NULL, starts_at TEXT, ends_at TEXT, max_uses INTEGER, active INTEGER NOT NULL DEFAULT 1,
    use_count INTEGER NOT NULL DEFAULT 0, revenue_cents INTEGER NOT NULL DEFAULT 0, discount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, UNIQUE(designer_id,code), FOREIGN KEY(designer_id) REFERENCES designer_profiles(id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS special_order_offers (
    id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, designer_id TEXT NOT NULL, buyer_subject TEXT NOT NULL, title TEXT NOT NULL,
    total_cents INTEGER NOT NULL, deposit_cents INTEGER NOT NULL, lead_days_min INTEGER NOT NULL, lead_days_max INTEGER NOT NULL,
    revisions_included INTEGER NOT NULL DEFAULT 0, terms TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'offered',
    created_at TEXT NOT NULL, accepted_at TEXT, FOREIGN KEY(inquiry_id) REFERENCES listing_inquiries(id)
  )`);
  recordMigration(7, 'seller_commerce_controls');
  ensureColumn('orders','discount_cents','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('order_items','discount_cents','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('order_items','promo_code_id','TEXT');
  ensureColumn('order_items','gift_wrap_selected','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('order_items','gift_wrap_cents','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('designer_transfers','refunded_cents','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('special_order_offers','stripe_session_id','TEXT');
  ensureColumn('special_order_offers','stripe_payment_intent_id','TEXT');
  ensureColumn('special_order_offers','deposit_paid_at','TEXT');
  ensureColumn('special_order_offers','stripe_transfer_id','TEXT');
  ensureColumn('special_order_offers','stripe_refund_id','TEXT');
  recordMigration(8, 'seller_payment_allocations');


  db.exec(`CREATE TABLE IF NOT EXISTS designer_access_tokens (
    token_hash TEXT PRIMARY KEY,
    designer_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(designer_id) REFERENCES designer_profiles(id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS designer_access_tokens_designer ON designer_access_tokens(designer_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','sent','failed')) DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(status,next_attempt_at)');
  recordMigration(3, 'durable_email_outbox');

  db.exec(`CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    session_id TEXT,
    listing_id TEXT,
    listing_name TEXT,
    designer TEXT,
    value REAL,
    currency TEXT,
    search_query TEXT,
    result_count INTEGER,
    item_count INTEGER,
    order_id TEXT,
    source TEXT,
    path TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS analytics_events_name_created ON analytics_events(event_name,created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS analytics_events_session_created ON analytics_events(session_id,created_at)');
  recordMigration(4, 'first_party_commerce_analytics');
  ensureColumn('listings', 'seo_title', 'TEXT');
  ensureColumn('listings', 'seo_description', 'TEXT');
  ensureColumn('listings', 'seo_tags', 'TEXT');
  ensureColumn('listings', 'share_image_url', 'TEXT');
  ensureColumn('listings', 'shipping_cost_cents', 'INTEGER');
  ensureColumn('listings', 'free_shipping_threshold_cents', 'INTEGER');
  ensureColumn('listings', 'handling_days_min', 'INTEGER');
  ensureColumn('listings', 'handling_days_max', 'INTEGER');
  ensureColumn('listings', 'international_shipping', 'INTEGER NOT NULL DEFAULT 0');
  recordMigration(5, 'listing_seo_and_shipping');
  ensureColumn('listings', 'sku', 'TEXT');
  ensureColumn('listings', 'stock_quantity', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('listings', 'low_stock_threshold', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('inventory_reservations', 'quantity', 'INTEGER NOT NULL DEFAULT 1');
  db.exec(`CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL,
    reason TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT, created_at TEXT NOT NULL,
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  ); CREATE INDEX IF NOT EXISTS inventory_adjustments_listing ON inventory_adjustments(listing_id, created_at DESC);`);
  recordMigration(6, 'quantity_inventory');

  db.exec(`CREATE TABLE IF NOT EXISTS support_auto_responses (
    category TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY,
    buyer_subject TEXT NOT NULL,
    buyer_email TEXT,
    order_id TEXT,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','auto_replied','answered','closed')),
    response_text TEXT,
    auto_replied_at TEXT,
    responded_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS support_messages_created ON support_messages(created_at DESC)');
  const supportSeed = db.prepare('INSERT OR IGNORE INTO support_auto_responses (category,enabled,subject_template,body_template,updated_at) VALUES (?,?,?,?,?)');
  const supportSeedAt = new Date().toISOString();
  supportSeed.run('order_status',1,'House of Briar order {{orderId}} update','Thanks for checking on your House of Briar order {{orderId}}. Its current status is {{orderStatus}}.{{trackingLine}}\n\nIf you need anything beyond this status update, reply to this message and a person can review it.',supportSeedAt);
  supportSeed.run('shipping',1,'House of Briar shipping update for {{orderId}}','Here is the latest shipping information for order {{orderId}}.{{trackingLine}}\n\nIf the carrier information does not answer your question, a person can review your request.',supportSeedAt);
  supportSeed.run('general',1,'We received your House of Briar message','Thanks for contacting House of Briar. We received your message and will review it. This automatic acknowledgement does not approve refunds, cancellations, returns, or other account changes.',supportSeedAt);
  supportSeed.run('refund',0,'Your House of Briar refund request','We received your refund request. A person will review it before any refund decision or payment change is made.',supportSeedAt);
  recordMigration(4, 'customer_service_auto_responses');

  db.exec(`CREATE TABLE IF NOT EXISTS designer_identities (
    subject TEXT PRIMARY KEY,
    designer_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    FOREIGN KEY(designer_id) REFERENCES designer_profiles(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    buyer_subject TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed')),
    created_at TEXT NOT NULL,
    paid_at TEXT
  )`);

  ensureColumn('donations', 'buyer_email', 'TEXT');
  ensureColumn('donations', 'payment_provider', "TEXT NOT NULL DEFAULT 'stripe'");
  ensureColumn('donations', 'paypal_order_id', 'TEXT');
  ensureColumn('donations', 'paypal_capture_id', 'TEXT');

  db.exec(`CREATE TABLE IF NOT EXISTS buyer_favorites (
    buyer_subject TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (buyer_subject, listing_id),
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS buyer_favorites_subject_created ON buyer_favorites(buyer_subject, created_at DESC)`);

  db.exec(`CREATE TABLE IF NOT EXISTS collector_notes (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    buyer_subject TEXT NOT NULL,
    designer_id TEXT NOT NULL,
    note TEXT NOT NULL,
    designer_reply TEXT,
    created_at TEXT NOT NULL,
    replied_at TEXT,
    UNIQUE(order_id, listing_id, buyer_subject),
    FOREIGN KEY(listing_id) REFERENCES listings(id),
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(designer_id) REFERENCES designer_profiles(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS collector_notes_listing_created ON collector_notes(listing_id, created_at DESC)`);

  db.exec(`CREATE TABLE IF NOT EXISTS listing_inquiries (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    designer_id TEXT NOT NULL,
    buyer_subject TEXT NOT NULL,
    buyer_email TEXT,
    message TEXT NOT NULL,
    availability_status TEXT NOT NULL DEFAULT 'pending' CHECK (availability_status IN ('pending','available','not_available')),
    created_at TEXT NOT NULL,
    responded_at TEXT,
    FOREIGN KEY(listing_id) REFERENCES listings(id),
    FOREIGN KEY(designer_id) REFERENCES designer_profiles(id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS listing_inquiries_designer_created ON listing_inquiries(designer_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS listing_inquiries_buyer_created ON listing_inquiries(buyer_subject, created_at DESC)`);
  db.exec(`CREATE TABLE IF NOT EXISTS inquiry_messages (
    id TEXT PRIMARY KEY,
    inquiry_id TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('buyer','designer')),
    sender_subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    buyer_read_at TEXT,
    designer_read_at TEXT,
    FOREIGN KEY(inquiry_id) REFERENCES listing_inquiries(id)
  ); CREATE INDEX IF NOT EXISTS inquiry_messages_inquiry_created ON inquiry_messages(inquiry_id, created_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS designer_notifications (
    id TEXT PRIMARY KEY,
    designer_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    listing_id TEXT,
    order_id TEXT,
    inquiry_id TEXT,
    action_path TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(designer_id) REFERENCES designer_profiles(id),
    FOREIGN KEY(listing_id) REFERENCES listings(id),
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(inquiry_id) REFERENCES listing_inquiries(id)
  ); CREATE INDEX IF NOT EXISTS designer_notifications_designer_created ON designer_notifications(designer_id, created_at DESC);`);
  ensureColumn('designer_notifications', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn('designer_notifications', 'source', "TEXT NOT NULL DEFAULT 'system'");
  ensureColumn('designer_notifications', 'admin_label', 'TEXT');
  ensureColumn('designer_notifications', 'event_key', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS designer_notifications_event_key ON designer_notifications(event_key) WHERE event_key IS NOT NULL');
  function notifyDesigner(designerId,type,title,body,links={}) {
    if(!designerId)return null;
    const id=makeId(),now=new Date().toISOString();
    const inserted = db.prepare(`INSERT INTO designer_notifications
      (id,designer_id,type,title,body,listing_id,order_id,inquiry_id,action_path,priority,source,admin_label,event_key,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING`)
      .run(id,designerId,type,title,body,links.listingId||null,links.orderId||null,links.inquiryId||null,links.actionPath||null,links.priority||'normal',links.source||'system',links.adminLabel||null,links.eventKey||null,now);
    return inserted.changes ? id : null;
  }

  function notifyInventoryState(row, eventId, {orderId=null, previousInventory=null}={}) {
    const inventory=listingInventory(row), type=row.production_type||'One of a Kind';
    const links={listingId:row.id,orderId,actionPath:'/account#products',priority:'important'};
    if(type==='One of a Kind' && inventory.availableQuantity===0 && (orderId || previousInventory?.availableQuantity>0)) {
      const sold=inventory.soldQuantity>0;
      notifyDesigner(row.designer_id,sold?'sold_out':'inventory_unavailable',sold?'One-of-a-kind piece sold':'Piece unavailable',
        sold?`${row.title} has sold and is no longer available for checkout.`:`${row.title} is unavailable after an inventory adjustment.`,
        {...links,eventKey:`inventory-unavailable:${row.id}:${eventId}`});
    }
    const threshold=Number(row.low_stock_threshold??1);
    if(type==='Limited Quantity' && inventory.availableQuantity<=threshold &&
        (!previousInventory || previousInventory.availableQuantity>threshold))
      notifyDesigner(row.designer_id,'low_stock','Low stock',`${row.title} has ${inventory.availableQuantity} available.`,
        {...links,eventKey:`low-stock:${row.id}:${eventId}`});
  }

  db.exec(`CREATE TABLE IF NOT EXISTS user_badges (
    buyer_subject TEXT NOT NULL,
    badge_type TEXT NOT NULL CHECK (badge_type IN ('supporter','verified_buyer')),
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    awarded_at TEXT NOT NULL,
    PRIMARY KEY (buyer_subject, badge_type),
    UNIQUE (badge_type, source_type, source_id)
  )`);
  function awardBadge(subject,badgeType,sourceType,sourceId){if(!subject||!sourceId)return;db.prepare('INSERT OR IGNORE INTO user_badges (buyer_subject,badge_type,source_type,source_id,awarded_at) VALUES (?,?,?,?,?)').run(subject,badgeType,sourceType,sourceId,new Date().toISOString());}
  function badgeSubjectForEmail(email){
    const normalized=typeof email==='string'?email.trim().toLowerCase():'';
    if(!normalized)return null;
    const identity=db.prepare(`SELECT di.subject FROM designer_identities di JOIN designer_profiles dp ON dp.id=di.designer_id WHERE lower(dp.email)=? AND dp.status='active'`).get(normalized);
    if(identity?.subject)return identity.subject;
    const designer=db.prepare("SELECT id FROM designer_profiles WHERE lower(email)=? AND status='active'").get(normalized);
    return designer ? designerBadgeSubject(designer.id) : null;
  }
  function reconcileVerifiedBuyerBadges(){
    const paid=db.prepare("SELECT id,buyer_subject,buyer_email FROM orders WHERE status='paid'").all();
    let awarded=0;
    for(const order of paid){const subject=order.buyer_subject||badgeSubjectForEmail(order.buyer_email);if(!subject)continue;const before=db.prepare("SELECT 1 FROM user_badges WHERE buyer_subject=? AND badge_type='verified_buyer'").get(subject);awardBadge(subject,'verified_buyer','order',order.id);if(!before)awarded++;}
    return awarded;
  }
  const reconciledBuyerBadges = reconcileVerifiedBuyerBadges();
  if (reconciledBuyerBadges) log('info','buyer_badges_reconciled',{awarded:reconciledBuyerBadges});

  const designerTokens = parseDesignerTokens(options.designerTokens ?? process.env.DESIGNER_TOKENS_JSON);
  // Legacy/configured designer tokens predate designer_profiles. Backfill active profiles so
  // existing sellers and test fixtures remain public/purchasable; never overwrite an explicit
  // profile because its suspended status must remain authoritative.
  const ensureLegacyDesigner = db.prepare(`INSERT OR IGNORE INTO designer_profiles
    (id,email,display_name,brand_name,status,created_at) VALUES (?,?,?,?, 'active', ?)`);
  const legacyProfileNow = new Date().toISOString();
  for (const designerId of new Set(Object.values(designerTokens).map(value => String(value || '').trim()).filter(Boolean))) {
    ensureLegacyDesigner.run(designerId, `${designerId}@legacy.houseofbriar.invalid`, designerId, designerId, legacyProfileNow);
  }
  const adminTokens = [options.adminToken ?? process.env.ADMIN_TOKEN ?? '', ...(process.env.ADMIN_TOKENS || '').split(',')]
    .map(value => String(value || '').trim()).filter(Boolean);
  const designerIdentityMap = parseDesignerTokens(options.designerIdentityMap ?? process.env.DESIGNER_IDENTITY_MAP_JSON);
  const reviewRequired = options.reviewRequired ?? process.env.REVIEW_REQUIRED !== 'false';

  const seedProducts = options.seedProducts || JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed-products.json'), 'utf8'));
  // Retire the original demo catalog and the $1 Tulips test garment from persistent
  // production databases. Seed insertion is idempotent, so the real Loom Briar
  // garments below remain stable across Railway restarts and redeploys.
  const retiredSeedIds = [
    'seed-wildflower-runner',
    'seed-rose-oat-soak',
    'seed-golden-hour-set',
    'seed-stoneware-mug-duo',
    '48a0cc6f-e6ac-4538-8a9f-a4889ce21c4c'
  ];
  const retireSeed = db.prepare("UPDATE listings SET status = 'archived', updated_at = ? WHERE id = ? AND status != 'deleted'");
  const retireSeedNow = new Date().toISOString();
  for (const id of retiredSeedIds) retireSeed.run(retireSeedNow, id);
  const insertSeed = db.prepare(`
    INSERT OR IGNORE INTO listings (
      id, designer_id, title, description, price, category, status, moderation_status,
      legacy_image_url, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', 'approved', ?, ?, ?, ?)
  `);
  const seedTx = db.transaction((rows) => {
    const now = new Date().toISOString();
    for (const row of rows) {
      const designerId = row.designerId || 'house-of-briar';
      ensureLegacyDesigner.run(designerId, `${designerId}@legacy.houseofbriar.invalid`, designerId, designerId, now);
      insertSeed.run(
        row.id,
        designerId,
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
  // Retire old demo/seed garments. The live catalog should contain only designer-uploaded listings.
  db.prepare(`UPDATE listings
    SET status = 'archived', moderation_status = 'rejected', moderation_reason = 'Retired legacy seed listing', updated_at = ?
    WHERE status != 'deleted' AND id IN ('loom-briar-lavender-palm-outfit','loom-briar-golden-velvet-top','loom-briar-lucky-outfit')`).run(new Date().toISOString());

  function log(level, event, details = {}) {
    const payload = { timestamp: new Date().toISOString(), level, event, ...details };
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line); else console.log(line);
  }

  function fail(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
  }

  function validOptionalHttpUrl(value) {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch { return false; }
  }

  function rateLimit({ windowMs, max, keyPrefix }) {
    const hits = new Map();
    return (req, res, next) => {
      const now = Date.now();
      const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
      entry.count += 1;
      hits.set(key, entry);
      if (entry.count > max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
        return fail(res, 429, 'rate_limited', 'Too many requests. Please try again shortly.');
      }
      if (hits.size > 5000) for (const [storedKey, stored] of hits) if (stored.resetAt <= now) hits.delete(storedKey);
      return next();
    };
  }

  const reportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'listing-report' });
  const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'signup' });
  const checkoutLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: 'checkout' });

  function trustedAppOrigin(req) {
    return configuredAppOrigin || `${req.protocol}://${req.get('host')}`;
  }

  function isSameOriginUrl(value, origin) {
    try { return new URL(value).origin === new URL(origin).origin; } catch { return false; }
  }

  async function resolveDesignerIdentity(req, token) {
    if (typeof options.resolveIdentity === 'function') return options.resolveIdentity({ req, token });
    const origin = trustedAppOrigin(req);
    const discovery = await fetch(`${origin}/_genesis/auth/.well-known/openid-configuration`);
    if (!discovery.ok) return null;
    const metadata = await discovery.json();
    if (typeof metadata.userinfo_endpoint !== 'string' || !isSameOriginUrl(metadata.userinfo_endpoint, origin)) return null;
    const userInfo = await fetch(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!userInfo.ok) return null;
    return userInfo.json();
  }

  function designerBadgeSubject(designerId) {
    return db.prepare('SELECT subject FROM designer_identities WHERE designer_id=?').get(designerId)?.subject || `designer:${designerId}`;
  }

  async function resolveBuyerIdentity(req, token) {
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    const access=db.prepare("SELECT t.designer_id FROM designer_access_tokens t JOIN designer_profiles p ON p.id=t.designer_id WHERE t.token_hash=? AND p.status='active'").get(hash);
    const configured=Object.entries(designerTokens).find(([key])=>safeEqual(token,key))?.[1];
    const id=access?.designer_id||configured;
    if(id){
      const designer=db.prepare("SELECT id,email FROM designer_profiles WHERE id=? AND status='active'").get(id);
      return designer ? {sub:designerBadgeSubject(id),email:designer.email,designerId:id} : null;
    }
    return resolveDesignerIdentity(req,token);
  }

  async function authBuyer(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in to view your orders.');
    try {
      const profile = await resolveBuyerIdentity(req, token);
      if (!profile || typeof profile.sub !== 'string' || !profile.sub.trim()) return fail(res, 401, 'unauthorized', 'Your account session is no longer valid.');
      req.buyerSubject = profile.sub.trim();
      req.buyerEmail = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      return next();
    } catch { return fail(res, 401, 'unauthorized', 'Your account session is no longer valid.'); }
  }

  async function authDesigner(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in to your designer account.');

    for (const [configuredToken, designerId] of Object.entries(designerTokens)) {
      if (safeEqual(token, configuredToken) && typeof designerId === 'string' && designerId.trim()) {
        const legacyDesignerId = designerId.trim();
        const profile = db.prepare('SELECT status FROM designer_profiles WHERE id = ?').get(legacyDesignerId);
        if (profile && profile.status !== 'active') return fail(res, 403, 'designer_inactive', 'This designer profile is not active.');
        req.designerId = legacyDesignerId;
        return next();
      }
    }

    try {
      const profile = await resolveDesignerIdentity(req, token);
      if (!profile) return fail(res, 401, 'unauthorized', 'Your designer session is no longer valid.');
      if (typeof profile.sub !== 'string' || !profile.sub.trim()) return fail(res, 401, 'unauthorized', 'Designer identity is missing.');
      const subject = profile.sub.trim();
      const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      let mappedDesignerId = designerIdentityMap[subject];
      if (typeof mappedDesignerId !== 'string' || !mappedDesignerId.trim()) {
        const linked = db.prepare('SELECT designer_id FROM designer_identities WHERE subject=?').get(subject);
        mappedDesignerId = linked?.designer_id || '';
      }
      if ((!mappedDesignerId || !mappedDesignerId.trim()) && email && profile.email_verified === true) {
        const designer = db.prepare("SELECT id FROM designer_profiles WHERE lower(email)=? AND status='active'").get(email);
        if (designer) {
          try {
            db.prepare('INSERT INTO designer_identities (subject,designer_id,email,linked_at) VALUES (?,?,?,?)').run(subject,designer.id,email,new Date().toISOString());
            mappedDesignerId = designer.id;
          } catch {
            const linked = db.prepare('SELECT designer_id FROM designer_identities WHERE subject=?').get(subject);
            mappedDesignerId = linked?.designer_id || '';
          }
        }
      }
      if (typeof mappedDesignerId !== 'string' || !mappedDesignerId.trim()) {
        return fail(res, 403, 'designer_not_linked', 'This signed-in account is not linked to a House of Briar designer profile.');
      }
      mappedDesignerId = mappedDesignerId.trim();
      const activeDesigner = db.prepare("SELECT id FROM designer_profiles WHERE id = ? AND status = 'active'").get(mappedDesignerId);
      if (!activeDesigner) {
        return fail(res, 403, 'designer_inactive', 'This designer profile is not active.');
      }
      req.designerId = mappedDesignerId;
      req.designerSubject = subject;
      req.designerEmail = email;
      if (email) db.prepare('UPDATE listings SET designer_email = ? WHERE designer_id = ?').run(email, req.designerId);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  function authAdmin(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Administrator authentication is required.');
    if (!adminTokens.length || !adminTokens.some(candidate => safeEqual(token, candidate))) {
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
      url: mode === 'public' ? `/media/${encodeURIComponent(image.id)}` : mode === 'admin' ? `/api/admin/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image.id)}/content` : `/api/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image.id)}/content`,
      legacy: false,
    }));
  }

  // stock_quantity is the total admitted to the ledger, including sold units.
  // Sales consume reservations rather than decrementing this stored total.
  function listingInventory(row) {
    const quantities = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status='reserved' THEN quantity ELSE 0 END),0) reserved,
      COALESCE(SUM(CASE WHEN status='sold' THEN quantity ELSE 0 END),0) sold
      FROM inventory_reservations WHERE listing_id=?`).get(row.id);
    const reserved = Number(quantities.reserved), sold = Number(quantities.sold);
    const tracked = (row.production_type || 'One of a Kind') !== 'Made to Order';
    return { reservedQuantity: reserved, soldQuantity: sold,
      availableQuantity: tracked ? Math.max(0, Number(row.stock_quantity ?? 0) - reserved - sold) : null };
  }

  function inventoryChangeError(row, quantity, productionType = row.production_type || 'One of a Kind') {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100000)
      return { code: 'invalid_stock', message: 'Inventory total must be a whole number between 0 and 100,000.' };
    const inventory = listingInventory(row);
    if (productionType === 'Made to Order' && inventory.reservedQuantity + inventory.soldQuantity > 0)
      return { code: 'committed_inventory', message: 'A listing with reserved or sold units cannot switch to made to order.' };
    if (quantity < inventory.reservedQuantity + inventory.soldQuantity)
      return { code: 'reserved_inventory', message: 'Inventory total cannot be reduced below sold units plus active secure-checkout reservations.' };
    return null;
  }

  function serializeListing(row, mode = 'public') {
    if (!row) return null;
    const designer = db.prepare('SELECT brand_name, display_name, logo_storage_key FROM designer_profiles WHERE id = ?').get(row.designer_id);
    const inventory = listingInventory(row);
    const designerBadges = db.prepare('SELECT DISTINCT badge_type FROM user_badges WHERE buyer_subject IN (?,?) ORDER BY awarded_at').all(designerBadgeSubject(row.designer_id),`designer:${row.designer_id}`).map(badge => badge.badge_type);
    const enhancement = db.prepare('SELECT * FROM listing_enhancements WHERE listing_id=?').get(row.id) || {};
    let photoAngles=[]; try { photoAngles=JSON.parse(enhancement.photo_angles || '[]'); } catch {}
    const images = getImages(row.id, mode).map((image,index)=>({ ...image, angle: String(photoAngles[index] || '') }));
    const primaryImage = images[0] || (row.legacy_image_url ? { url: row.legacy_image_url, legacy: true, id: `legacy-${row.id}` } : null);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      style: row.style || '',
      size: row.size || '',
      fitMeasurements: (() => { try { return JSON.parse(row.fit_measurements || '{}'); } catch { return {}; } })(),
      aesthetic: row.aesthetic || '',
      pattern: row.pattern || '',
      materials: row.materials || '',
      careInstructions: row.care_instructions || '',
      productionType: row.production_type || '',
      availability: row.availability || 'floor',
      alterationsAvailable: Boolean(row.alterations_available),
      takesRequests: Boolean(row.takes_requests),
      giftWrapAvailable: Boolean(enhancement.gift_wrap_available),
      giftWrapPrice: Number(enhancement.gift_wrap_price_cents || 0) / 100,
      tryOnVideoUrl: enhancement.try_on_video_url || '',
      movementVideoUrl: enhancement.movement_video_url || '',
      seoTitle: row.seo_title || '',
      seoDescription: row.seo_description || '',
      seoTags: row.seo_tags || '',
      shareImageUrl: row.share_image_url || '',
      shippingCostCents: row.shipping_cost_cents == null ? null : Number(row.shipping_cost_cents),
      freeShippingThresholdCents: row.free_shipping_threshold_cents == null ? null : Number(row.free_shipping_threshold_cents),
      handlingDaysMin: row.handling_days_min == null ? null : Number(row.handling_days_min),
      handlingDaysMax: row.handling_days_max == null ? null : Number(row.handling_days_max),
      internationalShipping: Boolean(row.international_shipping),
      sku: row.sku || '',
      stockQuantity: Number(row.stock_quantity ?? 0),
      lowStockThreshold: Number(row.low_stock_threshold ?? 1),
      ...inventory,
      lowStock: inventory.availableQuantity !== null && inventory.availableQuantity <= Number(row.low_stock_threshold ?? 1),
      pausedByDesigner: Boolean(row.paused_by_designer),
      version: Number(row.version),
      designerId: row.designer_id,
      designerName: designer?.brand_name || designer?.display_name || row.designer_name || row.designer_id,
      designerLogoUrl: designer?.logo_storage_key ? `/media/designers/${encodeURIComponent(row.designer_id)}/logo` : null,
      badges: designerBadges,
      supporterBadge: designerBadges.includes('supporter'),
      verifiedBuyer: designerBadges.includes('verified_buyer'),
      status: row.status,
      moderationStatus: row.moderation_status,
      moderationReason: mode === 'private' ? (row.moderation_reason || null) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      imageUrl: primaryImage?.url || null,
      primaryImage,
      images
    };
  }

  async function deleteListingAndImages(row) {
    const images = db.prepare("SELECT id, storage_key FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").all(row.id);
    const timestamp = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE listing_images SET upload_status = 'deleted', deleted_at = ? WHERE listing_id = ? AND upload_status = 'ready'").run(timestamp, row.id);
      db.prepare("UPDATE listings SET status = 'deleted', moderation_status = 'rejected', moderation_reason = 'Listing deleted', published_at = NULL, updated_at = ?, version = version + 1 WHERE id = ?").run(timestamp, row.id);
    })();
    await Promise.all(images.map((image) => fs.promises.unlink(path.join(imagesDir, image.storage_key)).catch(() => {})));
  }

  function ownedEditableListing(req, res) {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') {
      fail(res, 404, 'not_found', 'Listing not found.');
      return null;
    }
    if (!['draft', 'rejected', 'published'].includes(row.status)) {
      fail(res, 409, 'not_editable', 'Only draft, rejected, or published listings can be edited.');
      return null;
    }
    return row;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
  });
  const fabricFinderUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 3 }
  });

  async function moderateDesignerImage(buffer,mimeType,context='designer upload') {
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey)throw Object.assign(new Error('Image safety review is temporarily unavailable.'),{statusCode:503});
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({
      model:process.env.IMAGE_MODERATION_MODEL||'gpt-6-luna',
      input:[{role:'user',content:[
        {type:'input_text',text:'Review this '+context+' for a family-friendly independent fashion marketplace. Return JSON only with allow (boolean), needsHumanReview (boolean), and reason (short string). Reject or require human review for sexual/nude imagery, graphic violence/gore, hateful/extremist symbols or propaganda, illegal-drug promotion, weapons promotion, harassment/threats, explicit profanity directed at a person/group, or imagery that appears intended to scam or impersonate. Ordinary clothing, bodies wearing normal clothing, art, brand logos, and product photography are allowed. When genuinely uncertain, set needsHumanReview true.'},
        {type:'input_image',image_url:'data:'+mimeType+';base64,'+buffer.toString('base64'),detail:'low'}
      ]}],
      text:{format:{type:'json_object'}},max_output_tokens:220
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error('Image safety review could not be completed.'),{statusCode:503});
    const outputText=payload.output_text||payload.output?.flatMap?.(o=>o.content||[]).find?.(x=>x.type==='output_text')?.text;
    let result;try{result=JSON.parse(outputText||'{}');}catch{throw Object.assign(new Error('Image safety review could not be completed.'),{statusCode:503});}
    return {allow:result.allow===true,needsHumanReview:result.needsHumanReview===true,reason:String(result.reason||'Image requires review.').slice(0,300)};
  }

  let app;
  app = express();
  app.disable('x-powered-by');

  app.post('/api/easypost/webhook', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
    try {
      const secret = process.env.EASYPOST_WEBHOOK_SECRET;
      const timestamp = req.get('x-timestamp') || '';
      const signedPath = req.get('x-path') || '';
      const supplied = req.get('x-hmac-signature-v2') || '';
      if (!secret || !timestamp || !signedPath || !supplied) {
        return res.status(401).json({ error: { code: 'invalid_webhook', message: 'EasyPost webhook signature headers are missing.' } });
      }

      // EasyPost HMAC v2 signs timestamp + uppercase method + x-path + exact raw body.
      const sentAt = Date.parse(timestamp);
      const now = Date.now();
      if (!Number.isFinite(sentAt) || sentAt < now - 60_000 || sentAt > now + 30_000) {
        return res.status(401).json({ error: { code: 'invalid_webhook', message: 'EasyPost webhook timestamp is outside the allowed window.' } });
      }
      if (signedPath !== req.originalUrl) {
        return res.status(401).json({ error: { code: 'invalid_webhook', message: 'EasyPost webhook path does not match.' } });
      }
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const stringToSign = Buffer.concat([
        Buffer.from(timestamp + req.method.toUpperCase() + signedPath, 'utf8'),
        rawBody
      ]);
      const expected = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
      const signature = supplied.replace(/^hmac-sha256-hex=/i, '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(signature) || !safeEqual(expected, signature)) {
        return res.status(401).json({ error: { code: 'invalid_webhook', message: 'Invalid EasyPost webhook signature.' } });
      }

      let event;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ error: { code: 'invalid_webhook', message: 'EasyPost webhook body is not valid JSON.' } });
      }
      if (event?.object !== 'Event' || event?.description !== 'tracker.updated') return res.json({ received: true, ignored: true });

      const tracker = event.result;
      if (!tracker?.id) return res.json({ received: true, ignored: true });

      const transfer = db.prepare('SELECT * FROM designer_transfers WHERE tracking_provider_id = ?').get(tracker.id);
      if (!transfer || transfer.status === 'paid') return res.json({ received: true, ignored: true });

      const accepted = new Set(['in_transit','out_for_delivery','delivered','available_for_pickup']);
      const hasEvent = Array.isArray(tracker.tracking_details) && tracker.tracking_details.length > 0;
      const verifiedAt = accepted.has(tracker.status) && hasEvent ? new Date().toISOString() : null;
      db.prepare('UPDATE designer_transfers SET tracking_status = ?, tracking_verified_at = COALESCE(tracking_verified_at, ?) WHERE id = ?').run(tracker.status || 'unknown', verifiedAt, transfer.id);
      if (verifiedAt) notifyDesigner(transfer.designer_id,'tracking_verified','Tracking verified',`Carrier tracking for order ${transfer.order_id} is verified. Your payout can now be released.`,{orderId:transfer.order_id,actionPath:'/account#orders',eventKey:`tracking-verified:${transfer.id}`});
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
        const specialOfferId=session?.metadata?.special_offer_id;
        if(specialOfferId&&session.payment_status==='paid'){
          const offer=db.prepare('SELECT * FROM special_order_offers WHERE id=? AND stripe_session_id=?').get(specialOfferId,session.id);
          if(offer&&Number(session.amount_total)===offer.deposit_cents&&String(session.currency||'').toLowerCase()==='usd'&&offer.status==='offered'){
            const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:null;
            db.prepare("UPDATE special_order_offers SET status='deposit_paid',accepted_at=?,deposit_paid_at=?,stripe_payment_intent_id=? WHERE id=?").run(new Date().toISOString(),new Date().toISOString(),paymentIntent,offer.id);
            const accountId=designerStripeAccount(offer.designer_id),designerShare=Math.max(0,offer.deposit_cents-Math.round(offer.deposit_cents*.10));
            if(accountId&&designerShare>0){try{const transfer=await stripeApi('transfers',{method:'POST',body:new URLSearchParams({amount:String(designerShare),currency:'usd',destination:accountId,transfer_group:`special-${offer.id}`,'metadata[special_offer_id]':offer.id,'metadata[designer_id]':offer.designer_id}).toString(),idempotencyKey:`hob-special-transfer-${offer.id}`});db.prepare('UPDATE special_order_offers SET stripe_transfer_id=? WHERE id=?').run(transfer.id,offer.id);}catch(error){console.error('Special order deposit transfer failed:',offer.id,error);}}
            notifyDesigner(offer.designer_id,'special_order_deposit','Special-order deposit paid',`The deposit for ${offer.title} has been paid. Lead time: ${offer.lead_days_min}–${offer.lead_days_max} days.`,{inquiryId:offer.inquiry_id,actionPath:'/account#inquiries',priority:'important',eventKey:`special-deposit:${offer.id}`});
          }
        }
        const orderId = session?.metadata?.order_id;
        if (orderId) releaseOrderInventory(orderId);
      }
      if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data?.object;
        const donationId = session?.metadata?.donation_id;
        if (donationId) db.prepare("UPDATE donations SET status='failed' WHERE id=? AND stripe_session_id=? AND status!='paid'").run(donationId, session.id);
        const orderId = session?.metadata?.order_id;
        if (orderId) {
          const order = db.prepare('SELECT * FROM orders WHERE id=? AND stripe_session_id=?').get(orderId, session.id);
          if (order && order.status !== 'paid') {
            db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(order.id);
            releaseOrderInventory(order.id);
          }
        }
      }
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data?.object;
        const donationId=session?.metadata?.donation_id;
        if(donationId&&session.payment_status==='paid'){
          const donation=db.prepare('SELECT * FROM donations WHERE id=? AND stripe_session_id=?').get(donationId,session.id);
          if(donation){
            const currency=typeof session.currency==='string'?session.currency.toLowerCase():'',total=Number(session.amount_total);
            if(currency!==donation.currency||!Number.isInteger(total)||total!==donation.amount_cents)return res.status(400).send('Donation payment does not match this donation.');
            if(donation.status!=='paid')db.prepare("UPDATE donations SET status='paid',paid_at=? WHERE id=?").run(new Date().toISOString(),donation.id);
            confirmDonationBadge(donation,session);
          }
        }
        const orderId = session?.metadata?.order_id;
        if (orderId && session.payment_status === 'paid') {
          const order = db.prepare('SELECT * FROM orders WHERE id = ? AND stripe_session_id = ?').get(orderId, session.id);
          if (order) {
            const sessionCurrency = typeof session.currency === 'string' ? session.currency.toLowerCase() : '';
            const sessionTotal = Number(session.amount_total);
            if (sessionCurrency !== String(order.currency).toLowerCase() || !Number.isInteger(sessionTotal) || sessionTotal !== order.subtotal_cents) {
              console.error('Stripe Checkout payment did not match order totals:', order.id);
              return res.status(400).send('Checkout payment does not match this order.');
            }
            if (order.status === 'canceled' || order.status === 'failed') {
              console.error('Stripe Checkout payment arrived for a closed order:', order.id);
              return res.status(409).send('Checkout order is no longer payable.');
            }
            const checkoutEmail = session.customer_details?.email || session.customer_email || null;
            if (order.status !== 'paid') db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, buyer_email = COALESCE(?, buyer_email), stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id) WHERE id = ?").run(new Date().toISOString(), checkoutEmail, session.payment_intent || null, order.id);
            const badgeSubject = order.buyer_subject || badgeSubjectForEmail(checkoutEmail || order.buyer_email);
            if (badgeSubject) awardBadge(badgeSubject,'verified_buyer','order',order.id);
            markOrderInventorySold(order.id);
            await prepareDesignerTransfers(order.id);
            await notifySale(order.id);
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

  app.post('/api/listings/:listingId/inquiries', authBuyer, (req,res)=>{
    const listing=db.prepare(`SELECT l.id,l.title,l.designer_id,p.email AS designer_email FROM listings l JOIN designer_profiles p ON p.id=l.designer_id WHERE l.id=? AND l.status='published' AND p.status='active'`).get(req.params.listingId);
    if(!listing)return fail(res,404,'listing_not_found','This listing is not available for inquiries.');
    const message=String(req.body?.message||'').trim();
    if(!message||message.length>800)return fail(res,422,'validation_error','Write a message between 1 and 800 characters.');
    const id=makeId(),now=new Date().toISOString();
    db.prepare(`INSERT INTO listing_inquiries (id,listing_id,designer_id,buyer_subject,buyer_email,message,created_at) VALUES (?,?,?,?,?,?,?)`).run(id,listing.id,listing.designer_id,req.buyerSubject,req.buyerEmail||null,message,now);
    db.prepare("INSERT INTO inquiry_messages(id,inquiry_id,sender_role,sender_subject,message,created_at,buyer_read_at) VALUES (?,?,'buyer',?,?,?,?)").run(makeId(),id,req.buyerSubject,message,now,now);
    notifyDesigner(listing.designer_id,'customer_message',`New question about ${listing.title}`,message,{listingId:listing.id,inquiryId:id,actionPath:'/account#messages'});
    void sendEmail({to:listing.designer_email,subject:`New House of Briar inquiry: ${listing.title}`,text:`A customer sent a question about ${listing.title}.\n\n${message}\n\nOpen your Designer Studio to respond Available or Not available.`});
    return res.status(201).json({inquiry:{id,listingId:listing.id,title:listing.title,message,availabilityStatus:'pending',createdAt:now}});
  });

  function inquiryThread(inquiryId) {
    return db.prepare("SELECT id,sender_role,message,created_at,buyer_read_at,designer_read_at FROM inquiry_messages WHERE inquiry_id=? ORDER BY created_at ASC").all(inquiryId)
      .map(m=>({id:m.id,senderRole:m.sender_role,message:m.message,createdAt:m.created_at,buyerReadAt:m.buyer_read_at,designerReadAt:m.designer_read_at}));
  }
  app.post('/api/my/inquiries/:inquiryId/messages', authBuyer, (req,res)=>{
    const inquiry=db.prepare('SELECT i.*,l.title FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id WHERE i.id=? AND i.buyer_subject=?').get(req.params.inquiryId,req.buyerSubject);
    if(!inquiry)return fail(res,404,'inquiry_not_found','Conversation not found.');
    const message=String(req.body?.message||'').trim(); if(!message||message.length>1200)return fail(res,422,'validation_error','Write a message between 1 and 1200 characters.');
    const id=makeId(),now=new Date().toISOString();
    db.prepare("INSERT INTO inquiry_messages(id,inquiry_id,sender_role,sender_subject,message,created_at,buyer_read_at) VALUES (?,?,'buyer',?,?,?,?)").run(id,inquiry.id,req.buyerSubject,message,now,now);
    notifyDesigner(inquiry.designer_id,'customer_message',`New reply about ${inquiry.title}`,message,{listingId:inquiry.listing_id,inquiryId:inquiry.id,actionPath:'/account#messages'});
    return res.status(201).json({message:{id,senderRole:'buyer',message,createdAt:now}});
  });
  app.post('/api/my/designer-inquiries/:inquiryId/messages', authDesigner, (req,res)=>{
    const inquiry=db.prepare('SELECT i.*,l.title FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id WHERE i.id=? AND i.designer_id=?').get(req.params.inquiryId,req.designerId);
    if(!inquiry)return fail(res,404,'inquiry_not_found','Conversation not found.');
    const message=String(req.body?.message||'').trim(); if(!message||message.length>1200)return fail(res,422,'validation_error','Write a message between 1 and 1200 characters.');
    const id=makeId(),now=new Date().toISOString();
    db.prepare("INSERT INTO inquiry_messages(id,inquiry_id,sender_role,sender_subject,message,created_at,designer_read_at) VALUES (?,?,'designer',?,?,?,?)").run(id,inquiry.id,req.designerId,message,now,now);
    if(inquiry.buyer_email)void sendEmail({to:inquiry.buyer_email,subject:`House of Briar: reply about ${inquiry.title}`,text:`The designer replied to your House of Briar conversation about ${inquiry.title}. Open your account to read and respond.`});
    return res.status(201).json({message:{id,senderRole:'designer',message,createdAt:now}});
  });

  app.get('/api/my/inquiries', authBuyer, (req,res)=>{
    const inquiries=db.prepare(`SELECT i.id,i.listing_id,i.message,i.availability_status,i.created_at,i.responded_at,l.title,p.brand_name,p.display_name
      FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id JOIN designer_profiles p ON p.id=i.designer_id
      WHERE i.buyer_subject=? ORDER BY i.created_at DESC LIMIT 100`).all(req.buyerSubject);
    return res.json({inquiries:inquiries.map(i=>({id:i.id,listingId:i.listing_id,title:i.title,designerName:i.brand_name||i.display_name,message:i.message,availabilityStatus:i.availability_status,createdAt:i.created_at,respondedAt:i.responded_at,messages:inquiryThread(i.id)}))});
  });

  app.get('/api/my/designer-inquiries', authDesigner, (req,res)=>{
    const inquiries=db.prepare(`SELECT i.id,i.listing_id,i.buyer_email,i.message,i.availability_status,i.created_at,i.responded_at,l.title
      FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id WHERE i.designer_id=? ORDER BY i.created_at DESC LIMIT 100`).all(req.designerId);
    return res.json({inquiries:inquiries.map(i=>({id:i.id,listingId:i.listing_id,title:i.title,message:i.message,availabilityStatus:i.availability_status,createdAt:i.created_at,respondedAt:i.responded_at,messages:inquiryThread(i.id)}))});
  });

  app.patch('/api/my/designer-inquiries/:inquiryId', authDesigner, (req,res)=>{
    const status=String(req.body?.availabilityStatus||'');
    if(!['available','not_available'].includes(status))return fail(res,422,'validation_error','Choose Available or Not available.');
    const inquiry=db.prepare(`SELECT i.*,l.title FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id WHERE i.id=? AND i.designer_id=?`).get(req.params.inquiryId,req.designerId);
    if(!inquiry)return fail(res,404,'inquiry_not_found','Inquiry not found.');
    const now=new Date().toISOString();
    db.prepare('UPDATE listing_inquiries SET availability_status=?,responded_at=? WHERE id=?').run(status,now,inquiry.id);
    if(inquiry.buyer_email)void sendEmail({to:inquiry.buyer_email,subject:`House of Briar: ${inquiry.title} is ${status==='available'?'available':'not available'}`,text:`The designer responded to your inquiry about ${inquiry.title}: ${status==='available'?'Available':'Not available'}.\n\nOpen your House of Briar account to view the response.`});
    return res.json({inquiry:{id:inquiry.id,availabilityStatus:status,respondedAt:now}});
  });

  app.post('/api/designer-applications', signupLimiter, (req, res) => {
    const email=String(req.body?.email||'').trim().toLowerCase();
    const displayName=String(req.body?.displayName||'').trim();
    const brandName=String(req.body?.brandName||'').trim();
    const categories=Array.isArray(req.body?.categories)?[...new Set(req.body.categories.map(value=>String(value).trim()).filter(Boolean))]:[];
    const sellerTermsAccepted=req.body?.sellerTermsAccepted===true;

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!displayName||displayName.length>100||!brandName||brandName.length>120||categories.length<1||categories.length>12||categories.some(value=>value.length>80)){
      return fail(res,422,'validation_error','Add your name, designer or brand name, email, and what you create.');
    }
    if(!sellerTermsAccepted)return fail(res,422,'seller_terms_required','You must agree to the House of Briar Seller Terms before joining.');

    const existingProfile=db.prepare("SELECT id,email,display_name,brand_name,status,logo_storage_key FROM designer_profiles WHERE lower(email)=?").get(email);
    if(existingProfile)return res.status(409).json({error:{code:'designer_exists',message:'A designer account already exists for this email.'},designer:{id:existingProfile.id,status:existingProfile.status}});

    const existing=db.prepare("SELECT id,status,designer_id FROM designer_applications WHERE email=?").get(email);
    if(existing)return res.status(409).json({error:{code:'signup_exists',message:'Designer sign up is already complete for this email.'},signup:{id:existing.id,status:existing.status,designerId:existing.designer_id}});

    const id=makeId(),designerId='designer-'+makeId(),now=new Date().toISOString();
    const accessToken='hob_'+crypto.randomBytes(32).toString('base64url');
    const accessTokenHash=crypto.createHash('sha256').update(accessToken).digest('hex');
    db.transaction(()=>{
      db.prepare("INSERT INTO designer_applications (id,email,display_name,brand_name,portfolio_url,statement,status,designer_id,created_at,reviewed_at,location,social_url,categories,price_range,production_method,originality_confirmed,marketplace_terms_accepted) VALUES (?,?,?,?,NULL,'','approved',?,?,?,NULL,NULL,?,NULL,NULL,1,1)").run(id,email,displayName,brandName,designerId,now,now,JSON.stringify(categories));
      db.prepare("INSERT INTO designer_profiles (id,email,display_name,brand_name,application_id,status,created_at,bio,location,production_method,categories,portfolio_url,social_url) VALUES (?,?,?,?,?,'active',?,NULL,NULL,NULL,?,NULL,NULL)").run(designerId,email,displayName,brandName,id,now,JSON.stringify(categories));
      db.prepare("INSERT INTO designer_access_tokens (token_hash,designer_id,created_at) VALUES (?,?,?)").run(accessTokenHash,designerId,now);
    })();

    return res.status(201).json({signup:{id,status:'complete'},designer:{id:designerId,email,displayName,brandName,status:'active',stripeConnected:false},accessToken});
  });

  app.get('/api/admin/designer-applications', authAdmin, (_req,res)=>{
    const applications=db.prepare("SELECT id,email,display_name,brand_name,portfolio_url,statement,location,social_url,categories,price_range,production_method,originality_confirmed,marketplace_terms_accepted,status,designer_id,created_at,reviewed_at FROM designer_applications ORDER BY created_at DESC").all();
    return res.json({applications});
  });

  async function createStripeOnboarding(designer, req) {
    let accountId=designer.stripe_account_id;
    if(accountId){
      try{ await stripeApi(`accounts/${encodeURIComponent(accountId)}`); }
      catch(error){
        const message=String(error?.message||'');
        if(/cannot access|application access may have been revoked|does not have access|no such account/i.test(message)){
          log('error','seller_connect_account_inaccessible',{designerId:designer.id});
          db.prepare("UPDATE designer_profiles SET stripe_account_id=NULL,stripe_payouts_enabled=0,stripe_details_submitted=0,stripe_requirements_due='[]',stripe_status_checked_at=? WHERE id=?").run(new Date().toISOString(),designer.id);
          accountId='';
        }else throw error;
      }
    }
    if(!accountId){
      const accountBody=new URLSearchParams({type:'express',email:designer.email,'capabilities[transfers][requested]':'true','metadata[designer_id]':designer.id});
      const account=await stripeApi('accounts',{method:'POST',body:accountBody.toString(),idempotencyKey:`hob-connect-account-${designer.id}-v2`});
      accountId=account.id;
      if(typeof accountId!=='string'||!accountId.startsWith('acct_'))throw new Error('Stripe did not return a valid connected account.');
      db.prepare('UPDATE designer_profiles SET stripe_account_id=?,stripe_payouts_enabled=0,stripe_details_submitted=0,stripe_requirements_due=? WHERE id=?').run(accountId,'[]',designer.id);
    }
    const origin=trustedAppOrigin(req);
    const refreshUrl=String(req.body?.refreshUrl||`${origin}/account?stripe=refresh`);
    const returnUrl=String(req.body?.returnUrl||`${origin}/account?stripe=return`);
    if(!isSameOriginUrl(refreshUrl,origin)||!isSameOriginUrl(returnUrl,origin))return {error:'invalid_return_url'};
    const linkBody=new URLSearchParams({account:accountId,refresh_url:refreshUrl,return_url:returnUrl,type:'account_onboarding'});
    const link=await stripeApi('account_links',{method:'POST',body:linkBody.toString()});
    return {designerId:designer.id,onboardingUrl:link.url,expiresAt:link.expires_at||null};
  }

  async function stripeStatus(designer) {
    if(!designer.stripe_account_id)return {designerId:designer.id,connected:false,onboardingComplete:false,payoutsEnabled:false,chargesEnabled:false,readyToSell:false,requirementsDue:[]};
    const account=await stripeApi(`accounts/${encodeURIComponent(designer.stripe_account_id)}`);
    const requirementsDue=Array.isArray(account.requirements?.currently_due)?account.requirements.currently_due:[];
    const onboardingComplete=Boolean(account.details_submitted);
    const payoutsEnabled=Boolean(account.payouts_enabled);
    const readyToSell=onboardingComplete&&payoutsEnabled&&requirementsDue.length===0;
    db.prepare('UPDATE designer_profiles SET stripe_payouts_enabled=?,stripe_details_submitted=?,stripe_requirements_due=?,stripe_status_checked_at=? WHERE id=?')
      .run(payoutsEnabled?1:0,onboardingComplete?1:0,JSON.stringify(requirementsDue),new Date().toISOString(),designer.id);
    return {designerId:designer.id,connected:true,onboardingComplete,payoutsEnabled,chargesEnabled:Boolean(account.charges_enabled),readyToSell,requirementsDue};
  }

  async function requireStripeSellerReady(designerId) {
    const designer=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(designerId);
    if(!designer?.stripe_account_id)throw Object.assign(new Error('Designer must finish Stripe payout setup before this piece can go on sale.'),{statusCode:409,code:'payout_setup_required'});
    const status=await stripeStatus(designer);
    if(!status.readyToSell)throw Object.assign(new Error('Designer Stripe verification or payout setup still needs attention before this piece can be sold.'),{statusCode:409,code:'payout_setup_incomplete'});
    return status;
  }

  async function requireQuoteSellersReady(quote) {
    const ids=[...new Set((quote?.items||[]).map(item=>item.designerId).filter(Boolean))];
    for(const designerId of ids)await requireStripeSellerReady(designerId);
    return quote;
  }

  app.post('/api/session', authDesigner, (req, res) => {
    res.json({ ok: true, designerId: req.designerId });
  });

  app.get('/api/my/designer-profile', authDesigner, (req,res)=>{
    const designer=db.prepare(`SELECT dp.id,dp.email,dp.display_name,dp.brand_name,dp.status,dp.bio,dp.location,dp.production_method,dp.categories,dp.portfolio_url,dp.social_url,dp.logo_storage_key,
      COALESCE(da.marketplace_terms_accepted,1) marketplace_terms_accepted
      FROM designer_profiles dp LEFT JOIN designer_applications da ON da.id=dp.application_id
      WHERE dp.id=? AND dp.status='active'`).get(req.designerId);
    if(!designer)return fail(res,404,'designer_not_found','Active designer profile not found.');
    let categories=[]; try{categories=JSON.parse(designer.categories||'[]')}catch{}
    return res.json({designer:{id:designer.id,email:designer.email,displayName:designer.display_name,brandName:designer.brand_name,status:designer.status,bio:designer.bio||'',location:designer.location||'',productionMethod:designer.production_method||'',categories,portfolioUrl:designer.portfolio_url||'',socialUrl:designer.social_url||'',logoUrl:designer.logo_storage_key?`/media/designers/${encodeURIComponent(designer.id)}/logo`:null,sellerTermsAccepted:Boolean(designer.marketplace_terms_accepted)}});
  });

  app.post('/api/my/stripe-onboarding', authDesigner, async (req,res,next)=>{
    try{
      const designer=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);
      if(!designer)return fail(res,404,'designer_not_found','Active designer not found.');
      const result=await createStripeOnboarding(designer,req);
      if(result.error)return fail(res,422,result.error,'Stripe onboarding return URLs must use this House of Briar origin.');
      return res.json(result);
    }catch(error){return next(error);}
  });

  app.get('/api/my/stripe-status', authDesigner, async (req,res,next)=>{
    try{
      const designer=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);
      if(!designer)return fail(res,404,'designer_not_found','Active designer not found.');
      return res.json(await stripeStatus(designer));
    }catch(error){return next(error);}
  });

  app.post('/api/admin/designers/:designerId/stripe-onboarding', authAdmin, async (req,res,next)=>{
    try{
      const designer=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(req.params.designerId);
      if(!designer)return fail(res,404,'designer_not_found','Active designer not found.');
      let accountId=designer.stripe_account_id;
      if(!accountId){
        const accountBody=new URLSearchParams({type:'express',email:designer.email,'capabilities[transfers][requested]':'true','metadata[designer_id]':designer.id});
        const account=await stripeApi('accounts',{method:'POST',body:accountBody.toString(),idempotencyKey:`hob-connect-account-${designer.id}`});
        accountId=account.id;
        if(typeof accountId!=='string'||!accountId.startsWith('acct_'))throw new Error('Stripe did not return a valid connected account.');
        db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run(accountId,designer.id);
      }
      const origin=trustedAppOrigin(req);
      const refreshUrl=String(req.body?.refreshUrl||`${origin}/account?stripe=refresh`);
      const returnUrl=String(req.body?.returnUrl||`${origin}/account?stripe=return`);
      if(!isSameOriginUrl(refreshUrl,origin)||!isSameOriginUrl(returnUrl,origin))return fail(res,422,'invalid_return_url','Stripe onboarding return URLs must use this House of Briar origin.');
      const linkBody=new URLSearchParams({account:accountId,refresh_url:refreshUrl,return_url:returnUrl,type:'account_onboarding'});
      const link=await stripeApi('account_links',{method:'POST',body:linkBody.toString()});
      return res.json({designerId:designer.id,stripeAccountId:accountId,onboardingUrl:link.url,expiresAt:link.expires_at||null});
    }catch(error){return next(error);}
  });

  app.get('/api/admin/designers/:designerId/stripe-status', authAdmin, async (req,res,next)=>{
    try{
      const designer=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(req.params.designerId);
      if(!designer)return fail(res,404,'designer_not_found','Active designer not found.');
      if(!designer.stripe_account_id)return res.json({designerId:designer.id,connected:false,onboardingComplete:false,payoutsEnabled:false});
      const account=await stripeApi(`accounts/${encodeURIComponent(designer.stripe_account_id)}`);
      return res.json({designerId:designer.id,connected:true,onboardingComplete:Boolean(account.details_submitted),payoutsEnabled:Boolean(account.payouts_enabled),chargesEnabled:Boolean(account.charges_enabled)});
    }catch(error){return next(error);}
  });

  async function deliverEmail({ to, subject, text }) {
    if (typeof options.sendEmail === 'function') return Boolean(await options.sendEmail({ to, subject, text }));
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from || !to) return false;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text })
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0,300)}`);
    return true;
  }

  async function processEmailOutbox(limit = 20) {
    const rows = db.prepare("SELECT * FROM email_outbox WHERE status IN ('pending','failed') AND next_attempt_at <= ? ORDER BY created_at LIMIT ?").all(new Date().toISOString(), limit);
    for (const row of rows) {
      try {
        const sent = await deliverEmail({ to: row.recipient, subject: row.subject, text: row.body_text });
        if (!sent) continue;
        db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,last_error=NULL,sent_at=? WHERE id=?").run(new Date().toISOString(), row.id);
      } catch (error) {
        const attempts = row.attempts + 1;
        const delayMs = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.min(attempts - 1, 7)));
        db.prepare("UPDATE email_outbox SET status='failed',attempts=?,next_attempt_at=?,last_error=? WHERE id=?").run(attempts, new Date(Date.now()+delayMs).toISOString(), String(error.message || error).slice(0,500), row.id);
        log('error','email_delivery_failed',{ outboxId: row.id, attempts, error: String(error.message || error).slice(0,300) });
      }
    }
    return rows.length;
  }

  ensureColumn('email_outbox', 'event_key', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_event_key ON email_outbox(event_key) WHERE event_key IS NOT NULL');

  async function sendEmail({ to, subject, text, eventKey=null }) {
    if (!to) return false;
    const id = makeId(), now = new Date().toISOString();
    const inserted=db.prepare(`INSERT INTO email_outbox (id,recipient,subject,body_text,status,attempts,next_attempt_at,created_at,event_key)
      VALUES (?,?,?,?,'pending',0,?,?,?) ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING`).run(id,to,subject,text,now,now,eventKey);
    if(!inserted.changes)return false;
    await processEmailOutbox();
    return db.prepare('SELECT status FROM email_outbox WHERE id=?').get(id)?.status === 'sent';
  }

  function designerOrderContact(orderId, designerId) {
    return db.prepare(`SELECT MAX(l.designer_email) AS email, GROUP_CONCAT(oi.title || CASE WHEN COALESCE(oi.gift_wrap_selected,0)=1 THEN ' [GIFT WRAP]' ELSE '' END, ', ') AS titles,
      SUM(oi.designer_amount_cents) AS earnings_cents
      FROM order_items oi JOIN listings l ON l.id = oi.listing_id
      WHERE oi.order_id = ? AND oi.designer_id = ?`).get(orderId, designerId);
  }

  async function notifySale(orderId) {
    const groups = db.prepare('SELECT DISTINCT designer_id FROM order_items WHERE order_id = ?').all(orderId);
    for (const group of groups) {
      const contact = designerOrderContact(orderId, group.designer_id);
      notifyDesigner(group.designer_id,'sale','You made a sale',`Order ${orderId}: ${contact.titles}. Earnings: ${(contact.earnings_cents / 100).toFixed(2)}.`,{orderId,actionPath:'/account#orders',eventKey:`sale:${orderId}:${group.designer_id}`});
      notifyDesigner(group.designer_id,'shipping_needed','Shipment needed',`Order ${orderId} is paid. Pack the order and add carrier tracking in Designer Studio.`,{orderId,actionPath:'/account#orders',priority:'important',eventKey:`shipping-needed:${orderId}:${group.designer_id}`});
      await sendEmail({ to: contact?.email, eventKey:`sale-email:${orderId}:${group.designer_id}`, subject: 'You made a sale on House of Briar',
        text: `A piece sold on House of Briar.\n\nOrder: ${orderId}\nItems: ${contact.titles}\nYour earnings: ${(contact.earnings_cents / 100).toFixed(2)}\n\nOpen your Designer Studio to ship the order and add tracking. Your payout remains held until carrier tracking is verified.` });
    }
  }

  async function notifyPayout(transferId, outcome) {
    const transfer = db.prepare('SELECT * FROM designer_transfers WHERE id = ?').get(transferId);
    if (!transfer) return false;
    const column = outcome === 'paid' ? 'payout_success_notified_at' : 'payout_failure_notified_at';
    if (transfer[column]) return false;
    const contact = designerOrderContact(transfer.order_id, transfer.designer_id);
    if (!contact?.email) return false;
    const amount = (transfer.amount_cents / 100).toFixed(2);
    const success = outcome === 'paid';
    notifyDesigner(transfer.designer_id,success?'payout_sent':'payout_attention',success?'Payout sent':'Payout needs attention',success?`Your payout of ${amount} for order ${transfer.order_id} was sent.`:`Your payout of ${amount} for order ${transfer.order_id} could not be sent yet.`,{orderId:transfer.order_id,actionPath:'/account#orders'});
    const sent = await sendEmail({
      to: contact.email,
      subject: success ? 'Your House of Briar payout was sent' : 'Your House of Briar payout needs attention',
      text: success
        ? `Your payout for order ${transfer.order_id} has been sent.\n\nItems: ${contact.titles}\nPayout: ${amount}\n\nStripe transfer: ${transfer.stripe_transfer_id || 'processing'}`
        : `We could not send your payout for order ${transfer.order_id}.\n\nItems: ${contact.titles}\nPayout: ${amount}\n\nNo funds were marked as paid. House of Briar can retry the transfer after the payout issue is resolved.`
    });
    if (sent) db.prepare(`UPDATE designer_transfers SET ${column} = ? WHERE id = ? AND ${column} IS NULL`).run(new Date().toISOString(), transferId);
    return sent;
  }

  async function stripeApi(pathname, requestOptions = {}) {
    if (typeof options.stripeApi === 'function') return options.stripeApi(pathname, requestOptions);
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured.');
    const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
      method: requestOptions.method || 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(requestOptions.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(requestOptions.idempotencyKey ? { 'Idempotency-Key': requestOptions.idempotencyKey } : {})
      },
      body: requestOptions.body
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || 'Stripe request failed.');
    return payload;
  }

  const connectAccounts = parseDesignerTokens(options.connectAccounts ?? process.env.STRIPE_CONNECT_ACCOUNTS_JSON);
  const platformStripeAccountId = String(options.platformStripeAccountId ?? process.env.STRIPE_PLATFORM_ACCOUNT_ID ?? '').trim();
  const brandStripeAccounts = parseDesignerTokens(options.brandStripeAccounts ?? process.env.STRIPE_BRAND_ACCOUNTS_JSON);

  function syncConfiguredBrandStripeAccounts() {
    for (const [brandName, accountIdRaw] of Object.entries(brandStripeAccounts)) {
      const accountId=String(accountIdRaw||'').trim();
      if(!brandName||!accountId.startsWith('acct_'))continue;
      if(platformStripeAccountId&&accountId===platformStripeAccountId){
        log('error','seller_stripe_mapping_rejected',{brandName,reason:'platform_account'});
        continue;
      }
      const matches=db.prepare("SELECT id FROM designer_profiles WHERE lower(trim(brand_name))=lower(trim(?)) AND status='active'").all(brandName);
      if(matches.length!==1){
        log('error','seller_stripe_mapping_not_unique',{brandName,matchCount:matches.length});
        continue;
      }
      db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run(accountId,matches[0].id);
      log('info','seller_stripe_mapping_synced',{brandName,designerId:matches[0].id});
    }
  }
  syncConfiguredBrandStripeAccounts();

  const configuredBrandProfiles = (()=>{try{return JSON.parse(process.env.DESIGNER_BRAND_PROFILES_JSON||'{}')}catch{return {}}})();
  configuredBrandProfiles['Loom Briar'] ||= { bio: 'Loom Briar creates one-of-a-kind wearable art and imaginative pieces inspired by enchanted woods, moonlight, nature, and storybook worlds. Each piece is designed with an emphasis on individuality, artistry, and the feeling that it belongs to a world of its own.', categories: ['Clothing','Wearable art','Accessories','Original art','Art prints','Home goods','Hand-painted keepsakes'] };
  configuredBrandProfiles['Loom Briar'] ||= {
    bio: 'Loom Briar creates one-of-a-kind wearable art and imaginative pieces inspired by enchanted woods, moonlight, nature, and storybook worlds. Each piece is designed with an emphasis on individuality, artistry, and the feeling that it belongs to a world of its own.',
    categories: ['Clothing','Wearable art','Accessories','Original art','Art prints','Home goods','Hand-painted keepsakes']
  };
  function syncConfiguredBrandProfiles(){
    for(const [brandName,profile] of Object.entries(configuredBrandProfiles)){
      if(!brandName||!profile||typeof profile!=='object')continue;
      const matches=db.prepare("SELECT id FROM designer_profiles WHERE lower(trim(brand_name))=lower(trim(?)) AND status='active'").all(brandName);
      if(matches.length!==1){log('error','designer_profile_mapping_not_unique',{brandName,matchCount:matches.length});continue;}
      const bio=String(profile.bio||'').trim().slice(0,2000);
      const categories=Array.isArray(profile.categories)?profile.categories.map(v=>String(v).trim()).filter(Boolean).slice(0,12):[];
      db.prepare('UPDATE designer_profiles SET bio=?,categories=? WHERE id=?').run(bio||null,JSON.stringify(categories),matches[0].id);
      log('info','designer_profile_synced',{brandName,designerId:matches[0].id});
    }
  }
  syncConfiguredBrandProfiles();

  function designerStripeAccount(designerId) {
    const profile=db.prepare("SELECT stripe_account_id FROM designer_profiles WHERE id=? AND status='active'").get(designerId);
    const accountId=profile?.stripe_account_id || connectAccounts[designerId] || '';
    if(platformStripeAccountId&&accountId===platformStripeAccountId){
      log('error','platform_account_blocked_as_seller',{designerId});
      return '';
    }
    return accountId;
  }

  function prepareDesignerTransfers(orderId) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").get(orderId);
    if (!order) return [];
    const groups = db.prepare(`SELECT designer_id, SUM(designer_amount_cents) AS amount_cents FROM order_items WHERE order_id = ? GROUP BY designer_id`).all(orderId);
    const prepared = [];
    for (const group of groups) {
      const existing = db.prepare('SELECT * FROM designer_transfers WHERE order_id = ? AND designer_id = ?').get(orderId, group.designer_id);
      if (existing) { prepared.push(existing); continue; }
      const accountId = designerStripeAccount(group.designer_id);
      const transferId = makeId();
      db.prepare(`INSERT INTO designer_transfers (id, order_id, designer_id, stripe_account_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(transferId, orderId, group.designer_id, typeof accountId === 'string' ? accountId : '', group.amount_cents, new Date().toISOString());
      prepared.push(db.prepare('SELECT * FROM designer_transfers WHERE id = ?').get(transferId));
    }
    return prepared;
  }

  async function verifyShipmentTracking(trackingNumber, carrier) {
    if (typeof options.verifyShipmentTracking === 'function') return options.verifyShipmentTracking(trackingNumber, carrier);
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
    const acceptedStatuses = new Set(['in_transit','out_for_delivery','delivered','available_for_pickup']);
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
      const accountId = designerStripeAccount(group.designer_id);
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
        await notifyPayout(transferId, 'paid');
        results.push({ designer_id: group.designer_id, status: 'paid', stripe_transfer_id: transfer.id });
      } catch (error) {
        db.prepare("UPDATE designer_transfers SET status = 'failed', error_message = ? WHERE id = ?").run(String(error.message || error).slice(0, 500), transferId);
        await notifyPayout(transferId, 'failed');
        results.push({ designer_id: group.designer_id, status: 'failed' });
      }
    }
    return results;
  }

  function releaseExpiredInventoryReservations() {
    // Stripe is authoritative for an open Checkout Session. Only release reservations
    // whose orders are already canceled or failed; timeout release happens from
    // checkout.session.expired so an old payable Session can never lose its inventory.
    db.prepare(`UPDATE inventory_reservations
      SET status = 'released'
      WHERE status = 'reserved'
        AND order_id IN (SELECT id FROM orders WHERE status IN ('canceled','failed'))`).run();
  }

  function reserveInventory(orderId, items, now) {
    releaseExpiredInventoryReservations();
    const expiresAt = new Date(new Date(now).getTime() + CHECKOUT_RESERVATION_MINUTES * 60 * 1000).toISOString();
    const insert = db.prepare("INSERT INTO inventory_reservations (listing_id,order_id,status,reserved_at,expires_at,quantity) VALUES (?,?,'reserved',?,?,?)");
    for (const item of items) {
      const listing=db.prepare('SELECT id,stock_quantity,production_type FROM listings WHERE id=?').get(item.id);
      if (listing?.production_type === 'Made to Order') continue;
      if(!listing || item.quantity > listingInventory(listing).availableQuantity) throw Object.assign(new Error('One or more pieces do not have enough stock for this cart.'), { statusCode: 409 });
      insert.run(item.id,orderId,now,expiresAt,item.quantity);
    }
    return expiresAt;
  }

  function markOrderInventorySold(orderId) {
    db.transaction(() => {
      const now = new Date().toISOString();
      const sold=db.prepare(`SELECT l.* FROM inventory_reservations r JOIN listings l ON l.id=r.listing_id
        WHERE r.order_id=? AND r.status='reserved'`).all(orderId);
      db.prepare("UPDATE inventory_reservations SET status = 'sold', sold_at = ? WHERE order_id = ? AND status = 'reserved'").run(now, orderId);
      for(const item of sold){
        db.prepare('UPDATE listings SET updated_at=?,version=version+1 WHERE id=?').run(now,item.id);
        notifyInventoryState(item,`sale:${orderId}`,{orderId});
      }
    }).immediate();
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

  function donationBadgeSubject(donation,email) {
    const linked=donation.buyer_subject||badgeSubjectForEmail(email);
    if(linked)return linked;
    // Operator-confirmed recovery applies only to historical payments with the
    // exact checkout email and amount. It does not grant login or order access.
    let recoveries=options.donationBadgeRecoveries;
    if(!Array.isArray(recoveries)){
      try{recoveries=JSON.parse(process.env.DONATION_BADGE_RECOVERIES_JSON||'[]');}catch{recoveries=[];}
    }
    if(!Array.isArray(recoveries))return null;
    const match=recoveries.find(r=>r&&typeof r.email==='string'&&r.email.trim().toLowerCase()===email&&r.amountCents===donation.amount_cents&&Number.isFinite(Date.parse(r.createdBefore))&&Date.parse(donation.created_at)<=Date.parse(r.createdBefore)&&typeof r.designerId==='string');
    if(!match)return null;
    const designer=db.prepare("SELECT id FROM designer_profiles WHERE id=? AND status='active'").get(match.designerId);
    return designer ? designerBadgeSubject(designer.id) : null;
  }

  function confirmDonationBadge(donation,session) {
    if(session.id!==donation.stripe_session_id || session.metadata?.donation_id!==donation.id || session.payment_status!=='paid' || session.currency!==donation.currency || !Number.isInteger(session.amount_total) || session.amount_total!==donation.amount_cents)return false;
    const email=(session.customer_details?.email||session.customer_email||donation.buyer_email||'').trim().toLowerCase();
    const subject=donationBadgeSubject(donation,email);
    db.prepare("UPDATE donations SET status='paid',paid_at=COALESCE(paid_at,?),buyer_subject=COALESCE(buyer_subject,?),buyer_email=COALESCE(buyer_email,?) WHERE id=?").run(new Date().toISOString(),subject,email||null,donation.id);
    if(subject&&donation.amount_cents>=500){
      const before=db.prepare("SELECT 1 FROM user_badges WHERE buyer_subject=? AND badge_type='supporter'").get(subject);
      awardBadge(subject,'supporter','donation',donation.id);
      return !before;
    }
    return false;
  }

  let donationReconciliationRunning=false;
  async function reconcileDonationBadges() {
    if(donationReconciliationRunning)return {checked:0,awarded:0,errors:0};
    donationReconciliationRunning=true;
    const results={checked:0,awarded:0,errors:0,pending:0,unlinked:0,mismatch:0,unavailableSessions:0};
    try {
      const donations=db.prepare("SELECT * FROM donations d WHERE stripe_session_id IS NOT NULL AND (status='pending' OR (status='paid' AND amount_cents>=500 AND NOT EXISTS (SELECT 1 FROM user_badges b WHERE (b.source_type='donation' AND b.source_id=d.id) OR (b.buyer_subject=d.buyer_subject AND b.badge_type='supporter')))) ORDER BY created_at DESC LIMIT 100").all();
      for(const donation of donations){
        results.checked++;
        try {
          const session=await stripeApi(`checkout/sessions/${encodeURIComponent(donation.stripe_session_id)}`);
          if(confirmDonationBadge(donation,session))results.awarded++;
          else if(session.payment_status!=='paid')results.pending++;
          else if(!donationBadgeSubject(donation,(session.customer_details?.email||session.customer_email||donation.buyer_email||'').trim().toLowerCase()))results.unlinked++;
          else if(session.id!==donation.stripe_session_id||session.metadata?.donation_id!==donation.id||session.currency!==donation.currency||session.amount_total!==donation.amount_cents)results.mismatch++;
          if(session.id===donation.stripe_session_id&&session.metadata?.donation_id===donation.id&&session.status==='expired'&&donation.status==='pending')db.prepare("UPDATE donations SET status='failed' WHERE id=? AND status='pending'").run(donation.id);
        }catch(error){results.errors++;if(/No such checkout\.session|No such checkout session/i.test(String(error?.message)))results.unavailableSessions++;}
      }
      if(results.checked)log('info','donation_badges_reconciled',results);
      return results;
    }finally{donationReconciliationRunning=false;}
  }

  async function reconcilePendingCheckouts() {
    const now = new Date().toISOString();
    const stale = db.prepare(`SELECT id, stripe_session_id FROM orders
      WHERE status = 'pending' AND stripe_session_id IS NOT NULL AND id IN (
        SELECT order_id FROM inventory_reservations WHERE status = 'reserved' AND expires_at <= ?
      )`).all(now);
    const results = { checked: 0, paid: 0, released: 0, errors: 0 };
    for (const order of stale) {
      results.checked += 1;
      try {
        const session = await stripeApi(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
        if (session.payment_status === 'paid') {
          db.prepare("UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), buyer_email = COALESCE(?, buyer_email), stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id) WHERE id = ? AND status = 'pending'").run(new Date().toISOString(), session.customer_details?.email || session.customer_email || null, session.payment_intent || null, order.id);
          markOrderInventorySold(order.id);
          await prepareDesignerTransfers(order.id);
          await notifySale(order.id);
          results.paid += 1;
        } else if (session.status === 'expired') {
          releaseOrderInventory(order.id);
          results.released += 1;
        }
      } catch (error) {
        results.errors += 1;
        console.error('Checkout reconciliation failed:', order.id, error);
      }
    }
    return results;
  }

  function buildCheckoutQuote(requested, promoCodes = []) {
    if (!Array.isArray(requested) || !requested.length || requested.length > 50) throw Object.assign(new Error('Add at least one item before checkout.'), { statusCode: 422 });
    const quantities = new Map();
    const giftWrapSelections = new Map();
    for (const item of requested) {
      const id = typeof item?.id === 'string' ? item.id : '';
      const quantity = Number(item?.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw Object.assign(new Error('Cart quantities must be whole numbers between 1 and 10.'), { statusCode: 422 });
      quantities.set(id, (quantities.get(id) || 0) + quantity);
      if (item?.giftWrap === true) giftWrapSelections.set(id, true);
    }
    const requestedCodes=[...new Set((Array.isArray(promoCodes)?promoCodes:[]).map(v=>String(v||'').trim().toUpperCase()).filter(Boolean))].slice(0,20);
    const rows = [];
    for (const [id, quantity] of quantities) {
      const listing = db.prepare("SELECT l.* FROM listings l JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active' AND COALESCE(dp.vacation_mode,0)=0 AND dp.stripe_account_id IS NOT NULL AND dp.stripe_account_id!='' WHERE l.id = ? AND l.status = 'published' AND l.moderation_status = 'approved' AND COALESCE(l.paused_by_designer,0)=0").get(id);
      if (!listing) throw Object.assign(new Error('One or more pieces are currently unavailable.'), { statusCode: 409 });
      if ((listing.production_type || 'One of a Kind') === 'One of a Kind' && quantity !== 1) throw Object.assign(new Error('One-of-a-kind pieces can only be purchased one at a time.'), { statusCode: 409 });
      const unitAmountCents = Math.round(Number(listing.price) * 100);
      const enhancement = db.prepare('SELECT gift_wrap_available,gift_wrap_price_cents FROM listing_enhancements WHERE listing_id=?').get(id) || {};
      const giftWrapSelected = giftWrapSelections.get(id) === true && Boolean(enhancement.gift_wrap_available);
      const giftWrapCents = giftWrapSelected ? Math.max(0, Number(enhancement.gift_wrap_price_cents || 0)) * quantity : 0;
      const grossCents = unitAmountCents * quantity;
      let discountCents=0,promoCodeId=null,promoCode=null;
      for(const code of requestedCodes){
        const promo=db.prepare(`SELECT * FROM designer_promo_codes WHERE designer_id=? AND code=? AND active=1
          AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?)
          AND (max_uses IS NULL OR use_count<max_uses)`).get(listing.designer_id,code,new Date().toISOString(),new Date().toISOString());
        if(!promo)continue;
        const amount=promo.discount_type==='percent'?Math.floor(grossCents*promo.discount_value/100):Math.min(grossCents,promo.discount_value);
        if(amount>discountCents){discountCents=amount;promoCodeId=promo.id;promoCode=promo.code;}
      }
      const merchandiseTotalCents=Math.max(0,grossCents-discountCents);
      const lineTotalCents=merchandiseTotalCents+giftWrapCents;
      const platformFeeCents = Math.round(lineTotalCents * 0.10);
      rows.push({ id: listing.id, title: listing.title, designerId: listing.designer_id, quantity, unitAmountCents, grossCents, discountCents, promoCodeId, promoCode, giftWrapSelected, giftWrapCents, lineTotalCents, platformFeeCents, designerAmountCents: lineTotalCents - platformFeeCents });
    }
    const subtotalCents = rows.reduce((sum, item) => sum + item.lineTotalCents, 0);
    if(subtotalCents<50) throw Object.assign(new Error('Order total is too small to process.'),{statusCode:422});
    const discountCents=rows.reduce((sum,item)=>sum+item.discountCents,0);
    const platformFeeCents = rows.reduce((sum, item) => sum + item.platformFeeCents, 0);
    return { currency: 'usd', items: rows, subtotalCents, discountCents, platformFeeCents, designerAmountCents: subtotalCents - platformFeeCents };
  }
  app.post('/api/checkout/quote', checkoutLimiter, async (req, res) => {
    try { const quote=buildCheckoutQuote(req.body?.items,req.body?.promoCodes); await requireQuoteSellersReady(quote); return res.json(quote); }
    catch (error) { return fail(res, error.statusCode || 422, error.code || 'invalid_cart', error.message); }
  });

  app.post('/api/donations/session', checkoutLimiter, async (req,res,next) => {
    try {
      const amountCents=Math.round(Number(req.body?.amount)*100);
      if(!Number.isInteger(amountCents)||amountCents<100||amountCents>100000)return fail(res,422,'invalid_donation','Choose a donation between $1 and $1,000.');
      let buyerSubject=null,buyerEmail=null;
      const token=req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if(token){try{const profile=await resolveBuyerIdentity(req,token);if(profile&&typeof profile.sub==='string'&&profile.sub.trim()){buyerSubject=profile.sub.trim();buyerEmail=typeof profile.email==='string'?profile.email.trim().toLowerCase():null;}}catch{}}
      const id=makeId(),now=new Date().toISOString(),origin=trustedAppOrigin(req);
      db.prepare("INSERT INTO donations (id,buyer_subject,buyer_email,amount_cents,currency,status,created_at) VALUES (?,?,?,?,'usd','pending',?)").run(id,buyerSubject,buyerEmail,amountCents,now);
      const body=new URLSearchParams({mode:'payment',success_url:`${origin}/?donation=success`,cancel_url:`${origin}/?donation=canceled`,'metadata[donation_id]':id,'metadata[purpose]':'house_of_briar_support','payment_intent_data[metadata][donation_id]':id});
      if(buyerEmail&&!buyerEmail.endsWith('@legacy.houseofbriar.invalid'))body.set('customer_email',buyerEmail);
      body.append('payment_method_types[]','card');
      body.append('payment_method_types[]','us_bank_account');
      body.set('line_items[0][price_data][currency]','usd');body.set('line_items[0][price_data][product_data][name]','Support House of Briar');body.set('line_items[0][price_data][unit_amount]',String(amountCents));body.set('line_items[0][quantity]','1');
      try{const session=await stripeApi('checkout/sessions',{method:'POST',body:body.toString(),idempotencyKey:`hob-donation-${id}`});db.prepare('UPDATE donations SET stripe_session_id=? WHERE id=?').run(session.id,id);return res.status(201).json({url:session.url});}
      catch(error){db.prepare("UPDATE donations SET status='failed' WHERE id=?").run(id);throw error;}
    }catch(error){return next(error);}
  });

  let paypalTokenCache={token:'',expiresAt:0};
  function paypalBaseUrl(){return process.env.PAYPAL_ENVIRONMENT==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';}
  async function paypalAccessToken(){
    if(paypalTokenCache.token && Date.now()<paypalTokenCache.expiresAt-60000)return paypalTokenCache.token;
    const clientId=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
    if(!clientId||!secret)throw Object.assign(new Error('PayPal is not configured.'),{statusCode:503});
    const response=await fetch(paypalBaseUrl()+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data?.error_description||'PayPal authentication failed.'),{statusCode:502});
    paypalTokenCache={token:data.access_token,expiresAt:Date.now()+Number(data.expires_in||300)*1000};return data.access_token;
  }
  async function paypalApi(path,{method='GET',body,idempotencyKey}={}){
    const token=await paypalAccessToken();const response=await fetch(paypalBaseUrl()+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Accept':'application/json',...(idempotencyKey?{'PayPal-Request-Id':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data?.details?.[0]?.description||data?.message||'PayPal request failed.'),{statusCode:502});return data;
  }
  function paypalApprovalUrl(order){return order?.links?.find(link=>link.rel==='payer-action'||link.rel==='approve')?.href||null;}
  function paypalPayerEmail(payload){return payload?.payment_source?.paypal?.email_address||payload?.payment_source?.venmo?.email_address||payload?.payer?.email_address||null;}
  async function paypalBuyerIdentity(req){
    let buyerSubject=null,buyerEmail=null;const token=req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(token){try{const profile=await resolveBuyerIdentity(req,token);if(profile&&typeof profile.sub==='string'&&profile.sub.trim()){buyerSubject=profile.sub.trim();buyerEmail=typeof profile.email==='string'?profile.email.trim().toLowerCase():null;}}catch{}}
    return {buyerSubject,buyerEmail};
  }
  function paypalExperience(origin,kind,id){
    const success=kind==='donation'?origin+'/?donation=paypal-success&paypal_order_id='+encodeURIComponent(id):origin+'/?checkout=paypal-success&paypal_order_id='+encodeURIComponent(id);
    const cancel=kind==='donation'?origin+'/?donation=canceled':origin+'/?checkout=canceled';
    return {brand_name:'House of Briar',user_action:'PAY_NOW',return_url:success,cancel_url:cancel,shipping_preference:kind==='order'?'GET_FROM_FILE':'NO_SHIPPING'};
  }
  async function finalizePaypalOrder(localOrder,paypalOrder){
    if(paypalOrder.status!=='COMPLETED')throw Object.assign(new Error('PayPal payment is not complete.'),{statusCode:409});
    const capture=paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];const amount=capture?.amount||paypalOrder.purchase_units?.[0]?.amount;
    const cents=Math.round(Number(amount?.value)*100);if(String(amount?.currency_code||'').toLowerCase()!==String(localOrder.currency).toLowerCase()||cents!==localOrder.subtotal_cents)throw Object.assign(new Error('PayPal payment does not match this order.'),{statusCode:409});
    if(localOrder.status!=='paid'){const email=paypalPayerEmail(paypalOrder);db.prepare("UPDATE orders SET status='paid',paid_at=?,buyer_email=COALESCE(buyer_email,?),paypal_capture_id=? WHERE id=?").run(new Date().toISOString(),email,capture?.id||null,localOrder.id);markOrderInventorySold(localOrder.id);const subject=localOrder.buyer_subject||badgeSubjectForEmail(email);if(subject)awardBadge(subject,'verified_buyer','order',localOrder.id);await prepareDesignerTransfers(localOrder.id);await notifySale(localOrder.id);}
  }
  app.post('/api/paypal/checkout/order',checkoutLimiter,async(req,res,next)=>{
    try{const quote=buildCheckoutQuote(req.body?.items,req.body?.promoCodes);await requireQuoteSellersReady(quote);const {buyerSubject,buyerEmail}=await paypalBuyerIdentity(req);const orderId=makeId(),now=new Date().toISOString(),origin=trustedAppOrigin(req);
      db.transaction(()=>{db.prepare(`INSERT INTO orders (id,buyer_subject,buyer_email,status,currency,subtotal_cents,discount_cents,platform_fee_cents,designer_amount_cents,created_at,payment_provider) VALUES (?,?,?,'pending',?,?,?,?,?,?,'paypal')`).run(orderId,buyerSubject,buyerEmail,quote.currency,quote.subtotalCents,quote.discountCents,quote.platformFeeCents,quote.designerAmountCents,now);reserveInventory(orderId,quote.items,now);const stmt=db.prepare(`INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,discount_cents,promo_code_id,platform_fee_cents,designer_amount_cents,gift_wrap_selected,gift_wrap_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);quote.items.forEach(item=>stmt.run(makeId(),orderId,item.id,item.designerId,item.title,item.unitAmountCents,item.quantity,item.lineTotalCents,item.discountCents,item.promoCodeId,item.platformFeeCents,item.designerAmountCents,item.giftWrapSelected?1:0,item.giftWrapCents));})();
      try{const pp=await paypalApi('/v2/checkout/orders',{method:'POST',idempotencyKey:'hob-paypal-order-'+orderId,body:{intent:'CAPTURE',purchase_units:[{reference_id:orderId,custom_id:orderId,amount:{currency_code:'USD',value:(quote.subtotalCents/100).toFixed(2)}}],payment_source:{paypal:{experience_context:paypalExperience(origin,'order',orderId)}}}});db.prepare('UPDATE orders SET paypal_order_id=? WHERE id=?').run(pp.id,orderId);return res.status(201).json({orderId,paypalOrderId:pp.id,url:paypalApprovalUrl(pp)});}catch(error){releaseOrderInventory(orderId);throw error;}
    }catch(error){next(error);}
  });
  app.post('/api/paypal/checkout/capture',checkoutLimiter,async(req,res,next)=>{
    try{const paypalOrderId=String(req.body?.paypalOrderId||'');const order=db.prepare("SELECT * FROM orders WHERE paypal_order_id=? AND payment_provider='paypal'").get(paypalOrderId);if(!order)return fail(res,404,'order_not_found','PayPal order not found.');const pp=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(paypalOrderId)+'/capture',{method:'POST',idempotencyKey:'hob-paypal-capture-'+order.id});await finalizePaypalOrder(order,pp);return res.json({status:'paid',orderId:order.id});}catch(error){next(error);}
  });
  app.post('/api/paypal/donations/order',checkoutLimiter,async(req,res,next)=>{
    try{const amountCents=Math.round(Number(req.body?.amount)*100);if(!Number.isInteger(amountCents)||amountCents<100||amountCents>100000)return fail(res,422,'invalid_donation','Choose a donation between $1 and $1,000.');const {buyerSubject,buyerEmail}=await paypalBuyerIdentity(req);const id=makeId(),now=new Date().toISOString(),origin=trustedAppOrigin(req);db.prepare("INSERT INTO donations (id,buyer_subject,buyer_email,amount_cents,currency,status,created_at,payment_provider) VALUES (?,?,?,?,'usd','pending',?,'paypal')").run(id,buyerSubject,buyerEmail,amountCents,now);
      const pp=await paypalApi('/v2/checkout/orders',{method:'POST',idempotencyKey:'hob-paypal-donation-'+id,body:{intent:'CAPTURE',purchase_units:[{reference_id:id,custom_id:id,description:'Support House of Briar',amount:{currency_code:'USD',value:(amountCents/100).toFixed(2)}}],payment_source:{paypal:{experience_context:paypalExperience(origin,'donation',id)}}}});db.prepare('UPDATE donations SET paypal_order_id=? WHERE id=?').run(pp.id,id);return res.status(201).json({donationId:id,paypalOrderId:pp.id,url:paypalApprovalUrl(pp)});}catch(error){next(error);}
  });
  app.post('/api/paypal/donations/capture',checkoutLimiter,async(req,res,next)=>{
    try{const paypalOrderId=String(req.body?.paypalOrderId||'');const donation=db.prepare("SELECT * FROM donations WHERE paypal_order_id=? AND payment_provider='paypal'").get(paypalOrderId);if(!donation)return fail(res,404,'not_found','PayPal donation not found.');const pp=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(paypalOrderId)+'/capture',{method:'POST',idempotencyKey:'hob-paypal-donation-capture-'+donation.id});const capture=pp.purchase_units?.[0]?.payments?.captures?.[0],amount=capture?.amount||pp.purchase_units?.[0]?.amount,cents=Math.round(Number(amount?.value)*100);if(pp.status!=='COMPLETED'||String(amount?.currency_code||'').toLowerCase()!=='usd'||cents!==donation.amount_cents)throw Object.assign(new Error('PayPal donation payment does not match.'),{statusCode:409});if(donation.status!=='paid'){const email=paypalPayerEmail(pp);db.prepare("UPDATE donations SET status='paid',paid_at=?,buyer_email=COALESCE(buyer_email,?),paypal_capture_id=? WHERE id=?").run(new Date().toISOString(),email,capture?.id||null,donation.id);const subject=donationBadgeSubject(donation,email);if(subject&&donation.amount_cents>=500)awardBadge(subject,'supporter','donation',donation.id);}return res.json({status:'paid'});}catch(error){next(error);}
  });

  app.post('/api/checkout/session', checkoutLimiter, async (req, res, next) => {
    let buyerSubject = null;
    let buyerEmail = null;
    const buyerToken = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (buyerToken) {
      try { const profile = await resolveBuyerIdentity(req, buyerToken); if (profile && typeof profile.sub === 'string' && profile.sub.trim()) { buyerSubject = profile.sub.trim(); buyerEmail = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : null; } } catch {}
    }
    try {
      const quote = buildCheckoutQuote(req.body?.items,req.body?.promoCodes);
      await requireQuoteSellersReady(quote);
      const orderId = makeId();
      const cancelToken = crypto.randomBytes(32).toString('base64url');
      const cancelTokenHash = crypto.createHash('sha256').update(cancelToken).digest('hex');
      const now = new Date().toISOString();
      const origin = trustedAppOrigin(req);
      const body = new URLSearchParams({
        mode: 'payment',
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=canceled&order_id=${encodeURIComponent(orderId)}&cancel_token=${encodeURIComponent(cancelToken)}`,
        expires_at: String(Math.floor((Date.now() + CHECKOUT_RESERVATION_MINUTES * 60 * 1000) / 1000)),
        'metadata[order_id]': orderId,
        'payment_intent_data[metadata][order_id]': orderId,
        allow_promotion_codes: 'false'
      });
      body.append('payment_method_types[]', 'card');
      body.append('payment_method_types[]', 'us_bank_account');
      let stripeLineIndex=0;
      quote.items.forEach((item) => {
        const merchandiseCents=item.lineTotalCents-item.giftWrapCents;
        body.set(`line_items[${stripeLineIndex}][price_data][currency]`, quote.currency);
        body.set(`line_items[${stripeLineIndex}][price_data][product_data][name]`, item.title);
        body.set(`line_items[${stripeLineIndex}][price_data][unit_amount]`, String(Math.max(1,Math.floor(merchandiseCents/item.quantity))));
        body.set(`line_items[${stripeLineIndex}][quantity]`, String(item.quantity));
        stripeLineIndex++;
        if(item.giftWrapSelected && item.giftWrapCents>0){
          body.set(`line_items[${stripeLineIndex}][price_data][currency]`,quote.currency);
          body.set(`line_items[${stripeLineIndex}][price_data][product_data][name]`,`Gift wrapping — ${item.title}`);
          body.set(`line_items[${stripeLineIndex}][price_data][unit_amount]`,String(Math.floor(item.giftWrapCents/item.quantity)));
          body.set(`line_items[${stripeLineIndex}][quantity]`,String(item.quantity));
          stripeLineIndex++;
        }
      });
      // Claim scarce inventory before creating an externally payable Stripe session.
      // If another buyer already holds the piece, this transaction fails before Stripe is called.
      db.transaction(() => {
        db.prepare(`INSERT INTO orders (id, cancel_token_hash, buyer_subject, buyer_email, status, currency, subtotal_cents, discount_cents, platform_fee_cents, designer_amount_cents, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`).run(orderId, cancelTokenHash, buyerSubject, buyerEmail, quote.currency, quote.subtotalCents, quote.discountCents, quote.platformFeeCents, quote.designerAmountCents, now);
        reserveInventory(orderId, quote.items, now);
        const stmt = db.prepare(`INSERT INTO order_items (id, order_id, listing_id, designer_id, title, unit_amount_cents, quantity, line_total_cents, discount_cents, promo_code_id, platform_fee_cents, designer_amount_cents, gift_wrap_selected, gift_wrap_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        quote.items.forEach(item => stmt.run(makeId(), orderId, item.id, item.designerId, item.title, item.unitAmountCents, item.quantity, item.lineTotalCents, item.discountCents, item.promoCodeId, item.platformFeeCents, item.designerAmountCents, item.giftWrapSelected?1:0, item.giftWrapCents));
      })();

      let session;
      try {
        session = await stripeApi('checkout/sessions', { method: 'POST', body: body.toString(), idempotencyKey: `hob-checkout-${orderId}` });
        db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, orderId);
      } catch (error) {
        // Never strand a one-of-a-kind reservation when Stripe cannot create checkout.
        releaseOrderInventory(orderId);
        throw error;
      }
      return res.status(201).json({ orderId, sessionId: session.id, url: session.url });
    } catch (error) { return next(error); }
  });

  app.post('/api/checkout/cancel/:orderId', async (req, res, next) => {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
      if (!order) return fail(res, 404, 'order_not_found', 'Order not found.');
      const cancelToken = req.get('x-checkout-cancel-token');
      const submittedHash = typeof cancelToken === 'string' ? crypto.createHash('sha256').update(cancelToken).digest('hex') : '';
      if (!order.cancel_token_hash || !safeEqual(submittedHash, order.cancel_token_hash)) {
        return fail(res, 403, 'forbidden', 'This checkout cancellation request is not authorized.');
      }
      if (order.status === 'paid') return fail(res, 409, 'already_paid', 'Paid orders cannot be canceled from checkout.');
      // An open Checkout Session must stop being payable before its inventory can be released.
      if (order.stripe_session_id) {
        await stripeApi(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}/expire`, { method: 'POST' });
      }
      releaseOrderInventory(order.id);
      return res.json({ orderId: order.id, status: 'canceled', inventoryReleased: true, checkoutExpired: Boolean(order.stripe_session_id) });
    } catch (error) { return next(error); }
  });

  app.post('/api/analytics/events', express.json({ limit: '16kb' }), (req, res) => {
    const allowed = new Set(['view_product','search','add_to_wishlist','remove_from_wishlist','add_to_cart','remove_from_cart','view_cart','begin_checkout','checkout_abandoned','purchase']);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const eventName = String(body.event || '');
    if (!allowed.has(eventName)) return fail(res, 400, 'invalid_event', 'Unknown commerce event.');
    const text = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : null;
    const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
    db.prepare(`INSERT INTO analytics_events (
      id,event_name,session_id,listing_id,listing_name,designer,value,currency,search_query,result_count,item_count,order_id,source,path,referrer,utm_source,utm_medium,utm_campaign,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), eventName, text(body.sessionId, 100), text(body.listingId, 100), text(body.listingName),
      text(body.designer, 200), number(body.value), text(body.currency, 12), text(body.query, 300),
      number(body.resultCount), number(body.itemCount), text(body.orderId, 100), text(body.source, 100),
      text(body.path, 500), text(body.referrer, 1000), text(body.utmSource, 200), text(body.utmMedium, 200),
      text(body.utmCampaign, 300), new Date().toISOString()
    );
    res.status(202).json({ accepted: true });
  });

  app.post('/api/admin/badges/reconcile', authAdmin, async (_req,res)=>{
    const awarded=reconcileVerifiedBuyerBadges();
    const donations=await reconcileDonationBadges();
    return res.json({ok:true,awarded,donations});
  });

  app.get('/api/admin/analytics', authAdmin, (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const events = db.prepare(`SELECT event_name, COUNT(*) count FROM analytics_events WHERE created_at >= ? GROUP BY event_name ORDER BY count DESC`).all(since);
    const funnelNames = ['view_product','add_to_cart','begin_checkout','purchase'];
    const counts = Object.fromEntries(funnelNames.map(name => [name, Number(events.find(row => row.event_name === name)?.count || 0)]));
    const searches = db.prepare(`SELECT search_query query, COUNT(*) count FROM analytics_events WHERE event_name='search' AND search_query IS NOT NULL AND created_at >= ? GROUP BY search_query ORDER BY count DESC LIMIT 20`).all(since);
    const sources = db.prepare(`SELECT COALESCE(utm_source, source, 'direct') source, COUNT(*) count, ROUND(COALESCE(SUM(value),0),2) revenue FROM analytics_events WHERE event_name='purchase' AND created_at >= ? GROUP BY COALESCE(utm_source, source, 'direct') ORDER BY revenue DESC, count DESC LIMIT 20`).all(since);
    const revenueRow=db.prepare(`SELECT ROUND(COALESCE(SUM(value),0),2) revenue, COUNT(*) purchases, ROUND(COALESCE(AVG(value),0),2) aov FROM analytics_events WHERE event_name='purchase' AND created_at>=?`).get(since);
    const startedSessions=Number(db.prepare(`SELECT COUNT(DISTINCT session_id) count FROM analytics_events WHERE event_name='begin_checkout' AND created_at>=?`).get(since)?.count||0);
    const purchasedSessions=Number(db.prepare(`SELECT COUNT(DISTINCT session_id) count FROM analytics_events WHERE event_name='purchase' AND created_at>=?`).get(since)?.count||0);
    const abandonedSessions=Number(db.prepare(`SELECT COUNT(DISTINCT b.session_id) count FROM analytics_events b WHERE b.event_name='begin_checkout' AND b.created_at>=? AND b.created_at < datetime('now','-2 hours') AND NOT EXISTS (SELECT 1 FROM analytics_events p WHERE p.session_id=b.session_id AND p.event_name='purchase' AND p.created_at>=b.created_at)`).get(since)?.count||0);
    const rate=(from,to)=>from>0?Math.round((to/from)*1000)/10:0;
    const funnel={...counts, conversionRates:{viewToCart:rate(counts.view_product,counts.add_to_cart),cartToCheckout:rate(counts.add_to_cart,counts.begin_checkout),checkoutToPurchase:rate(counts.begin_checkout,counts.purchase),viewToPurchase:rate(counts.view_product,counts.purchase)},dropOff:{viewToCart:Math.max(0,counts.view_product-counts.add_to_cart),cartToCheckout:Math.max(0,counts.add_to_cart-counts.begin_checkout),checkoutToPurchase:Math.max(0,counts.begin_checkout-counts.purchase)}};
    res.json({ periodDays: 30, events, funnel, searches, purchaseSources: sources, commerce:{revenue:Number(revenueRow?.revenue||0),purchases:Number(revenueRow?.purchases||0),averageOrderValue:Number(revenueRow?.aov||0),checkoutSessions:startedSessions,purchasedSessions,estimatedAbandonedCheckouts:abandonedSessions} });
  });

    const galleryResponse = (req, res) => {
    const input = req.method === 'POST' ? req.body?.filters || {} : req.query;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(res, 400, 'invalid_filter', 'Choose valid shop filters.');
    const measurements = req.method === 'POST' ? req.body?.measurements : undefined;
    if (req.method === 'POST' && measurements === undefined) return fail(res, 400, 'invalid_measurements', 'Enter at least one measurement.');
    if (measurements !== undefined && (!measurements || typeof measurements !== 'object' || Array.isArray(measurements))) return fail(res, 400, 'invalid_measurements', 'Enter valid measurements.');
    const fitValues = {};
    for (const key of FIT_KEYS) {
      if (measurements?.[key] === undefined) continue;
      const value = measurements[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 150) return fail(res, 400, 'invalid_measurements', 'Enter measurements between 0 and 150 inches.');
      fitValues[key] = value;
    }
    if (measurements !== undefined && !Object.keys(fitValues).length) return fail(res, 400, 'invalid_measurements', 'Enter at least one measurement.');
    const filters = {};
    for (const key of ['category', 'style', 'aesthetic', 'pattern', 'designer', 'q', 'sort']) {
      const value = input[key];
      if (value !== undefined && (typeof value !== 'string' || value.length > (key === 'q' ? 200 : 100))) {
        return fail(res, 400, 'invalid_filter', 'Choose a valid shop filter.');
      }
      filters[key] = (value || '').trim();
    }
    if (filters.category && filters.category !== 'all' && !ALLOWED_CATEGORIES.has(filters.category)) {
      return fail(res, 400, 'invalid_filter', 'Choose a supported category.');
    }
    if (filters.sort && !['all', 'new', 'low', 'high'].includes(filters.sort)) {
      return fail(res, 400, 'invalid_filter', 'Choose a supported sort order.');
    }
    const conditions = ["l.status = 'published'", "l.moderation_status = 'approved'"];
    const values = [];
    for (const key of ['category', 'style', 'aesthetic', 'pattern']) {
      if (filters[key] && filters[key] !== 'all') {
        conditions.push(`LOWER(TRIM(l.${key})) = LOWER(?)`);
        values.push(filters[key]);
      }
    }
    if (filters.designer && filters.designer !== 'all') {
      conditions.push('l.designer_id = ?');
      values.push(filters.designer);
    }
    const order = filters.sort === 'low' ? 'l.price ASC, l.id ASC'
      : filters.sort === 'high' ? 'l.price DESC, l.id ASC'
      : 'l.published_at DESC, l.created_at DESC, l.id ASC';
    const rows = db.prepare(`
      SELECT l.*, COALESCE(dp.brand_name, dp.display_name) AS designer_name, CASE WHEN ir.status='sold' THEN 1 ELSE 0 END AS sold
      FROM listings l
      JOIN designer_profiles dp ON dp.id = l.designer_id AND dp.status = 'active'
      LEFT JOIN inventory_reservations ir ON ir.listing_id=l.id AND ir.status='sold'
      WHERE ${conditions.join(' AND ')} ORDER BY ${order}
    `).all(...values);
    let items = rows.map((row) => serializeListing(row, 'public'));
    if (filters.q) {
      const query = filters.q.toLowerCase();
      items = items.filter(item => [item.title, item.description, item.style, item.aesthetic,
        item.pattern, item.materials, item.designerName, item.designer, item.productionType, item.category]
        .filter(Boolean).join(' ').toLowerCase().includes(query));
    }
    if (Object.keys(fitValues).length) {
      items = items.filter(item => Object.entries(fitValues).every(([key, value]) => {
        const range = item.fitMeasurements[key];
        return range && Number.isFinite(range.min) && Number.isFinite(range.max) && value >= range.min && value <= range.max;
      }));
    }
    res.set('Cache-Control', 'no-store');
    res.json({ items });
  };
  app.get('/api/gallery', galleryResponse);
  app.post('/api/gallery/search', galleryResponse);


  app.get('/api/recommendations/:listingId', (req,res) => {
    const listingId=String(req.params.listingId||'');
    const boughtTogether=db.prepare(`
      SELECT oi2.listing_id, COUNT(DISTINCT oi.order_id) AS pair_count
      FROM order_items oi
      JOIN orders o ON o.id=oi.order_id AND o.status='paid'
      JOIN order_items oi2 ON oi2.order_id=oi.order_id AND oi2.listing_id<>oi.listing_id
      JOIN listings l ON l.id=oi2.listing_id AND l.status='published' AND l.moderation_status='approved'
      WHERE oi.listing_id=?
      GROUP BY oi2.listing_id ORDER BY pair_count DESC LIMIT 6
    `).all(listingId);
    return res.json({frequentlyBoughtTogether:boughtTogether.map(row=>({listingId:row.listing_id,pairCount:row.pair_count}))});
  });

  require('./house-experiences').registerHouseExperiences({app,db,imagesDir,authBuyer,authDesigner,upload,fail,rateLimit,moderateDesignerImage,serializeListing,options});

  app.get('/api/designers', (_req,res)=>{
    const rows=db.prepare(`SELECT dp.id,dp.display_name,dp.brand_name,dp.bio,dp.portrait_storage_key,
      COUNT(l.id) piece_count,
      SUM(CASE WHEN ir.status='sold' THEN 1 ELSE 0 END) sold_count,
      SUM(CASE WHEN l.status='published' AND l.moderation_status='approved' AND ir.status IS NULL THEN 1 ELSE 0 END) available_count
      FROM designer_profiles dp
      LEFT JOIN listings l ON l.designer_id=dp.id AND l.status!='deleted'
      LEFT JOIN inventory_reservations ir ON ir.listing_id=l.id AND ir.status='sold'
      WHERE dp.status='active' GROUP BY dp.id ORDER BY COALESCE(dp.brand_name,dp.display_name)`).all();
    return res.json({designers:rows.map(d=>({id:d.id,displayName:d.display_name,brandName:d.brand_name,bio:d.bio||'',portraitUrl:d.portrait_storage_key?`/media/designers/${encodeURIComponent(d.id)}/portrait`:null,pieceCount:d.piece_count||0,soldCount:d.sold_count||0,availableCount:d.available_count||0}))});
  });

  app.get('/api/designers/:designerId', (req, res) => {
    const designer = db.prepare(`SELECT id, display_name, brand_name, bio, location, production_method, categories, portfolio_url, social_url, portrait_storage_key, logo_storage_key
      FROM designer_profiles WHERE id = ? AND status = 'active'`).get(req.params.designerId);
    if (!designer) return fail(res, 404, 'designer_not_found', 'Designer storefront not found.');
    const rows = db.prepare(`SELECT l.*, COALESCE(dp.brand_name, dp.display_name) AS designer_name
      FROM listings l JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE l.designer_id=? AND l.status='published' AND l.moderation_status='approved'
      ORDER BY l.published_at DESC, l.created_at DESC`).all(designer.id);
    let categories=[]; try { categories=JSON.parse(designer.categories||'[]'); } catch {}
    const likes=db.prepare(`SELECT COUNT(*) count FROM buyer_favorites bf JOIN listings l ON l.id=bf.listing_id WHERE l.designer_id=?`).get(designer.id)?.count||0;
    const badges=db.prepare(`SELECT badge_type,MIN(awarded_at) awarded_at FROM user_badges WHERE buyer_subject IN (?,?) GROUP BY badge_type ORDER BY awarded_at ASC`).all(designerBadgeSubject(designer.id),`designer:${designer.id}`)
      .map(b=>({type:b.badge_type,label:b.badge_type==='supporter'?'House Supporter':b.badge_type==='verified_buyer'?'Verified Buyer':b.badge_type,awardedAt:b.awarded_at}));
    return res.json({designer:{id:designer.id,displayName:designer.display_name,brandName:designer.brand_name,bio:designer.bio||'',location:designer.location||'',productionMethod:designer.production_method||'',categories:Array.isArray(categories)?categories:[],portfolioUrl:designer.portfolio_url||null,socialUrl:designer.social_url||null,portraitUrl:designer.portrait_storage_key?`/media/designers/${encodeURIComponent(designer.id)}/portrait`:null,logoUrl:designer.logo_storage_key?`/media/designers/${encodeURIComponent(designer.id)}/logo`:null,totalLikes:Number(likes),badges},items:rows.map(row=>serializeListing(row,'public'))});
  });

  app.post('/api/my/designer-profile/portrait', authDesigner, upload.single('image'), async (req,res,next)=>{
    try{
      if(!req.file)return fail(res,400,'missing_image','Choose a portrait to upload.');
      const detectedMime=detectImageMime(req.file.buffer);
      if(!detectedMime)return fail(res,415,'unsupported_image','Upload a valid JPEG, PNG, or WebP image.');
      const metadata=await sharp(req.file.buffer,{failOn:'error',limitInputPixels:MAX_IMAGE_PIXELS}).metadata();
      if(!metadata.width||!metadata.height||metadata.width>MAX_IMAGE_DIMENSION||metadata.height>MAX_IMAGE_DIMENSION)return fail(res,422,'invalid_dimensions','Image dimensions are too large.');
      const safety=await moderateDesignerImage(req.file.buffer,detectedMime,'designer portrait');
      if(!safety.allow||safety.needsHumanReview)return fail(res,422,'image_requires_review',safety.reason||'This portrait needs review before it can be shown.');
      const profile=db.prepare("SELECT portrait_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);
      if(!profile)return fail(res,404,'designer_not_found','Active designer profile not found.');
      const storageKey=`designer-${req.designerId}-portrait.webp`;
      await sharp(req.file.buffer,{failOn:'error',limitInputPixels:MAX_IMAGE_PIXELS}).rotate().resize(1200,1200,{fit:'cover',position:'attention'}).webp({quality:88,effort:4}).toFile(path.join(imagesDir,storageKey));
      db.prepare('UPDATE designer_profiles SET portrait_storage_key=? WHERE id=?').run(storageKey,req.designerId);
      return res.json({portraitUrl:`/media/designers/${encodeURIComponent(req.designerId)}/portrait`});
    }catch(error){return next(error);}
  });

  app.delete('/api/my/designer-profile/portrait', authDesigner, async (req,res,next)=>{
    try{const profile=db.prepare("SELECT portrait_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);if(!profile)return fail(res,404,'designer_not_found','Active designer profile not found.');if(profile.portrait_storage_key)await fs.promises.unlink(path.join(imagesDir,profile.portrait_storage_key)).catch(()=>{});db.prepare('UPDATE designer_profiles SET portrait_storage_key=NULL WHERE id=?').run(req.designerId);return res.json({removed:true});}catch(error){return next(error);}
  });

  app.get('/media/designers/:designerId/portrait', (req,res)=>{
    const profile=db.prepare("SELECT portrait_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.params.designerId);
    if(!profile?.portrait_storage_key)return fail(res,404,'not_found','Designer portrait not found.');
    res.type('image/webp');res.set('Cache-Control','public, max-age=3600');return res.sendFile(path.join(imagesDir,profile.portrait_storage_key));
  });

  app.post('/api/my/designer-profile/logo', authDesigner, upload.single('image'), async (req,res,next)=>{
    try{
      if(!req.file)return fail(res,400,'missing_image','Choose a logo to upload.');
      const detectedMime=detectImageMime(req.file.buffer);
      if(!detectedMime)return fail(res,415,'unsupported_image','Upload a valid JPEG, PNG, or WebP image.');
      const metadata=await sharp(req.file.buffer,{failOn:'error',limitInputPixels:MAX_IMAGE_PIXELS}).metadata();
      if(!metadata.width||!metadata.height||metadata.width>MAX_IMAGE_DIMENSION||metadata.height>MAX_IMAGE_DIMENSION)return fail(res,422,'invalid_dimensions','Image dimensions are too large.');
      const safety=await moderateDesignerImage(req.file.buffer,detectedMime,'designer brand logo');
      if(!safety.allow||safety.needsHumanReview)return fail(res,422,'image_requires_review',safety.reason||'This logo needs review before it can be shown.');
      const profile=db.prepare("SELECT logo_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);
      if(!profile)return fail(res,404,'designer_not_found','Active designer profile not found.');
      const storageKey=`designer-${req.designerId}-logo.webp`;
      await sharp(req.file.buffer,{failOn:'error',limitInputPixels:MAX_IMAGE_PIXELS}).rotate().resize(600,600,{fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:4}).toFile(path.join(imagesDir,storageKey));
      db.prepare('UPDATE designer_profiles SET logo_storage_key=? WHERE id=?').run(storageKey,req.designerId);
      return res.json({logoUrl:`/media/designers/${encodeURIComponent(req.designerId)}/logo`});
    }catch(error){return next(error);}
  });

  app.delete('/api/my/designer-profile/logo', authDesigner, async (req,res,next)=>{
    try{const profile=db.prepare("SELECT logo_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);if(!profile)return fail(res,404,'designer_not_found','Active designer profile not found.');if(profile.logo_storage_key)await fs.promises.unlink(path.join(imagesDir,profile.logo_storage_key)).catch(()=>{});db.prepare('UPDATE designer_profiles SET logo_storage_key=NULL WHERE id=?').run(req.designerId);return res.json({removed:true});}catch(error){return next(error);}
  });

  app.get('/media/designers/:designerId/logo', (req,res)=>{
    const profile=db.prepare("SELECT logo_storage_key FROM designer_profiles WHERE id=? AND status='active'").get(req.params.designerId);
    if(!profile?.logo_storage_key)return fail(res,404,'not_found','Designer logo not found.');
    res.type('image/webp');res.set('Cache-Control','no-cache');return res.sendFile(path.join(imagesDir,profile.logo_storage_key));
  });

  app.patch('/api/my/designer-profile', authDesigner, (req,res) => {
    const current=db.prepare("SELECT * FROM designer_profiles WHERE id=? AND status='active'").get(req.designerId);
    if(!current)return fail(res,404,'designer_not_found','Active designer profile not found.');
    const brandName=String(req.body?.brandName??current.brand_name).trim();
    const bio=String(req.body?.bio??current.bio??'').trim();
    const location=String(req.body?.location??current.location??'').trim();
    const productionMethod=String(req.body?.productionMethod??current.production_method??'').trim();
    const portfolioUrl=String(req.body?.portfolioUrl??current.portfolio_url??'').trim();
    const socialUrl=String(req.body?.socialUrl??current.social_url??'').trim();
    const categories=Array.isArray(req.body?.categories)?[...new Set(req.body.categories.map(v=>String(v).trim()).filter(Boolean))]:(()=>{try{return JSON.parse(current.categories||'[]')}catch{return[]}})();
    if(!brandName||brandName.length>120||bio.length>2000||location.length>160||productionMethod.length>120||portfolioUrl.length>500||socialUrl.length>500||!validOptionalHttpUrl(portfolioUrl)||!validOptionalHttpUrl(socialUrl)||categories.length>12||categories.some(v=>v.length>80))return fail(res,422,'validation_error','Check the storefront profile fields and links.');
    db.prepare('UPDATE designer_profiles SET brand_name=?,bio=?,location=?,production_method=?,categories=?,portfolio_url=?,social_url=? WHERE id=?').run(brandName,bio||null,location||null,productionMethod||null,JSON.stringify(categories),portfolioUrl||null,socialUrl||null,req.designerId);
    return res.json({ok:true,storefrontUrl:`/designers/${encodeURIComponent(req.designerId)}`});
  });

  app.get('/api/my/listings', authDesigner, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE designer_id = ? AND status != 'deleted'
      ORDER BY updated_at DESC
    `).all(req.designerId);
    res.json({ items: rows.map((row) => serializeListing(row, 'private')) });
  });

  app.post('/api/listings', authDesigner, (req, res) => {
    const validation = validateListingInput(req.body || {});
    if (validation.error) return fail(res, 422, 'validation_error', validation.error);

    const submittedKey = req.get('idempotency-key') || req.body.idempotencyKey;
    const idempotencyKey = typeof submittedKey === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(submittedKey) ? submittedKey : null;
    if (submittedKey && !idempotencyKey) {
      return fail(res, 400, 'invalid_idempotency_key', 'Use a valid idempotency key between 8 and 128 characters.');
    }

    if (idempotencyKey) {
      const existing = db.prepare('SELECT * FROM listings WHERE designer_id = ? AND idempotency_key = ?').get(req.designerId, idempotencyKey);
      if (existing) return res.status(200).json({ item: serializeListing(existing, 'private'), reused: true });
    }

    const id = makeId();
    const timestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO listings (
        id, designer_id, idempotency_key, title, description, price, category, style, size, fit_measurements, aesthetic, pattern, materials, care_instructions, production_type, availability, alterations_available, takes_requests, seo_title, seo_description, seo_tags, share_image_url, shipping_cost_cents, free_shipping_threshold_cents, handling_days_min, handling_days_max, international_shipping, sku, stock_quantity, low_stock_threshold, status, moderation_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?)
    `).run(
      id,
      req.designerId,
      idempotencyKey,
      validation.value.title,
      validation.value.description,
      validation.value.price,
      validation.value.category,
      validation.value.style || null,
      validation.value.size || null,
      validation.value.fitMeasurements === null ? null : JSON.stringify(validation.value.fitMeasurements),
      validation.value.aesthetic || null,
      validation.value.pattern || null,
      validation.value.materials || null,
      validation.value.careInstructions || null,
      validation.value.productionType,
      validation.value.availability,
      validation.value.alterationsAvailable ? 1 : 0,
      validation.value.takesRequests ? 1 : 0,
      validation.value.seoTitle || null,
      validation.value.seoDescription || null,
      validation.value.seoTags || null,
      validation.value.shareImageUrl || null,
      validation.value.shippingCostCents,
      validation.value.freeShippingThresholdCents,
      validation.value.handlingDaysMin,
      validation.value.handlingDaysMax,
      validation.value.internationalShipping ? 1 : 0,
      validation.value.sku || null,
      validation.value.stockQuantity,
      validation.value.lowStockThreshold,
      timestamp,
      timestamp
    );

    return res.status(201).json({ item: serializeListing(getListing(id), 'private'), reused: false });
  });

  app.get('/api/listings/:listingId', authDesigner, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    return res.json({ item: serializeListing(row, 'private') });
  });

  app.put('/api/listings/:listingId', authDesigner, (req, res) => {
    const result = db.transaction(() => {
      const row = getListing(req.params.listingId);
      if (!row || row.designer_id !== req.designerId || row.status === 'deleted')
        return { error: [404, 'not_found', 'Listing not found.'] };
      if (!['draft','rejected','published'].includes(row.status))
        return { error: [409, 'not_editable', 'Only draft, rejected, or published listings can be edited.'] };
      const input = { ...req.body,
        productionType: req.body?.productionType ?? row.production_type ?? 'One of a Kind',
        stockQuantity: req.body?.stockQuantity ?? row.stock_quantity,
        lowStockThreshold: req.body?.lowStockThreshold ?? row.low_stock_threshold };
      const validation = validateListingInput(input, row);
      if (validation.error) return { error: [422, 'validation_error', validation.error] };

      const inventoryChanged = validation.value.stockQuantity !== Number(row.stock_quantity) ||
        validation.value.productionType !== (row.production_type || 'One of a Kind');
      const expectedVersion = req.body?.expectedVersion;
      if ((inventoryChanged && !Number.isInteger(expectedVersion)) ||
          (expectedVersion != null && expectedVersion !== Number(row.version)))
        return { error: [409,'stale_listing','This listing changed. Reload it before saving inventory.'] };
      const inventoryError = inventoryChangeError(row, validation.value.stockQuantity, validation.value.productionType);
      if (inventoryError) return { error: [409,inventoryError.code,inventoryError.message] };
      const timestamp = new Date().toISOString();
      db.prepare(`
        UPDATE listings
        SET title = ?, description = ?, price = ?, category = ?, style = ?, size = ?, fit_measurements = COALESCE(?, fit_measurements), aesthetic = ?, pattern = ?, materials = ?, care_instructions = ?, production_type = ?, availability = ?, alterations_available = ?, takes_requests = ?, seo_title = ?, seo_description = ?, seo_tags = ?, share_image_url = ?, shipping_cost_cents = ?, free_shipping_threshold_cents = ?, handling_days_min = ?, handling_days_max = ?, international_shipping = ?, sku = ?, stock_quantity = ?, low_stock_threshold = ?,
            status = CASE WHEN status = 'published' THEN 'published' ELSE 'draft' END,
            moderation_status = CASE WHEN status = 'published' THEN 'approved' ELSE 'pending' END,
            moderation_reason = NULL, updated_at = ?, version = version + 1
        WHERE id = ?
      `).run(
        validation.value.title,
        validation.value.description,
        validation.value.price,
        validation.value.category,
        validation.value.style || null,
        validation.value.size || null,
        validation.value.fitMeasurements === null ? null : JSON.stringify(validation.value.fitMeasurements),
        validation.value.aesthetic || null,
        validation.value.pattern || null,
        validation.value.materials || null,
        validation.value.careInstructions || null,
        validation.value.productionType,
        validation.value.availability,
        validation.value.alterationsAvailable ? 1 : 0,
        validation.value.takesRequests ? 1 : 0,
        validation.value.seoTitle || null,
        validation.value.seoDescription || null,
        validation.value.seoTags || null,
        validation.value.shareImageUrl || null,
        validation.value.shippingCostCents,
        validation.value.freeShippingThresholdCents,
        validation.value.handlingDaysMin,
        validation.value.handlingDaysMax,
        validation.value.internationalShipping ? 1 : 0,
        validation.value.sku || null,
        validation.value.stockQuantity,
        validation.value.lowStockThreshold,
        timestamp,
        row.id
      );

      if (validation.value.stockQuantity !== Number(row.stock_quantity)) {
        const adjustmentId=makeId(), previousInventory=listingInventory(row);
        db.prepare(`INSERT INTO inventory_adjustments(id,listing_id,delta,quantity_after,reason,actor_type,actor_id,created_at)
          VALUES (?,?,?,?,?,'designer',?,?)`).run(adjustmentId,row.id,validation.value.stockQuantity-Number(row.stock_quantity),validation.value.stockQuantity,'Designer inventory update',req.designerId,timestamp);
        notifyInventoryState(getListing(row.id),`adjustment:${adjustmentId}`,{previousInventory});
      }
      return { item: serializeListing(getListing(row.id), 'private') };
    }).immediate();
    if (result.error) return fail(res,...result.error);
    return res.json(result);
  });


  app.put('/api/listings/:listingId/enhancements', authDesigner, (req,res) => {
    const row=ownedEditableListing(req,res); if(!row)return;
    const giftWrapAvailable=req.body?.giftWrapAvailable===true;
    const giftWrapPrice=Number(req.body?.giftWrapPrice || 0);
    if(!Number.isFinite(giftWrapPrice)||giftWrapPrice<0||giftWrapPrice>250)return fail(res,422,'validation_error','Gift-wrap price must be between $0 and $250.');
    const tryOnVideoUrl=String(req.body?.tryOnVideoUrl||'').trim();
    const movementVideoUrl=String(req.body?.movementVideoUrl||'').trim();
    for(const url of [tryOnVideoUrl,movementVideoUrl]) if(url && !/^https:\/\//i.test(url)) return fail(res,422,'validation_error','Video clips must use secure HTTPS links.');
    const photoAngles=Array.isArray(req.body?.photoAngles)?req.body.photoAngles.slice(0,10).map(v=>['Front','Back','Left','Right','Detail','Other'].includes(String(v))?String(v):''):[];
    db.prepare(`INSERT INTO listing_enhancements (listing_id,gift_wrap_available,gift_wrap_price_cents,try_on_video_url,movement_video_url,photo_angles,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(listing_id) DO UPDATE SET gift_wrap_available=excluded.gift_wrap_available,gift_wrap_price_cents=excluded.gift_wrap_price_cents,try_on_video_url=excluded.try_on_video_url,movement_video_url=excluded.movement_video_url,photo_angles=excluded.photo_angles,updated_at=excluded.updated_at`)
      .run(row.id,giftWrapAvailable?1:0,Math.round(giftWrapPrice*100),tryOnVideoUrl||null,movementVideoUrl||null,JSON.stringify(photoAngles),new Date().toISOString());
    return res.json({item:serializeListing(getListing(row.id),'private')});
  });

  app.post('/api/listings/:listingId/images', authDesigner, upload.single('image'), async (req, res, next) => {
    try {
      const row = ownedEditableListing(req, res);
      if (!row) return;
      if (!req.file) return fail(res, 400, 'missing_image', 'Choose one image to upload.');

      const clientImageKey = req.get('idempotency-key') || req.body.clientImageKey;
      if (typeof clientImageKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(clientImageKey)) {
        return fail(res, 400, 'invalid_image_key', 'A unique image idempotency key is required.');
      }

      const existing = db.prepare('SELECT * FROM listing_images WHERE listing_id = ? AND client_image_key = ?').get(row.id, clientImageKey);
      if (existing) return res.status(200).json({ item: serializeListing(getListing(row.id), 'private'), reused: true });

      const detectedMime = detectImageMime(req.file.buffer);
      if (!detectedMime) return fail(res, 415, 'unsupported_image', 'Upload a valid JPEG, PNG, or WebP image.');

      let metadata;
      try {
        metadata = await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      } catch {
        return fail(res, 415, 'invalid_image', 'The selected file is not a readable image.');
      }

      if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
        return fail(res, 422, 'invalid_dimensions', 'Image dimensions must be 12,000 pixels or less on either side.');
      }
      if (metadata.pages && metadata.pages > 1) return fail(res, 415, 'animated_image', 'Animated images are not supported.');
      const safety=await moderateDesignerImage(req.file.buffer,detectedMime,'designer product/listing photo');
      if(!safety.allow||safety.needsHumanReview)return fail(res,422,'image_requires_review',safety.reason||'This product photo needs review before it can be published.');

      const count = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
      if (count >= MAX_IMAGES) return fail(res, 422, 'image_limit', `A design can have at most ${MAX_IMAGES} images.`);

      const imageId = makeId();
      const storageKey = `${imageId}.webp`;
      const targetPath = path.join(imagesDir, storageKey);
      await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
        .rotate()
        .webp({ quality: 88, effort: 4 })
        .toFile(targetPath);

      const timestamp = new Date().toISOString();
      const imagePosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).next_pos;
      db.prepare(`
        INSERT INTO listing_images (
          id, listing_id, client_image_key, storage_key, position, mime_type,
          size_bytes, width, height, checksum, upload_status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, 'ready', ?)
      `).run(
        imageId,
        row.id,
        clientImageKey,
        storageKey,
        imagePosition,
        req.file.size,
        metadata.width,
        metadata.height,
        crypto.createHash('sha256').update(req.file.buffer).digest('hex'),
        timestamp
      );

      db.prepare('UPDATE listings SET updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
      return res.status(201).json({ item: serializeListing(getListing(row.id), 'private'), reused: false });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/listings/:listingId/images/:imageId/content', authAdmin, (req, res) => {
    const row = db.prepare(`
      SELECT storage_key, mime_type
      FROM listing_images
      WHERE id = ? AND listing_id = ? AND upload_status = 'ready'
    `).get(req.params.imageId, req.params.listingId);
    if (!row) return fail(res, 404, 'not_found', 'Image not found.');
    res.type(row.mime_type);
    res.set('Cache-Control', 'private, no-store');
    return res.sendFile(path.join(imagesDir, row.storage_key));
  });

  app.get('/api/listings/:listingId/images/:imageId/content', authDesigner, (req, res) => {
    const row = db.prepare(`
      SELECT i.storage_key, i.mime_type
      FROM listing_images i
      JOIN listings l ON l.id = i.listing_id
      JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE i.id = ? AND l.id = ? AND l.designer_id = ? AND i.upload_status = 'ready'
    `).get(req.params.imageId, req.params.listingId, req.designerId);
    if (!row) return fail(res, 404, 'not_found', 'Image not found.');
    res.type(row.mime_type);
    res.set('Cache-Control', 'private, no-store');
    return res.sendFile(path.join(imagesDir, row.storage_key));
  });

  app.put('/api/listings/:listingId/images/order', authDesigner, (req, res) => {
    const row = ownedEditableListing(req, res);
    if (!row) return;

    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds : [];
    if (!imageIds.length || imageIds.length > MAX_IMAGES || imageIds.some((id) => typeof id !== 'string')) {
      return fail(res, 422, 'invalid_order', 'Provide an ordered list of image IDs.');
    }

    const currentIds = db.prepare("SELECT id FROM listing_images WHERE listing_id = ? AND upload_status = 'ready' ORDER BY position ASC").all(row.id).map((item) => item.id);
    if (new Set(imageIds).size !== imageIds.length || imageIds.length !== currentIds.length || imageIds.some((id) => !currentIds.includes(id))) {
      return fail(res, 422, 'invalid_order', 'The order must include every image exactly once.');
    }

    const timestamp = new Date().toISOString();
    const stmt = db.prepare('UPDATE listing_images SET position = ? WHERE id = ? AND listing_id = ?');
    db.transaction(() => {
      imageIds.forEach((id, index) => stmt.run(index, id, row.id));
      db.prepare('UPDATE listings SET updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
    })();

    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.delete('/api/listings/:listingId/images/:imageId', authDesigner, (req, res) => {
    const row = ownedEditableListing(req, res);
    if (!row) return;
    const target = db.prepare("SELECT * FROM listing_images WHERE id = ? AND listing_id = ? AND upload_status = 'ready'").get(req.params.imageId, row.id);
    if (!target) return fail(res, 404, 'not_found', 'Image not found.');

    const remaining = db.prepare("SELECT id FROM listing_images WHERE listing_id = ? AND upload_status = 'ready' AND id != ? ORDER BY position ASC").all(row.id, target.id);
    const timestamp = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE listing_images SET upload_status = 'deleted', deleted_at = ? WHERE id = ?").run(timestamp, target.id);
      remaining.forEach((image, index) => {
        db.prepare('UPDATE listing_images SET position = ? WHERE id = ?').run(index, image.id);
      });
      db.prepare('UPDATE listings SET legacy_image_url = NULL, updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
    })();

    const storagePath = path.join(imagesDir, target.storage_key);
    fs.promises.unlink(storagePath).catch(() => {});
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.delete('/api/listings/:listingId', authDesigner, async (req, res, next) => {
    try {
      const row = getListing(req.params.listingId);
      if (!row || row.designer_id !== req.designerId || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
      await deleteListingAndImages(row);
      return res.json({ deleted: true, id: row.id });
    } catch (error) { return next(error); }
  });

  app.post('/api/listings/:listingId/submit', authDesigner, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (!['draft', 'rejected'].includes(row.status)) return res.json({ item: serializeListing(row, 'private'), reused: true });

    const imageCount = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
    if (imageCount < 1) return fail(res, 422, 'images_required', 'Add at least one ready image before submitting.');
    if (req.body?.marketplaceRulesAccepted !== true) return fail(res, 422, 'marketplace_rules_required', 'Confirm that this listing follows House of Briar marketplace rules before submitting.');

    const nextStatus = reviewRequired ? 'pending_review' : 'published';
    const nextModeration = reviewRequired ? 'pending' : 'approved';
    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = ?, moderation_status = ?, moderation_reason = NULL, published_at = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(nextStatus, nextModeration, reviewRequired ? null : timestamp, timestamp, row.id);

    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  db.exec(`CREATE TABLE IF NOT EXISTS listing_reports (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, reason TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL, resolved_at TEXT,
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  )`);
  app.post('/api/listings/:listingId/report', reportLimiter, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status !== 'published' || row.moderation_status !== 'approved') return fail(res, 404, 'not_found', 'Listing not found.');
    const reason = String(req.body?.reason || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!['misleading', 'copyright', 'prohibited', 'inappropriate', 'other'].includes(reason) || notes.length > 2000 || (reason === 'other' && !notes)) return fail(res, 422, 'validation_error', 'Choose a reason; add details for Other. Notes may be up to 2,000 characters.');
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO listing_reports (id,listing_id,reason,notes,created_at) VALUES (?,?,?,?,?)').run(id,row.id,reason,notes,new Date().toISOString());
    return res.status(201).json({ id, status: 'open' });
  });
  app.get('/api/admin/listing-reports', authAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const reports = db.prepare(`SELECT r.*,l.title,l.status listing_status,l.designer_id FROM listing_reports r JOIN listings l ON l.id=r.listing_id ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300`).all();
    res.json({ reports });
  });
  app.post('/api/admin/listing-reports/:reportId/resolve', authAdmin, (req, res) => {
    const report = db.prepare('SELECT id FROM listing_reports WHERE id=?').get(req.params.reportId);
    if (!report) return fail(res,404,'not_found','Report not found.');
    db.prepare("UPDATE listing_reports SET status='resolved',resolved_at=? WHERE id=?").run(new Date().toISOString(),report.id);
    res.json({ id: report.id, status: 'resolved' });
  });

  app.get('/api/admin/listings', authAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = db.prepare("SELECT * FROM listings WHERE status != 'deleted' ORDER BY updated_at DESC LIMIT 300").all();
    res.json({ items: rows.map(row => serializeListing(row, 'admin')) });
  });

  app.patch('/api/admin/listings/bulk', authAdmin, (req, res) => {
    const ids = Array.isArray(req.body?.listingIds) ? Array.from(new Set(req.body.listingIds.filter(id => typeof id === 'string'))).slice(0, 100) : [];
    if (!ids.length) return fail(res, 422, 'listings_required', 'Choose at least one listing.');
    const availability = req.body?.availability;
    const status = req.body?.status;
    const priceDeltaPercent = req.body?.priceDeltaPercent == null || req.body.priceDeltaPercent === '' ? null : Number(req.body.priceDeltaPercent);
    if (availability != null && !['floor','backstock'].includes(availability)) return fail(res, 422, 'invalid_availability', 'Choose floor or backstock.');
    if (status != null && !['draft','archived'].includes(status)) return fail(res, 422, 'invalid_status', 'Bulk status changes can only move listings to draft or archived. Publishing requires individual moderation approval.');
    if (priceDeltaPercent !== null && (!Number.isFinite(priceDeltaPercent) || priceDeltaPercent < -100 || priceDeltaPercent > 1000)) return fail(res, 422, 'invalid_price_adjustment', 'Price adjustment must be between -100% and 1000%.');
    if (availability == null && status == null && priceDeltaPercent === null) return fail(res, 422, 'changes_required', 'Choose at least one bulk change.');
    const timestamp = new Date().toISOString();
    const update = db.transaction(() => {
      for (const id of ids) {
        const row = getListing(id);
        if (!row || row.status === 'deleted') continue;
        if (availability != null) db.prepare('UPDATE listings SET availability=?,updated_at=?,version=version+1 WHERE id=?').run(availability,timestamp,id);
        if (priceDeltaPercent !== null) db.prepare('UPDATE listings SET price=ROUND(price*(1+?/100.0),2),updated_at=?,version=version+1 WHERE id=?').run(priceDeltaPercent,timestamp,id);
        if (status != null) db.prepare("UPDATE listings SET status=?, published_at=CASE WHEN ?='archived' THEN published_at ELSE NULL END, updated_at=?,version=version+1 WHERE id=?").run(status,status,timestamp,id);
      }
    });
    update();
    const placeholders=ids.map(()=>'?').join(',');
    const rows=db.prepare(`SELECT * FROM listings WHERE id IN (${placeholders}) AND status!='deleted' ORDER BY updated_at DESC`).all(...ids);
    return res.json({ items: rows.map(row=>serializeListing(row,'admin')) });
  });

    app.post('/api/admin/listings/:listingId/inventory/adjust', authAdmin, (req,res) => {
    const result = db.transaction(() => {
      const row=getListing(req.params.listingId); if(!row||row.status==='deleted')return { error: [404,'not_found','Listing not found.'] };
      const delta=Number(req.body?.delta); const reason=String(req.body?.reason||'').trim();
      if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>100000)return { error: [422,'invalid_adjustment','Adjustment must be a non-zero whole number.'] };
      if(!reason||reason.length>240)return { error: [422,'reason_required','Provide an inventory adjustment reason up to 240 characters.'] };
      if((row.production_type||'One of a Kind')==='Made to Order')return { error: [409,'inventory_not_tracked','Made-to-order listings do not use on-hand inventory.'] };
      const after=Number(row.stock_quantity??0)+delta; if(after<0)return { error: [409,'insufficient_stock','Inventory cannot be adjusted below zero.'] };
      if((row.production_type||'One of a Kind')==='One of a Kind'&&!([0,1].includes(after)))return { error: [409,'one_of_a_kind_limit','One-of-a-kind inventory can only be 0 (sold/unavailable) or 1 (available).'] };
      const inventoryError=inventoryChangeError(row,after);
      if(inventoryError)return { error: [409,inventoryError.code,inventoryError.message] };
      const now=new Date().toISOString();
      const adjustmentId=makeId(), previousInventory=listingInventory(row);
      db.prepare('UPDATE listings SET stock_quantity=?,updated_at=?,version=version+1 WHERE id=?').run(after,now,row.id);
      db.prepare("INSERT INTO inventory_adjustments(id,listing_id,delta,quantity_after,reason,actor_type,actor_id,created_at) VALUES (?,?,?,?,?,'admin','admin',?)")
        .run(adjustmentId,row.id,delta,after,reason,now);
      notifyInventoryState(getListing(row.id),`adjustment:${adjustmentId}`,{previousInventory});
      return {item:serializeListing(getListing(row.id),'admin')};
    }).immediate();
    if (result.error) return fail(res,...result.error);
    return res.json(result);
  });

  app.get('/api/admin/listings/:listingId/inventory/history', authAdmin, (req,res) => {
    const row=getListing(req.params.listingId); if(!row)return fail(res,404,'not_found','Listing not found.');
    return res.json({items:db.prepare('SELECT * FROM inventory_adjustments WHERE listing_id=? ORDER BY created_at DESC LIMIT 100').all(row.id)});
  });

    app.get('/api/admin/listings/review-queue', authAdmin, (_req, res) => {
    const rows = db.prepare("SELECT * FROM listings WHERE status = 'pending_review' AND moderation_status = 'pending' ORDER BY updated_at ASC").all();
    return res.json({ items: rows.map(row => serializeListing(row, 'admin')) });
  });

  app.post('/api/admin/listings/:listingId/approve', authAdmin, async (req, res, next) => {
    try {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'pending_review') return fail(res, 409, 'invalid_state', 'Only pending listings can be approved.');

    const imageCount = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
    if (imageCount < 1) return fail(res, 422, 'images_required', 'This listing has no ready images.');
    await requireStripeSellerReady(row.designer_id);

    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = 'published', moderation_status = 'approved', moderation_reason = NULL, published_at = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(timestamp, timestamp, row.id);
    notifyDesigner(row.designer_id,'listing_review','Listing approved',`${row.title} was approved and is now published.`,{listingId:row.id,actionPath:`/shop/${row.id}`,priority:'normal',source:'admin',adminLabel:'House of Briar'});

    return res.json({ item: serializeListing(getListing(row.id), 'public') });
    } catch(error) { if(error.statusCode)return fail(res,error.statusCode,error.code||'payout_setup_incomplete',error.message); return next(error); }
  });

  app.post('/api/admin/listings/:listingId/reject', authAdmin, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'pending_review') return fail(res, 409, 'invalid_state', 'Only pending listings can be rejected.');

    const reason = String(req.body?.reason || '').trim();
    if (!reason || reason.length > 1000) return fail(res, 422, 'reason_required', 'Provide a rejection reason up to 1,000 characters.');
    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = 'rejected', moderation_status = 'rejected', moderation_reason = ?, published_at = NULL, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(reason, timestamp, row.id);
    notifyDesigner(row.designer_id,'listing_review','Changes requested',`${row.title} needs changes before it can be published. ${reason}`,{listingId:row.id,actionPath:'/account',priority:'important',source:'admin',adminLabel:'House of Briar'});
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.delete('/api/admin/listings/:listingId', authAdmin, async (req, res, next) => {
    try {
      const row = getListing(req.params.listingId);
      if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
      await deleteListingAndImages(row);
      return res.json({ deleted: true, id: row.id });
    } catch (error) { return next(error); }
  });

  app.post('/api/admin/listings/:listingId/unpublish', authAdmin, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'published') return fail(res, 409, 'invalid_state', 'Only published listings can be archived.');

    const timestamp = new Date().toISOString();
    db.prepare(`UPDATE listings SET status = 'archived', updated_at = ?, version = version + 1 WHERE id = ?`).run(timestamp, row.id);
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  
  function supportCategory(message) {
    const value=String(message||'').toLowerCase();
    if (/refund|return|chargeback|dispute|cancel/.test(value)) return 'refund';
    if (/ship|tracking|delivery|carrier|where is/.test(value)) return 'shipping';
    if (/order|status|purchase/.test(value)) return 'order_status';
    return 'general';
  }
  function renderSupportTemplate(template, values) {
    return String(template||'').replace(/\\{\\{(orderId|orderStatus|trackingLine)\\}\\}/g, (_match,key)=>String(values[key]||''));
  }
  function supportOrderContext(orderId,buyerSubject) {
    if(!orderId)return null;
    const order=db.prepare('SELECT id,status FROM orders WHERE id=? AND buyer_subject=?').get(orderId,buyerSubject);
    if(!order)return null;
    const tracking=db.prepare("SELECT tracking_carrier,tracking_number,tracking_status FROM designer_transfers WHERE order_id=? AND tracking_number IS NOT NULL ORDER BY tracking_verified_at DESC LIMIT 1").get(order.id);
    const trackingLine=tracking? ` Tracking: ${tracking.tracking_carrier||'carrier'} ${tracking.tracking_number} (${tracking.tracking_status||'status pending'}).` : ' Tracking has not been posted yet.';
    return {orderId:order.id,orderStatus:order.status,trackingLine};
  }

  app.post('/api/support/messages', authBuyer, async (req,res)=>{
    const message=String(req.body?.message||'').trim();
    const orderId=String(req.body?.orderId||'').trim()||null;
    if(message.length<5||message.length>1500)return fail(res,422,'validation_error','Write a support message between 5 and 1,500 characters.');
    const orderContext=supportOrderContext(orderId,req.buyerSubject);
    if(orderId&&!orderContext)return fail(res,404,'order_not_found','That order is not available in your account.');
    const category=supportCategory(message);
    const id=makeId(),now=new Date().toISOString();
    db.prepare('INSERT INTO support_messages (id,buyer_subject,buyer_email,order_id,category,message,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.buyerSubject,req.buyerEmail||null,orderId,category,message,now);
    const template=db.prepare('SELECT * FROM support_auto_responses WHERE category=?').get(category);
    let autoReply=null;
    if(template?.enabled && req.buyerEmail){
      const values=orderContext||{orderId:'',orderStatus:'',trackingLine:''};
      const subject=renderSupportTemplate(template.subject_template,values);
      autoReply=renderSupportTemplate(template.body_template,values);
      await sendEmail({to:req.buyerEmail,subject,text:autoReply});
      db.prepare("UPDATE support_messages SET status='auto_replied',response_text=?,auto_replied_at=? WHERE id=?").run(autoReply,new Date().toISOString(),id);
    }
    return res.status(201).json({message:{id,category,status:autoReply?'auto_replied':'open',autoReply}});
  });

  app.get('/api/admin/support', authAdmin, (_req,res)=>{
    const messages=db.prepare('SELECT id,buyer_email,order_id,category,message,status,response_text,auto_replied_at,responded_at,created_at FROM support_messages ORDER BY created_at DESC LIMIT 200').all();
    const templates=db.prepare('SELECT category,enabled,subject_template,body_template,updated_at FROM support_auto_responses ORDER BY category').all().map(row=>({...row,enabled:Boolean(row.enabled)}));
    return res.json({messages,templates});
  });

  app.patch('/api/admin/support/templates/:category', authAdmin, (req,res)=>{
    const category=String(req.params.category||'');
    const existing=db.prepare('SELECT category FROM support_auto_responses WHERE category=?').get(category);
    if(!existing)return fail(res,404,'not_found','Support response category not found.');
    const subject=String(req.body?.subjectTemplate||'').trim();
    const body=String(req.body?.bodyTemplate||'').trim();
    const enabled=req.body?.enabled===true?1:0;
    if(!subject||subject.length>180||!body||body.length>4000)return fail(res,422,'validation_error','Provide a subject and response body within the allowed lengths.');
    const updatedAt=new Date().toISOString();
    db.prepare('UPDATE support_auto_responses SET enabled=?,subject_template=?,body_template=?,updated_at=? WHERE category=?').run(enabled,subject,body,updatedAt,category);
    return res.json({template:{category,enabled:Boolean(enabled),subjectTemplate:subject,bodyTemplate:body,updatedAt}});
  });

  app.post('/api/admin/support/:messageId/reply', authAdmin, async (req,res)=>{
    const message=db.prepare('SELECT * FROM support_messages WHERE id=?').get(req.params.messageId);
    if(!message)return fail(res,404,'not_found','Support message not found.');
    const text=String(req.body?.text||'').trim();
    if(!text||text.length>4000)return fail(res,422,'validation_error','Write a response of 4,000 characters or fewer.');
    if(!message.buyer_email)return fail(res,409,'email_unavailable','This customer account does not have an email address available.');
    await sendEmail({to:message.buyer_email,subject:'House of Briar customer service',text});
    const respondedAt=new Date().toISOString();
    db.prepare("UPDATE support_messages SET status='answered',response_text=?,responded_at=? WHERE id=?").run(text,respondedAt,message.id);
    return res.json({message:{id:message.id,status:'answered',responseText:text,respondedAt}});
  });

  app.get('/api/admin/operations', authAdmin, (_req, res) => {
    releaseExpiredInventoryReservations();
    const orders = db.prepare(`SELECT o.id,o.status,o.currency,o.subtotal_cents,o.platform_fee_cents,o.designer_amount_cents,o.created_at,o.paid_at,o.refund_status,o.stripe_refund_id,o.refunded_at,
      COUNT(DISTINCT oi.designer_id) designer_count,COUNT(oi.id) item_count
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`).all();
    const payouts = db.prepare(`SELECT dt.order_id,dt.designer_id,dt.amount_cents,dt.status,dt.error_message,dt.created_at,dt.paid_at,
      dt.tracking_carrier,dt.tracking_number,dt.tracking_status,dt.tracking_verified_at,dt.release_reason,dt.stripe_reversal_id
      FROM designer_transfers dt ORDER BY dt.created_at DESC LIMIT 300`).all();
    const inventory = db.prepare(`SELECT ir.listing_id,ir.order_id,ir.status,ir.reserved_at,ir.expires_at,ir.sold_at,l.title,l.designer_id
      FROM inventory_reservations ir LEFT JOIN listings l ON l.id=ir.listing_id
      WHERE ir.status IN ('reserved','sold') ORDER BY ir.reserved_at DESC LIMIT 300`).all();
    const summary = {
      paidOrders: orders.filter(row=>row.status==='paid'&&row.refund_status!=='succeeded').length,
      refundedOrders: orders.filter(row=>row.refund_status==='succeeded').length,
      pendingOrders: orders.filter(row=>row.status==='pending').length,
      heldPayouts: payouts.filter(row=>row.status==='pending').length,
      failedPayouts: payouts.filter(row=>row.status==='failed').length,
      releasedPayouts: payouts.filter(row=>row.status==='paid'&&!row.stripe_reversal_id).length,
      reversedPayouts: payouts.filter(row=>Boolean(row.stripe_reversal_id)).length,
      activeReservations: inventory.filter(row=>row.status==='reserved').length
    };
    return res.json({summary,orders,payouts,inventory});
  });

  app.get('/api/admin/orders/:orderId', authAdmin, (req,res)=>{
    const order=db.prepare('SELECT id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at,refund_status,stripe_refund_id,refunded_at FROM orders WHERE id=?').get(req.params.orderId);
    if(!order)return fail(res,404,'order_not_found','Order not found.');
    const items=db.prepare('SELECT listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents FROM order_items WHERE order_id=?').all(order.id);
    const payouts=db.prepare('SELECT designer_id,amount_cents,status,error_message,paid_at,tracking_carrier,tracking_number,tracking_status,tracking_verified_at,release_reason,stripe_reversal_id FROM designer_transfers WHERE order_id=?').all(order.id);
    return res.json({order,items,payouts});
  });

  app.post('/api/admin/orders/:orderId/refund', authAdmin, async (req,res,next)=>{
    try{
      let order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
      if(!order)return fail(res,404,'order_not_found','Order not found.');
      if(order.status!=='paid')return fail(res,409,'not_paid','Only paid orders can be refunded.');
      if(order.refund_status==='succeeded')return fail(res,409,'already_refunded','This order has already been refunded.');
      let paymentIntent=order.stripe_payment_intent_id;
      if(!paymentIntent&&order.stripe_session_id){
        const session=await stripeApi(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
        paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:'';
        if(paymentIntent)db.prepare('UPDATE orders SET stripe_payment_intent_id=? WHERE id=?').run(paymentIntent,order.id);
      }
      if(!paymentIntent)return fail(res,409,'payment_reference_missing','Stripe payment reference is unavailable for this order.');
      const paidTransfers=db.prepare("SELECT * FROM designer_transfers WHERE order_id=? AND status='paid'").all(order.id);
      for(const transfer of paidTransfers){
        if(!transfer.stripe_transfer_id)return fail(res,409,'transfer_reference_missing','A released designer payout is missing its Stripe transfer reference.');
        if(!transfer.stripe_reversal_id){
          const reversal=await stripeApi(`transfers/${encodeURIComponent(transfer.stripe_transfer_id)}/reversals`,{method:'POST',body:new URLSearchParams({amount:String(transfer.amount_cents),'metadata[order_id]':order.id,'metadata[designer_id]':transfer.designer_id}).toString(),idempotencyKey:`hob-refund-reversal-${order.id}-${transfer.designer_id}`});
          db.prepare("UPDATE designer_transfers SET stripe_reversal_id=?,release_reason='refund_reversed' WHERE id=?").run(reversal.id,transfer.id);
        }
      }
      const body=new URLSearchParams({payment_intent:paymentIntent,reason:'requested_by_customer','metadata[order_id]':order.id});
      const refund=await stripeApi('refunds',{method:'POST',body:body.toString(),idempotencyKey:`hob-refund-${order.id}`});
      db.prepare("UPDATE orders SET refund_status=?,stripe_refund_id=?,refunded_at=? WHERE id=?").run(refund.status||'pending',refund.id||null,refund.status==='succeeded'?new Date().toISOString():null,order.id);
      if(order.buyer_email)void sendEmail({to:order.buyer_email,subject:'Your House of Briar refund',text:`A refund was issued for order ${order.id}. Stripe refund status: ${refund.status||'pending'}.`});
      return res.json({ok:true,refundId:refund.id,status:refund.status});
    }catch(error){return next(error);}
  });

  async function expireOpenCheckout(order) {
    if (order.stripe_session_id) {
      await stripeApi(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}/expire`, { method: 'POST' });
    }
  }

  app.post('/api/admin/orders/:orderId/cancel', authAdmin, async (req,res,next)=>{
    try {
      const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
      if(!order)return fail(res,404,'order_not_found','Order not found.');
      if(order.status==='paid')return fail(res,409,'refund_required','Paid orders require a Stripe refund rather than cancellation.');
      await expireOpenCheckout(order);
      releaseOrderInventory(order.id);
      return res.json({ok:true,status:'canceled'});
    } catch(error) { return next(error); }
  });

  app.post('/api/admin/orders/:orderId/inventory/release', authAdmin, async (req,res,next)=>{
    try {
      const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
      if(!order)return fail(res,404,'order_not_found','Order not found.');
      if(order.status==='paid')return fail(res,409,'paid_order','Inventory for a paid order cannot be released.');
      await expireOpenCheckout(order);
      const result=db.prepare("UPDATE inventory_reservations SET status='released' WHERE order_id=? AND status='reserved'").run(order.id);
      db.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending'").run(order.id);
      return res.json({ok:true,released:result.changes});
    } catch(error) { return next(error); }
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

  app.get('/api/my/favorites', authBuyer, (req,res) => {
    const rows=db.prepare(`SELECT l.*,COALESCE(dp.brand_name,dp.display_name,l.designer_id) designer_name
      FROM buyer_favorites bf
      JOIN listings l ON l.id=bf.listing_id
      JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE bf.buyer_subject=? AND l.status='published' AND l.moderation_status='approved'
      ORDER BY bf.created_at DESC`).all(req.buyerSubject);
    return res.json({ids:rows.map(row=>row.id),items:rows.map(row=>serializeListing(row,'public'))});
  });

  app.post('/api/my/favorites/:listingId', authBuyer, (req,res) => {
    const listing=db.prepare(`SELECT l.id FROM listings l JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE l.id=? AND l.status='published' AND l.moderation_status='approved'`).get(req.params.listingId);
    if(!listing)return fail(res,404,'listing_not_available','This piece is not available to save.');
    db.prepare('INSERT OR IGNORE INTO buyer_favorites (buyer_subject,listing_id,created_at) VALUES (?,?,?)').run(req.buyerSubject,listing.id,new Date().toISOString());
    return res.status(201).json({saved:true,listingId:listing.id});
  });

  app.delete('/api/my/favorites/:listingId', authBuyer, (req,res) => {
    db.prepare('DELETE FROM buyer_favorites WHERE buyer_subject=? AND listing_id=?').run(req.buyerSubject,req.params.listingId);
    return res.json({saved:false,listingId:req.params.listingId});
  });

  app.post('/api/my/favorites/merge', authBuyer, (req,res) => {
    const ids=Array.isArray(req.body?.listingIds)?[...new Set(req.body.listingIds.map(id=>String(id).trim()).filter(Boolean))].slice(0,250):[];
    const available=db.prepare(`SELECT l.id FROM listings l JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE l.id=? AND l.status='published' AND l.moderation_status='approved'`);
    const insert=db.prepare('INSERT OR IGNORE INTO buyer_favorites (buyer_subject,listing_id,created_at) VALUES (?,?,?)');
    const now=new Date().toISOString(); let merged=0;
    db.transaction(()=>{for(const id of ids){if(available.get(id)){const result=insert.run(req.buyerSubject,id,now);merged+=result.changes;}}})();
    return res.json({merged});
  });

  app.get('/api/listings/:listingId/collector-notes', (req,res)=>{
    const notes=db.prepare(`SELECT n.id,n.note,n.designer_reply,n.created_at,n.replied_at
      FROM collector_notes n JOIN orders o ON o.id=n.order_id
      WHERE n.listing_id=? AND o.status='paid' AND COALESCE(o.refund_status,'')!='succeeded'
      ORDER BY n.created_at DESC`).all(req.params.listingId);
    return res.json({notes:notes.map(n=>({id:n.id,note:n.note,designerReply:n.designer_reply||null,createdAt:n.created_at,repliedAt:n.replied_at||null,verifiedPurchase:true}))});
  });

  app.post('/api/listings/:listingId/collector-notes', authBuyer, (req,res)=>{
    const purchase=db.prepare(`SELECT o.id order_id,oi.designer_id FROM orders o JOIN order_items oi ON oi.order_id=o.id
      WHERE o.buyer_subject=? AND oi.listing_id=? AND o.status='paid' AND COALESCE(o.refund_status,'')!='succeeded'
      ORDER BY o.paid_at DESC LIMIT 1`).get(req.buyerSubject,req.params.listingId);
    if(!purchase)return fail(res,403,'verified_purchase_required','Collector Notes are available only after a verified purchase.');
    const note=String(req.body?.note||'').trim();
    if(!note||note.length>1200)return fail(res,422,'validation_error','Write a Collector Note between 1 and 1,200 characters.');
    const existing=db.prepare('SELECT id FROM collector_notes WHERE order_id=? AND listing_id=? AND buyer_subject=?').get(purchase.order_id,req.params.listingId,req.buyerSubject);
    if(existing)return fail(res,409,'note_exists','You have already left a Collector Note for this purchase.');
    const id=makeId(),now=new Date().toISOString();
    db.prepare('INSERT INTO collector_notes (id,listing_id,order_id,buyer_subject,designer_id,note,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.params.listingId,purchase.order_id,req.buyerSubject,purchase.designer_id,note,now);
    return res.status(201).json({note:{id,note,designerReply:null,createdAt:now,verifiedPurchase:true}});
  });

  app.get('/api/my/collector-notes', authDesigner, (req,res)=>{
    const notes=db.prepare(`SELECT n.id,n.listing_id,n.note,n.designer_reply,n.created_at,n.replied_at,l.title
      FROM collector_notes n JOIN listings l ON l.id=n.listing_id WHERE n.designer_id=? ORDER BY n.created_at DESC`).all(req.designerId);
    return res.json({notes:notes.map(n=>({id:n.id,listingId:n.listing_id,title:n.title,note:n.note,designerReply:n.designer_reply||null,createdAt:n.created_at,repliedAt:n.replied_at||null,verifiedPurchase:true}))});
  });

  app.post('/api/my/collector-notes/:noteId/reply', authDesigner, (req,res)=>{
    const existing=db.prepare('SELECT id,designer_reply FROM collector_notes WHERE id=? AND designer_id=?').get(req.params.noteId,req.designerId);
    if(!existing)return fail(res,404,'note_not_found','Collector Note not found.');
    if(existing.designer_reply)return fail(res,409,'reply_exists','This Collector Note already has a designer reply.');
    const reply=String(req.body?.reply||'').trim();
    if(!reply||reply.length>800)return fail(res,422,'validation_error','Write a reply between 1 and 800 characters.');
    const now=new Date().toISOString();
    db.prepare('UPDATE collector_notes SET designer_reply=?,replied_at=? WHERE id=?').run(reply,now,existing.id);
    return res.json({reply,repliedAt:now});
  });

  app.get('/api/my/donations', authBuyer, (req,res) => {
    const rows=db.prepare("SELECT id,amount_cents,currency,status,created_at,paid_at FROM donations WHERE buyer_subject=? ORDER BY created_at DESC").all(req.buyerSubject);
    return res.json({donations:rows.map(row=>({id:row.id,amountCents:row.amount_cents,currency:row.currency,status:row.status,createdAt:row.created_at,paidAt:row.paid_at||null,badgeEligible:row.status==='paid'&&row.amount_cents>=500}))});
  });

  app.get('/api/my/badges', authBuyer, (req,res) => {
    const rows=db.prepare('SELECT badge_type,awarded_at FROM user_badges WHERE buyer_subject=? ORDER BY awarded_at').all(req.buyerSubject);
    return res.json({badges:rows.map(row=>({type:row.badge_type,awardedAt:row.awarded_at}))});
  });

  app.get('/api/my/purchases', authBuyer, (req, res) => {
    const rows = db.prepare(`SELECT o.id order_id,o.status order_status,o.currency,o.subtotal_cents,o.created_at,o.paid_at,o.refund_status,o.refunded_at,
      oi.listing_id,oi.designer_id,oi.title,oi.quantity,oi.line_total_cents,
      COALESCE(dp.brand_name,dp.display_name,oi.designer_id) designer_name,
      dt.tracking_carrier,dt.tracking_number,dt.tracking_status,dt.tracking_verified_at
      FROM orders o JOIN order_items oi ON oi.order_id=o.id
      LEFT JOIN designer_profiles dp ON dp.id=oi.designer_id
      LEFT JOIN designer_transfers dt ON dt.order_id=o.id AND dt.designer_id=oi.designer_id
      WHERE o.buyer_subject=? ORDER BY o.created_at DESC,oi.title`).all(req.buyerSubject);
    const map=new Map();
    for(const row of rows){if(!map.has(row.order_id))map.set(row.order_id,{id:row.order_id,status:row.order_status,currency:row.currency,subtotalCents:row.subtotal_cents,createdAt:row.created_at,paidAt:row.paid_at,refundStatus:row.refund_status||null,refundedAt:row.refunded_at||null,items:[]});map.get(row.order_id).items.push({listingId:row.listing_id,title:row.title,designerId:row.designer_id,designerName:row.designer_name,designerUrl:`/designers/${encodeURIComponent(row.designer_id)}`,quantity:row.quantity,lineTotalCents:row.line_total_cents,trackingCarrier:row.tracking_carrier||null,trackingNumber:row.tracking_number||null,trackingStatus:row.tracking_status||null,trackingVerifiedAt:row.tracking_verified_at||null});}
    return res.json({orders:[...map.values()]});
  });

  app.get('/api/admin/designers', authAdmin, (_req,res)=>{
    const items=db.prepare("SELECT id,brand_name,display_name,status FROM designer_profiles ORDER BY COALESCE(brand_name,display_name),id").all();
    return res.json({items:items.map(d=>({id:d.id,name:d.brand_name||d.display_name,status:d.status}))});
  });
  app.get('/api/admin/designer-messages', authAdmin, (_req,res)=>{
    const items=db.prepare("SELECT n.*,p.brand_name,p.display_name FROM designer_notifications n JOIN designer_profiles p ON p.id=n.designer_id WHERE n.source='admin' ORDER BY n.created_at DESC LIMIT 200").all();
    return res.json({items:items.map(n=>({id:n.id,designerId:n.designer_id,designerName:n.brand_name||n.display_name,type:n.type,priority:n.priority,title:n.title,body:n.body,listingId:n.listing_id,orderId:n.order_id,createdAt:n.created_at,readAt:n.read_at}))});
  });
  app.post('/api/admin/designers/:designerId/messages', authAdmin, (req,res)=>{
    const designer=db.prepare('SELECT id FROM designer_profiles WHERE id=?').get(req.params.designerId);
    if(!designer)return fail(res,404,'designer_not_found','Designer not found.');
    const title=String(req.body?.title||'').trim(),body=String(req.body?.body||'').trim(),priority=String(req.body?.priority||'normal');
    if(!title||title.length>160||!body||body.length>2000||!['normal','important','urgent'].includes(priority))return fail(res,422,'validation_error','Add a title, message, and valid priority.');
    const listingId=String(req.body?.listingId||'').trim()||null,orderId=String(req.body?.orderId||'').trim()||null;
    const id=notifyDesigner(designer.id,'house_notice',title,body,{listingId,orderId,actionPath:'/account#messages',priority,source:'admin',adminLabel:'House of Briar'});
    return res.status(201).json({message:{id,designerId:designer.id,title,body,priority}});
  });

  app.get('/api/my/designer-notifications', authDesigner, (req,res)=>{
    const items=db.prepare('SELECT * FROM designer_notifications WHERE designer_id=? ORDER BY created_at DESC LIMIT 100').all(req.designerId);
    const unread=items.reduce((sum,item)=>sum+(item.read_at?0:1),0);
    return res.json({unread,items:items.map(item=>({id:item.id,type:item.type,title:item.title,body:item.body,listingId:item.listing_id,orderId:item.order_id,inquiryId:item.inquiry_id,actionPath:item.action_path,priority:item.priority||'normal',source:item.source||'system',adminLabel:item.admin_label||null,readAt:item.read_at,createdAt:item.created_at}))});
  });
  app.patch('/api/my/designer-notifications/:notificationId/read', authDesigner, (req,res)=>{
    const now=new Date().toISOString();
    const result=db.prepare('UPDATE designer_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND designer_id=?').run(now,req.params.notificationId,req.designerId);
    if(!result.changes)return fail(res,404,'notification_not_found','Notification not found.');
    return res.json({ok:true,readAt:now});
  });
  app.post('/api/my/designer-notifications/read-all', authDesigner, (req,res)=>{
    const now=new Date().toISOString();
    const result=db.prepare('UPDATE designer_notifications SET read_at=? WHERE designer_id=? AND read_at IS NULL').run(now,req.designerId);
    return res.json({ok:true,updated:result.changes});
  });

  app.post('/api/my/fabric-finder', authDesigner, fabricFinderUpload.array('photos',3), async (req,res,next)=>{
    try{
      const apiKey=process.env.OPENAI_API_KEY;
      if(!apiKey)return fail(res,503,'fabric_finder_not_configured','Fabric Finder is not configured yet.');
      const photos=Array.isArray(req.files)?req.files:[];
      if(!photos.length)return fail(res,422,'photo_required','Take or upload at least one fabric photo.');
      for(const photo of photos){if(!['image/jpeg','image/png','image/webp'].includes(photo.mimetype))return fail(res,415,'unsupported_image','Use a JPEG, PNG, or WebP fabric photo.');}
      const content=[{type:'input_text',text:'Identify this fabric visually for a clothing designer. Return JSON only with keys: fabricFamily (short string), likelyFibers (array of strings, possibilities only), construction (weave or knit structure), texture, weight, drape, likelyUses (array), careConsiderations (array), confidence (low|medium|high), listingMaterialSuggestion (short string), notes (short string). Never claim exact fiber composition or percentages from a photo. State uncertainty when visual evidence is insufficient.'},
        ...photos.map(photo=>({type:'input_image',image_url:`data:${photo.mimetype};base64,${photo.buffer.toString('base64')}`,detail:'high'}))];
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.FABRIC_FINDER_MODEL||'gpt-6-luna',input:[{role:'user',content}],text:{format:{type:'json_object'}},max_output_tokens:700})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(new Error(payload?.error?.message||'Fabric analysis failed.'),{statusCode:502});
      const outputText=payload.output_text||payload.output?.flatMap?.(o=>o.content||[]).find?.(x=>x.type==='output_text')?.text;
      if(!outputText)throw Object.assign(new Error('Fabric analysis returned no result.'),{statusCode:502});
      let analysis;try{analysis=JSON.parse(outputText);}catch{throw Object.assign(new Error('Fabric analysis returned an unreadable result.'),{statusCode:502});}
      res.json({analysis,disclaimer:'Visual estimate only. Confirm fiber content from a manufacturer label or appropriate physical/lab testing when exact composition matters.'});
    }catch(error){next(error);}
  });

  app.get('/api/my/seller-settings', authDesigner, (req,res)=>{
    const profile=db.prepare('SELECT vacation_mode,vacation_message,vacation_return_at FROM designer_profiles WHERE id=?').get(req.designerId);
    const promos=db.prepare('SELECT id,code,discount_type discountType,discount_value discountValue,starts_at startsAt,ends_at endsAt,max_uses maxUses,active,use_count useCount,revenue_cents revenueCents,discount_cents discountCents,created_at createdAt FROM designer_promo_codes WHERE designer_id=? ORDER BY created_at DESC').all(req.designerId);
    res.json({vacationMode:Boolean(profile?.vacation_mode),vacationMessage:profile?.vacation_message||'',vacationReturnAt:profile?.vacation_return_at||null,promos:promos.map(p=>({...p,active:Boolean(p.active)}))});
  });
  app.patch('/api/my/seller-settings', authDesigner, (req,res)=>{
    const vacationMode=Boolean(req.body?.vacationMode); const message=String(req.body?.vacationMessage||'').trim().slice(0,500); const returnAt=req.body?.vacationReturnAt?String(req.body.vacationReturnAt):null;
    db.prepare('UPDATE designer_profiles SET vacation_mode=?,vacation_message=?,vacation_return_at=? WHERE id=?').run(vacationMode?1:0,message||null,returnAt,req.designerId);
    res.json({vacationMode,vacationMessage:message,vacationReturnAt:returnAt});
  });
  app.post('/api/my/promo-codes', authDesigner, (req,res)=>{
    const code=String(req.body?.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32); const type=req.body?.discountType==='fixed'?'fixed':'percent'; const value=Math.round(Number(req.body?.discountValue));
    if(code.length<3||!Number.isInteger(value)||value<=0||(type==='percent'&&value>100))return fail(res,422,'invalid_promo','Add a valid promo code and discount.');
    try{const id=makeId(),now=new Date().toISOString();db.prepare('INSERT INTO designer_promo_codes (id,designer_id,code,discount_type,discount_value,starts_at,ends_at,max_uses,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,req.designerId,code,type,value,req.body?.startsAt||null,req.body?.endsAt||null,Number.isInteger(Number(req.body?.maxUses))?Number(req.body.maxUses):null,now);return res.status(201).json({id,code});}catch(e){return fail(res,409,'promo_exists','That promo code already exists in your shop.');}
  });
  app.patch('/api/my/promo-codes/:id', authDesigner, (req,res)=>{
    const row=db.prepare('SELECT * FROM designer_promo_codes WHERE id=? AND designer_id=?').get(req.params.id,req.designerId);if(!row)return fail(res,404,'promo_not_found','Promo code not found.');
    db.prepare('UPDATE designer_promo_codes SET active=? WHERE id=? AND designer_id=?').run(req.body?.active?1:0,row.id,req.designerId);res.json({id:row.id,active:Boolean(req.body?.active)});
  });
  app.patch('/api/my/listings/:id/pause', authDesigner, (req,res)=>{
    const row=db.prepare('SELECT id FROM listings WHERE id=? AND designer_id=?').get(req.params.id,req.designerId);if(!row)return fail(res,404,'listing_not_found','Listing not found.');
    const paused=Boolean(req.body?.paused);db.prepare('UPDATE listings SET paused_by_designer=?,updated_at=?,version=version+1 WHERE id=?').run(paused?1:0,new Date().toISOString(),row.id);res.json({id:row.id,paused});
  });
  app.post('/api/my/designer-inquiries/:inquiryId/special-offer', authDesigner, (req,res)=>{
    const inquiry=db.prepare('SELECT * FROM listing_inquiries WHERE id=? AND designer_id=?').get(req.params.inquiryId,req.designerId);if(!inquiry)return fail(res,404,'inquiry_not_found','Conversation not found.');
    const total=Math.round(Number(req.body?.total)*100),deposit=Math.round(Number(req.body?.deposit)*100),leadMin=Math.round(Number(req.body?.leadDaysMin)),leadMax=Math.round(Number(req.body?.leadDaysMax)),revisions=Math.max(0,Math.round(Number(req.body?.revisionsIncluded)||0));
    if(!Number.isInteger(total)||total<=0||!Number.isInteger(deposit)||deposit<=0||deposit>total||!Number.isInteger(leadMin)||!Number.isInteger(leadMax)||leadMin<1||leadMax<leadMin)return fail(res,422,'invalid_offer','Add a valid total, deposit, and lead-time range.');
    const id=makeId();db.prepare("INSERT INTO special_order_offers (id,inquiry_id,designer_id,buyer_subject,title,total_cents,deposit_cents,lead_days_min,lead_days_max,revisions_included,terms,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'offered',?)").run(id,inquiry.id,req.designerId,inquiry.buyer_subject,String(req.body?.title||inquiry.message||'Special order').slice(0,200),total,deposit,leadMin,leadMax,revisions,String(req.body?.terms||'').slice(0,2000),new Date().toISOString());res.status(201).json({id,status:'offered'});
  });

  app.get('/api/my/special-offers', authBuyer, (req,res)=>{
    const rows=db.prepare(`SELECT so.*,COALESCE(dp.brand_name,dp.display_name,so.designer_id) designer_name FROM special_order_offers so LEFT JOIN designer_profiles dp ON dp.id=so.designer_id WHERE so.buyer_subject=? ORDER BY so.created_at DESC`).all(req.buyerSubject);
    res.json({offers:rows.map(o=>({id:o.id,title:o.title,designerId:o.designer_id,designerName:o.designer_name,totalCents:o.total_cents,depositCents:o.deposit_cents,leadDaysMin:o.lead_days_min,leadDaysMax:o.lead_days_max,revisionsIncluded:o.revisions_included,terms:o.terms,status:o.status,depositPaidAt:o.deposit_paid_at||null}))});
  });
  app.post('/api/my/special-offers/:id/deposit', authBuyer, checkoutLimiter, async (req,res,next)=>{
    try{
      const offer=db.prepare("SELECT * FROM special_order_offers WHERE id=? AND buyer_subject=?").get(req.params.id,req.buyerSubject);
      if(!offer)return fail(res,404,'offer_not_found','Special-order offer not found.');
      if(offer.status!=='offered')return fail(res,409,'offer_unavailable','This offer is no longer awaiting a deposit.');
      const origin=trustedAppOrigin(req),body=new URLSearchParams({mode:'payment',success_url:`${origin}/account?special_order=deposit_paid`,cancel_url:`${origin}/account?special_order=deposit_canceled`,'metadata[special_offer_id]':offer.id,'payment_intent_data[metadata][special_offer_id]':offer.id});
      body.set('line_items[0][price_data][currency]','usd');body.set('line_items[0][price_data][product_data][name]',`Deposit: ${offer.title}`);body.set('line_items[0][price_data][unit_amount]',String(offer.deposit_cents));body.set('line_items[0][quantity]','1');
      const session=await stripeApi('checkout/sessions',{method:'POST',body:body.toString(),idempotencyKey:`hob-special-deposit-${offer.id}`});
      db.prepare('UPDATE special_order_offers SET stripe_session_id=? WHERE id=?').run(session.id,offer.id);res.status(201).json({url:session.url});
    }catch(error){return next(error);}
  });
  app.post('/api/my/special-offers/:id/refund-deposit', authDesigner, async (req,res,next)=>{
    try{
      const offer=db.prepare("SELECT * FROM special_order_offers WHERE id=? AND designer_id=? AND status='deposit_paid'").get(req.params.id,req.designerId);if(!offer)return fail(res,404,'offer_not_found','Paid special-order deposit not found.');
      if(!offer.stripe_payment_intent_id)return fail(res,409,'payment_reference_missing','Deposit payment reference is unavailable.');
      if(offer.stripe_transfer_id){const reversal=await stripeApi(`transfers/${encodeURIComponent(offer.stripe_transfer_id)}/reversals`,{method:'POST',body:new URLSearchParams({amount:String(Math.max(0,offer.deposit_cents-Math.round(offer.deposit_cents*.10))),'metadata[special_offer_id]':offer.id}).toString(),idempotencyKey:`hob-special-refund-reversal-${offer.id}`});}
      const refund=await stripeApi('refunds',{method:'POST',body:new URLSearchParams({payment_intent:offer.stripe_payment_intent_id,amount:String(offer.deposit_cents),reason:'requested_by_customer','metadata[special_offer_id]':offer.id}).toString(),idempotencyKey:`hob-special-refund-${offer.id}`});
      db.prepare("UPDATE special_order_offers SET status='deposit_refunded',stripe_refund_id=? WHERE id=?").run(refund.id||null,offer.id);
      res.json({ok:true,status:refund.status,refundId:refund.id});
    }catch(error){return next(error);}
  });

  app.post('/api/admin/orders/:orderId/designers/:designerId/refund', authAdmin, async (req,res,next)=>{
    try{
      const order=db.prepare("SELECT * FROM orders WHERE id=? AND status='paid'").get(req.params.orderId);if(!order)return fail(res,404,'order_not_found','Paid order not found.');
      const items=db.prepare('SELECT * FROM order_items WHERE order_id=? AND designer_id=?').all(order.id,req.params.designerId);if(!items.length)return fail(res,404,'seller_order_not_found','Seller portion not found.');
      const refundCents=items.reduce((s,i)=>s+i.line_total_cents,0);const designerCents=items.reduce((s,i)=>s+i.designer_amount_cents,0);
      let paymentIntent=order.stripe_payment_intent_id;if(!paymentIntent&&order.stripe_session_id){const session=await stripeApi(`checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:'';if(paymentIntent)db.prepare('UPDATE orders SET stripe_payment_intent_id=? WHERE id=?').run(paymentIntent,order.id);}
      if(!paymentIntent)return fail(res,409,'payment_reference_missing','Stripe payment reference is unavailable.');
      const transfer=db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id,req.params.designerId);
      if(transfer?.status==='paid'&&transfer.stripe_transfer_id&&Number(transfer.refunded_cents||0)<designerCents){
        const amount=designerCents-Number(transfer.refunded_cents||0);const reversal=await stripeApi(`transfers/${encodeURIComponent(transfer.stripe_transfer_id)}/reversals`,{method:'POST',body:new URLSearchParams({amount:String(amount),'metadata[order_id]':order.id,'metadata[designer_id]':req.params.designerId}).toString(),idempotencyKey:`hob-seller-refund-reversal-${order.id}-${req.params.designerId}`});
        db.prepare("UPDATE designer_transfers SET stripe_reversal_id=?,refunded_cents=?,release_reason='seller_refund' WHERE id=?").run(reversal.id,designerCents,transfer.id);
      }
      const refund=await stripeApi('refunds',{method:'POST',body:new URLSearchParams({payment_intent:paymentIntent,amount:String(refundCents),reason:'requested_by_customer','metadata[order_id]':order.id,'metadata[designer_id]':req.params.designerId}).toString(),idempotencyKey:`hob-seller-refund-${order.id}-${req.params.designerId}`});
      db.prepare("UPDATE orders SET refund_status='partial' WHERE id=? AND COALESCE(refund_status,'')!='succeeded'").run(order.id);
      if(order.buyer_email)void sendEmail({to:order.buyer_email,subject:'Your House of Briar refund',text:`A refund of ${(refundCents/100).toFixed(2)} was issued for one designer shipment in order ${order.id}.`});
      res.json({ok:true,refundId:refund.id,status:refund.status,amountCents:refundCents,designerId:req.params.designerId});
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
      const current=db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id,req.designerId);
      const sameShipment=transfer=>transfer.tracking_number===trackingNumber && String(transfer.tracking_carrier).toLowerCase()===carrier.toLowerCase();
      const respondExisting=async transfer=>{
        if(!transfer.tracking_verified_at)return res.status(202).json({verified:false,status:transfer.tracking_status});
        const transfers=await processDesignerTransfers(order.id,req.designerId,'tracking_verified');
        return res.json({verified:true,status:transfer.tracking_status,transfers});
      };
      if(sameShipment(current))return respondExisting(current);
      if(current.tracking_verified_at)return fail(res,409,'shipment_verified','Verified shipment tracking cannot be replaced.');
      const tracker=await verifyShipmentTracking(trackingNumber,carrier);
      const latest=db.prepare('SELECT * FROM designer_transfers WHERE id=?').get(current.id);
      if(sameShipment(latest))return respondExisting(latest);
      if(latest.tracking_verified_at)return fail(res,409,'shipment_verified','Verified shipment tracking cannot be replaced.');
      const verifiedAt=tracker.verified?new Date().toISOString():null;
      db.transaction(() => {
      db.prepare(`UPDATE designer_transfers SET tracking_carrier=?,tracking_number=?,tracking_submitted_at=?,tracking_provider_id=?,tracking_status=?,tracking_verified_at=? WHERE order_id=? AND designer_id=?`).run(tracker.carrier,trackingNumber,new Date().toISOString(),tracker.id,tracker.status,verifiedAt,order.id,req.designerId);
      notifyDesigner(req.designerId,tracker.verified?'tracking_verified':'tracking_submitted',tracker.verified?'Tracking verified':'Tracking submitted',tracker.verified?`Carrier tracking for order ${order.id} is verified. Your payout can now be released.`:`Tracking for order ${order.id} was received. Payout remains held until the carrier verifies movement.`,{orderId:order.id,actionPath:'/account#orders',priority:tracker.verified?'normal':'important',eventKey:tracker.verified?`tracking-verified:${current.id}`:`tracking-submitted:${current.id}:${carrier.toLowerCase()}:${trackingNumber}`});
      }).immediate();
      const contact=designerOrderContact(order.id,req.designerId);
      if(contact?.email)await sendEmail({to:contact.email,eventKey:`tracking-email:${current.id}:${carrier.toLowerCase()}:${trackingNumber}`,subject:'Tracking received for your House of Briar sale',text:`Order ${order.id}\nTracking: ${tracker.carrier} ${trackingNumber}\nStatus: ${tracker.status}\n\n${tracker.verified?'Carrier tracking is verified and your payout is being released.':'Your payout remains held until the carrier verifies the shipment.'}`});
      if(order.buyer_email)await sendEmail({to:order.buyer_email,eventKey:`buyer-tracking-email:${current.id}:${carrier.toLowerCase()}:${trackingNumber}`,subject:'Your House of Briar order is shipping',text:`Your order ${order.id} has tracking.\nCarrier: ${tracker.carrier}\nTracking: ${trackingNumber}`});
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
      if (paid) {
        const sessionCurrency = typeof session.currency === 'string' ? session.currency.toLowerCase() : '';
        const sessionTotal = Number(session.amount_total);
        const sessionOrderId = session.metadata?.order_id;
        if (sessionOrderId !== order.id || sessionCurrency !== String(order.currency).toLowerCase() || !Number.isInteger(sessionTotal) || sessionTotal !== order.subtotal_cents) {
          return fail(res, 409, 'payment_mismatch', 'Checkout payment does not match this order.');
        }
        if (order.status === 'canceled' || order.status === 'failed') return fail(res, 409, 'order_closed', 'Checkout order is no longer payable.');
        if (order.status !== 'paid') db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, buyer_email = COALESCE(?, buyer_email), stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id) WHERE id = ?").run(new Date().toISOString(), session.customer_details?.email || session.customer_email || null, session.payment_intent || null, order.id);
        const promoStats=db.prepare(`SELECT promo_code_id,SUM(discount_cents) discount_cents,SUM(line_total_cents) revenue_cents FROM order_items WHERE order_id=? AND promo_code_id IS NOT NULL GROUP BY promo_code_id`).all(order.id);
        for(const stat of promoStats)db.prepare('UPDATE designer_promo_codes SET use_count=use_count+1,revenue_cents=revenue_cents+?,discount_cents=discount_cents+? WHERE id=?').run(stat.revenue_cents,stat.discount_cents,stat.promo_code_id);
        markOrderInventorySold(order.id);
        await prepareDesignerTransfers(order.id);
        await notifySale(order.id);
      }
      return res.json({ orderId: order.id, paid, status: paid ? 'paid' : order.status });
    } catch (error) { return next(error); }
  });



  app.get('/media/:imageId', (req, res) => {
    const row = db.prepare(`
      SELECT i.storage_key, i.mime_type
      FROM listing_images i
      JOIN listings l ON l.id = i.listing_id
      WHERE i.id = ? AND i.upload_status = 'ready' AND l.status = 'published' AND l.moderation_status = 'approved'
    `).get(req.params.imageId);
    if (!row) return fail(res, 404, 'not_found', 'Image not found.');
    res.type(row.mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(path.join(imagesDir, row.storage_key));
  });

  app.get('/icons/house-of-briar-:size.png', async (req, res, next) => {
    const size = Number(req.params.size);
    if (![192, 512].includes(size)) return fail(res, 404, 'not_found', 'Icon not found.');
    const uploadedIcon = path.join(rootDir, `house-of-briar-${size}.png`);
    if (fs.existsSync(uploadedIcon)) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return res.sendFile(uploadedIcon);
    }
    try {
      const source = path.join(rootDir, '369d1fcc2901e810c35601d8f4376324e65b00844c0d9e223fbfa0bf44249c22.png');
      const output = await sharp(source).resize(size, size, { fit: 'cover', position: 'centre' }).png().toBuffer();
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return res.send(output);
    } catch (error) { return next(error); }
  });

  // Serve public rules before the optional React SPA catch-all.
  app.get(['/rules', '/rules.html'], (_req, res) => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    return res.sendFile(path.join(rootDir, 'rules.html'));
  });
  app.get('/shipping.html', (_req, res) => res.redirect(302, '/rules#shipping-and-delays'));

  const reactDistDir = path.join(rootDir, 'apps', 'default', 'dist');
  const reactIndexFile = path.join(reactDistDir, 'index.html');
  const hasReactBuild = fs.existsSync(reactIndexFile);
  if (hasReactBuild) app.use(express.static(reactDistDir, { index: false }));

  app.get('/api/health', (_req, res) => {
    let database = 'ok';
    try { db.prepare('SELECT 1').get(); } catch { database = 'error'; }
    const persistentStorageConfigured = Boolean(options.dataDir || process.env.DATA_DIR);
    const directorDependencies = {
      genesisAuth: 'external',
      taskadeGateway: 'external'
    };
    const ready = database === 'ok' && (process.env.NODE_ENV !== 'production' || persistentStorageConfigured);
    res.set('X-HOB-Readiness', ready ? 'ok' : 'degraded');
    res.set('X-HOB-Database', database);
    res.set('X-HOB-Persistent-Storage', persistentStorageConfigured ? 'configured' : 'default');
    res.set('X-HOB-React-Build', hasReactBuild ? 'present' : 'absent');
    res.set('X-HOB-Director-Dependencies', Object.keys(directorDependencies).join(','));
    return res.status(ready ? 200 : 503).json({ ok: ready });
  });

  app.get('/manifest.webmanifest', (_req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(rootDir, 'manifest.webmanifest'));
  });
  app.get('/service-worker.js', (_req, res) => {
    res.type('application/javascript');
    res.set('Service-Worker-Allowed', '/');
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(rootDir, 'service-worker.js'));
  });
  const sendFrontend = (_req, res) => res.sendFile(hasReactBuild ? reactIndexFile : path.join(rootDir, 'index.html'));
  const collectionPages = {
    'winter-briar': {title:'Winter Briar',description:'Velvet, golden details, and a candlelit winter edit from independent designers.'},
    'autumn-atelier': {title:'The Autumn Atelier',description:'Velvet and rich textures from independent designers. Explore the autumn edit at House of Briar.'},
    'garden-party': {title:'The Garden Party',description:'Romantic dresses and botanical daydreams. Discover the Garden Party collection at House of Briar.'},
    'independent-by-design': {title:'Independent by Design',description:'Small runs and singular ideas. Meet independent designers and their wearable art at House of Briar.'}
  };
  app.get('/collections/:collection', (req,res)=>{
    const page=collectionPages[req.params.collection];
    if(!page)return fail(res,404,'collection_not_found','Collection not found.');
    const url=`https://houseofbriar.shop/collections/${req.params.collection}`;
    let html=fs.readFileSync(path.join(rootDir,'index.html'),'utf8');
    html=html.replace('<title>House of Briar</title>',`<title>${page.title} | House of Briar</title>`)
      .replace(/(<link rel="canonical" href=")[^"]*/,`$1${url}`)
      .replace(/(<meta property="og:url" content=")[^"]*/,`$1${url}`)
      .replace(/(<meta property="og:title" content=")[^"]*/,`$1${page.title} | House of Briar`)
      .replace(/(<meta name="twitter:title" content=")[^"]*/,`$1${page.title} | House of Briar`)
      .replace(/(name="description"\s+content=")[^"]*/,`$1${page.description}`)
      .replace(/(<meta property="og:description" content=")[^"]*/,`$1${page.description}`)
      .replace(/(<meta name="twitter:description" content=")[^"]*/,`$1${page.description}`);
    return res.type('html').send(html);
  });
  app.get('/designers/:designerId', sendFrontend);
  app.get('/account', hasReactBuild ? sendFrontend : (_req, res) => res.redirect('/#visitor-suite'));
  app.get('/checkout', sendFrontend);
  app.get('/', sendFrontend);
  app.get('/index.html', sendFrontend);
  if (hasReactBuild) {
    app.get(/^\/(?!api(?:\/|$)|media(?:\/|$)|_genesis(?:\/|$)).*/, sendFrontend);
  }
  for(const asset of ['atelier.css','atelier.js'])app.get('/'+asset,(_req,res)=>{res.set('Cache-Control','no-cache, must-revalidate');res.sendFile(path.join(rootDir,asset));});
  app.get('/styles.css', (_req, res) => { res.set('Cache-Control', 'no-cache, must-revalidate'); return res.sendFile(path.join(rootDir, 'styles.css')); });
  app.get('/script.js', (_req, res) => { res.set('Cache-Control', 'no-cache, must-revalidate'); return res.sendFile(path.join(rootDir, 'script.js')); });
  app.get('/369d1fcc2901e810c35601d8f4376324e65b00844c0d9e223fbfa0bf44249c22.png', (_req, res) =>
    res.sendFile(path.join(rootDir, '369d1fcc2901e810c35601d8f4376324e65b00844c0d9e223fbfa0bf44249c22.png'))
  );
  app.get('/House%20of%20Briar%20Enchanted%20Sewing%20Bower.png', (_req, res) =>
    res.sendFile(path.join(rootDir, 'House of Briar Enchanted Sewing Bower.png'))
  );
  app.get('/House%20of%20Briar%20Botanical%20Navigation%20Header.png', (_req, res) => {
    res.type('image/png');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(rootDir, 'public', 'House of Briar Botanical Navigation Header.png'));
  });
  app.get('/House%20of%20Briar%20Enchanted%20Boutique.png', (_req, res) => {
    res.type('image/png');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(rootDir, 'public', 'House of Briar Enchanted Boutique.png'));
  });
  const illustratedPublicAssets = [
    'blackberry-house-nav-frame-v1.webp',
    'house-of-briar-blackberry-wordmark-v1.webp',
    'category-garment-frame.webp',
    'category-aesthetic-frame.webp',
    'category-pattern-frame.webp',
    'category-accessories-frame.webp',
    'category-designers-frame.webp',
    'Enchanted Briar House Header.png',
    'sewing-navigation-v2.webp',
    'sewing-hero-v2.webp',
    'heart-of-the-house-v1.webp',
    'verified-buyer-v1.webp',
    'visitor-suite-door-v1.svg',
    'designer-room-door-v1.svg',
    'suitcase-cart-v1.svg',
    'Botanical Garment Selector Banner-1.png',
    'Ornate Woodland Aesthetic Dropdown UI-2.png',
    'Enchanted Woodland Price Selector-3.png',
    'price-selector-transparent.png',
    'Botanical Accessories Dropdown Banner-4.png',
    'Briar-Header.png',
    'Briar-Garment.png',
    'Briar-Aesthetic.png',
    'Briar-Price.png',
    'Briar-Accessories.png',
    'Briar-Header-Fitted.png',
    'Briar-Garment-Art.png',
    'Briar-Aesthetic-Art.png',
    'Briar-Price-Art.png',
    'Briar-Accessories-Art.png',
    'Briar-Wide-Frame.png',
    'Briar-Tall-Frame.png',
    'Briar-Divider.png',
    'House of Briar_ Wearable Artisan Magic.png'
  ];
  illustratedPublicAssets.forEach((assetName) => {
    app.get('/' + encodeURIComponent(assetName).replace(/%20/g, '%20'), (_req, res) => {
      res.type(path.extname(assetName));
      res.set('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(rootDir, 'public', assetName));
    });
  });


  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 10 MiB or smaller.' : 'The upload could not be processed.';
      return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, code, message);
    }
    log('error','request_failed',{ error: String(error?.message || error).slice(0,500) });
    return fail(res, error.statusCode || 500, error.statusCode ? 'request_failed' : 'internal_error', error.message || 'The request could not be completed.');
  });

  app.use((_req, res) => fail(res, 404, 'not_found', 'Route not found.'));

  return { app, db, dataDir, imagesDir, reviewRequired, reconcilePendingCheckouts, reconcileDonationBadges, processEmailOutbox };
}

if (require.main === module) {
  const { app, db, reconcilePendingCheckouts, reconcileDonationBadges, processEmailOutbox } = createApp();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => console.log(`House of Briar listening on port ${port}`));
  const reconciliationIntervalMs = Math.max(60_000, Number(process.env.RECONCILIATION_INTERVAL_MS || 300_000));
  const reconciliationTimer = setInterval(() => { void reconcilePendingCheckouts(); }, reconciliationIntervalMs);
  reconciliationTimer.unref();
  const donationTimer = setInterval(() => { void reconcileDonationBadges(); }, reconciliationIntervalMs);
  donationTimer.unref();
  void reconcileDonationBadges();
  const emailTimer = setInterval(() => { void processEmailOutbox(); }, 60_000);
  emailTimer.unref();
  void reconcilePendingCheckouts();
  void processEmailOutbox();
  const shutdown = () => { clearInterval(reconciliationTimer); clearInterval(donationTimer); clearInterval(emailTimer); server.close(() => { db.close(); process.exit(0); }); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp, detectImageMime, MAX_IMAGES, MAX_IMAGE_BYTES };


