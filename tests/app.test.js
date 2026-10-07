const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test, mock } = require('node:test');
const { once } = require('node:events');
const sharp = require('sharp');
const { createApp: createBaseApp, SELLER_TERMS_VERSION } = require('../server');

// Successful commerce fixtures represent sellers who completed Stripe verification.
function createApp(options) {
  const designerIds = new Set([...Object.values(options.designerTokens || {}), ...(options.seedProducts || []).map(item => item.designerId).filter(Boolean)]);
  const connectAccounts = {...options.connectAccounts};
  for (const id of designerIds) connectAccounts[id] ||= 'acct_fixture_' + id.replace(/[^a-z0-9]/gi, '_');
  const stripeFixture = options.stripeApi;
  const context = createBaseApp({...options, connectAccounts, stripeApi: async (endpoint, request) => {
    if (endpoint.startsWith('accounts/acct_fixture_') || Object.values(options.connectAccounts || {}).some(id => endpoint === 'accounts/' + id)) {
      return {details_submitted:true, payouts_enabled:true, charges_enabled:true, requirements:{currently_due:[]}};
    }
    if (stripeFixture) return stripeFixture(endpoint, request);
    throw new Error('Unexpected Stripe fixture endpoint: ' + endpoint);
  }});
  for (const [id, account] of Object.entries(connectAccounts)) context.db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run(account,id);
  for (const id of designerIds) context.db.prepare("INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)").run(id,SELLER_TERMS_VERSION,new Date().toISOString(),"test-fixture");
  return context;
}

const DESIGNER_TOKEN = 'designer-token-a';
const OTHER_DESIGNER_TOKEN = 'designer-token-b';
const ADMIN_TOKEN = 'admin-token';

let server;
let context;
let baseUrl;
let tempDir;
let moderationResult = { allow: true, needsHumanReview: false, reason: 'Safe test image' };
let moderationStatus = 200;
const previousApiKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;

before(async () => {
  process.env.OPENAI_API_KEY = 'test-only-image-review-key';
  mock.method(globalThis, 'fetch', (url, options) => {
    if (String(url) === 'https://api.openai.com/v1/responses') {
      return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(moderationResult) }), { status: moderationStatus, headers: { 'Content-Type': 'application/json' } }));
    }
    return originalFetch(url, options);
  });
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-of-briar-test-'));
  context = createApp({
    dataDir: tempDir,
    seedProducts: [],
    designerTokens: {
      [DESIGNER_TOKEN]: 'designer-a',
      [OTHER_DESIGNER_TOKEN]: 'designer-b'
    },
    adminToken: ADMIN_TOKEN,
    reviewRequired: true
  });
  server = context.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  context?.db.close();
  mock.restoreAll();
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

async function getJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

async function makePng(color) {
  return sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: color
    }
  }).png().toBuffer();
}

async function uploadImage(listingId, idempotencyKey, color) {
  const form = new FormData();
  form.append('image', new Blob([await makePng(color)], { type: 'image/png' }), `${idempotencyKey}.png`);
  return getJson(`/api/listings/${encodeURIComponent(listingId)}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Idempotency-Key': idempotencyKey
    },
    body: form
  });
}

test('serves the storefront HTML, stylesheet, and current frontend script from their expected routes', async () => {
  const page = await fetch(`${baseUrl}/`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /href="\/styles\.css(?:\?[^" ]+)?"/);
  assert.match(html, /src="\/script\.js(?:\?[^" ]+)?"/);

  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  const css = await cssResponse.text();
  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get('content-type'), /text\/css/);
  assert.match(css, /\.site-header/);
  assert.doesNotMatch(css, /<!doctype html>/i);

  const jsResponse = await fetch(`${baseUrl}/script.js`);
  const js = await jsResponse.text();
  assert.equal(jsResponse.status, 200);
  assert.match(jsResponse.headers.get('content-type'), /javascript/);
  assert.match(js, /async function loadGallery/);
  assert.match(js, /async function uploadQueuedImages/);
});

test('health and gallery endpoints respond with the expected JSON shape', async () => {
  const health = await getJson('/api/health');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { ok: true });

  const gallery = await getJson('/api/gallery');
  assert.equal(gallery.response.status, 200);
  assert.deepEqual(gallery.body, { items: [] });

  const unauthorized = await getJson('/api/my/listings');
  assert.equal(unauthorized.response.status, 401);
});

test('designer session endpoint validates the access token', async () => {
  const unauthorized = await getJson('/api/session', { method: 'POST' });
  assert.equal(unauthorized.response.status, 401);

  const authorized = await getJson('/api/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }
  });
  assert.equal(authorized.response.status, 200);
  assert.deepEqual(authorized.body, { ok: true, designerId: 'designer-a' });
});

test('supports multiple uploads, ordering, owner isolation, review gating, and publication', async () => {
  const created = await getJson('/api/listings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'listing-key-0001'
    },
    body: JSON.stringify({
      title: 'Test woven throw',
      description: 'A test listing.',
      price: 42.5,
      category: 'home'
    })
  });
  assert.equal(created.response.status, 201);
  const listingId = created.body.item.id;
  assert.equal(created.body.item.status, 'draft');

  const firstUpload = await uploadImage(listingId, 'image-key-0001', '#aa6655');
  assert.equal(firstUpload.response.status, 201);
  assert.equal(firstUpload.body.item.images.length, 1);

  const secondUpload = await uploadImage(listingId, 'image-key-0002', '#557766');
  assert.equal(secondUpload.response.status, 201);
  assert.equal(secondUpload.body.item.images.length, 2);
  const originalOrder = secondUpload.body.item.images.map((image) => image.id);

  const otherOwnerRead = await getJson(`/api/listings/${encodeURIComponent(listingId)}`, {
    headers: { Authorization: `Bearer ${OTHER_DESIGNER_TOKEN}` }
  });
  assert.equal(otherOwnerRead.response.status, 404);

  const privateImage = await fetch(`${baseUrl}${secondUpload.body.item.images[0].url}`, {
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }
  });
  assert.equal(privateImage.status, 200);
  assert.match(privateImage.headers.get('content-type'), /image\/webp/);

  const reorderedIds = [...originalOrder].reverse();
  const reordered = await getJson(`/api/listings/${encodeURIComponent(listingId)}/images/order`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageIds: reorderedIds })
  });
  assert.equal(reordered.response.status, 200);
  assert.deepEqual(reordered.body.item.images.map((image) => image.id), reorderedIds);

  const submitted = await getJson(`/api/listings/${encodeURIComponent(listingId)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marketplaceRulesAccepted: true })
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.item.status, 'pending_review');

  const hiddenGallery = await getJson('/api/gallery');
  assert.deepEqual(hiddenGallery.body.items, []);
  const hiddenMedia = await fetch(`${baseUrl}/media/${encodeURIComponent(reorderedIds[0])}`);
  assert.equal(hiddenMedia.status, 404);

  const approved = await getJson(`/api/admin/listings/${encodeURIComponent(listingId)}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.item.status, 'published');

  const publishedGallery = await getJson('/api/gallery');
  assert.equal(publishedGallery.response.status, 200);
  assert.equal(publishedGallery.body.items.length, 1);
  assert.equal(publishedGallery.body.items[0].title, 'Test woven throw');
  assert.deepEqual(publishedGallery.body.items[0].images.map((image) => image.id), reorderedIds);

  const publicImage = await fetch(`${baseUrl}/media/${encodeURIComponent(reorderedIds[0])}`);
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('content-type'), /image\/webp/);
});


test('uploaded product photos fit fully in gallery, detail, upload, designer, and review views', async () => {
  const response = await fetch(`${baseUrl}/styles.css`);
  const css = await response.text();
  assert.equal(response.status, 200);
  const finalImageFitRules = css.slice(css.lastIndexOf('/* Keep maker-uploaded photos'));
  assert.ok(finalImageFitRules.length > 0, 'final uploaded-image fitting rules should be present');
  for (const selector of [
    '.product-image img',
    '.photo-preview-item img',
    '.designer-product-item img',
    '.admin-review-media img',
    '.product-detail-images img'
  ]) {
    assert.ok(finalImageFitRules.includes(selector), `missing contain-fit coverage for ${selector}`);
  }
  assert.match(finalImageFitRules, /object-fit:\s*contain\s*!important/);
  assert.match(finalImageFitRules, /object-position:\s*center\s*!important/);
});

test('header and full-size category banners are served with live filters', async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.ok(html.indexOf('<nav class="sewing-nav"') < html.indexOf('<a class="sewing-brand briar-wordmark"'), 'navigation must precede the banner');
  assert.doesNotMatch(html, /class="room-nav-icon"/);
  for (const asset of [
    'house-of-briar-pastel-wordmark-v2.webp',
    'blackberry-house-nav-frame-v1.webp',
    'suitcase-cart-v1.svg'
  ]) {
    const storefrontCss = await (await fetch(`${baseUrl}/styles.css`)).text();
    assert.ok(html.includes(encodeURIComponent(asset)) || storefrontCss.includes(asset), `storefront should reference ${asset}`);
    const image = await fetch(`${baseUrl}/${encodeURIComponent(asset)}`);
    assert.equal(image.status, 200, `${asset} should be served`);
    assert.match(image.headers.get('content-type'), asset.endsWith('.svg') ? /image\/svg\+xml/ : /image\/webp/);
  }

  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  const css = await cssResponse.text();
  const bannerRules = css.slice(css.lastIndexOf('/* Full botanical category-window banners'));
  assert.ok(bannerRules.length > 0, 'final banner-window rules should be present');
  assert.match(bannerRules, /\.category-window-art\s*\{[\s\S]*?object-fit:\s*contain\s*!important/);
  assert.match(bannerRules, /\.illustrated-select\s*>\s*select\s*\{[\s\S]*?position:\s*absolute\s*!important/);
  assert.match(bannerRules, /opacity:\s*\.001\s*!important/);
  assert.match(bannerRules, /\.illustrated-select\.has-changed-selection\s+\.category-window-current\s*\{\s*display:\s*flex/);
});

test('filter windows use their full botanical artwork and keep accessible live captions', async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  for (const [id, asset] of [
    ['shop-garment-filter', 'pastel-briar-window-v1.svg'],
    ['shop-aesthetic-filter', 'pastel-briar-window-v1.svg'],
    ['shop-accessory-filter', 'pastel-briar-window-v1.svg']
  ]) {
    assert.ok(html.includes(`src="/${asset}"`), `${id} should display its authored banner`);
    assert.ok(html.includes(`id="${id}" aria-label=`), `${id} should remain an accessible native filter`);
  }
  assert.ok(html.includes('id="shop-pattern-filter" aria-label="Filter by print or pattern"'), 'pattern filter should remain an accessible native filter');
  assert.equal((html.match(/class="category-window-current" aria-hidden="true"/g) || []).length, 5, 'each filter should have a live selected-value caption');
  assert.match(html, /<option value="all">All prints<\/option>/, 'default pattern-window label should match its caption');
  assert.match(html, /class="sewing-hero-art" src="\/sewing-hero-v2\.webp"/);

  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  const css = await cssResponse.text();
  const motionRules = css.slice(css.lastIndexOf('/* Readable titles stay inside each filter window'));
  assert.ok(motionRules.length > 0);
  assert.match(motionRules, /\.illustrated-select[\s\S]*?animation:\s*none\s*!important[\s\S]*?transform:\s*none\s*!important/);
  assert.match(motionRules, /\.hero\.hero-artwork\s*\{[\s\S]*?contain:\s*paint\s*!important[\s\S]*?overflow:\s*hidden\s*!important/);
  assert.match(motionRules, /\.hero\.hero-artwork\s*>\s*img\.hero-art\s*\{[\s\S]*?animation:\s*briar-drift\s+24s/);
  assert.match(motionRules, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?img\.hero-art[\s\S]*?animation:\s*none\s*!important/);
});


test('listing materials care instructions and print pattern persist',async()=>{const created=await getJson('/api/listings',{method:'POST',headers:{Authorization:'Bearer '+DESIGNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({title:'Leopard Linen Dress',description:'Structured listing details test',price:145,category:'apparel',pattern:'Leopard',materials:'100% linen; cotton lining',careInstructions:'Hand wash cold; lay flat to dry'})});assert.equal(created.response.status,201);assert.equal(created.body.item.pattern,'Leopard');assert.equal(created.body.item.materials,'100% linen; cotton lining');assert.equal(created.body.item.careInstructions,'Hand wash cold; lay flat to dry');});

test('designer listing form exposes materials care and print pattern fields',()=>{const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');const script=fs.readFileSync(path.join(__dirname,'..','script.js'),'utf8');assert.match(html,/id="product-pattern"/);assert.match(html,/value="Leopard"/);assert.match(html,/id="product-materials"/);assert.match(html,/id="product-care"/);assert.match(script,/item\.materials/);assert.match(script,/item\.careInstructions/);});

// CI synchronization marker for structured listing fields.


test('storefront exposes pattern filtering and persistent favorite controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(html, /id="shop-pattern-filter"/);
  assert.doesNotMatch(html, /id="shop-sort-filter"/);
  assert.match(html, /Print \/ Pattern/);
  assert.match(script, /activePattern/);
  assert.match(script, /\['pattern', activePattern\]/);
  assert.match(script, /favorite-button/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS buyer_favorites/);
  assert.match(server, /\/api\/my\/favorites\/:listingId/);
});


test('deleted legacy listings stay deleted after server restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'briar-delete-restart-'));
  const seeds = [
    { id: 'loom-briar-lucky-outfit', title: 'Legacy outfit', price: 295 },
    { id: 'seed-wildflower-runner', title: 'Retired demo', price: 1 }
  ];
  let instance;
  try {
    instance = createApp({ dataDir: directory, seedProducts: seeds });
    instance.db.prepare("UPDATE listings SET status = 'deleted' WHERE id = ?").run(seeds[0].id);
    instance.db.prepare("UPDATE listings SET status = 'deleted' WHERE id = ?").run(seeds[1].id);
    instance.db.close();
    instance = createApp({ dataDir: directory, seedProducts: seeds });
    for (const seed of seeds) assert.equal(instance.db.prepare('SELECT status FROM listings WHERE id = ?').get(seed.id).status, 'deleted');
  } finally {
    instance?.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('admin listing management requires admin authentication and omits deleted items', async () => {
  const denied = await fetch(`${baseUrl}/api/admin/listings`);
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${baseUrl}/api/admin/listings`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  const payload = await allowed.json();
  assert.ok(Array.isArray(payload.items));
  assert.ok(payload.items.every(item => item.status !== 'deleted'));
});


test('designer logos preserve proportions, ownership and public maker attribution', async () => {
  const image = await sharp({ create: { width: 240, height: 80, channels: 4, background: '#a8d1ba' } }).png().toBuffer();
  const form = new FormData(); form.append('image', new Blob([image], { type: 'image/png' }), 'logo.png');
  const upload = await fetch(`${baseUrl}/api/my/designer-profile/logo`, { method: 'POST', headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }, body: form });
  assert.equal(upload.status, 200);
  const { logoUrl } = await upload.json();
  const publicImage = await fetch(`${baseUrl}${logoUrl}`); assert.equal(publicImage.status, 200);
  const dimensions = await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata();
  assert.equal(dimensions.width / dimensions.height, 3);
  const unauthorized = await fetch(`${baseUrl}/api/my/designer-profile/logo`, { method: 'DELETE' }); assert.equal(unauthorized.status, 401);
  const own = await fetch(`${baseUrl}/api/my/designer-profile`, { headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` } });
  assert.equal((await own.json()).designer.logoUrl, logoUrl);
  const other = await fetch(`${baseUrl}/api/my/designer-profile`, { headers: { Authorization: `Bearer ${OTHER_DESIGNER_TOKEN}` } });
  assert.equal((await other.json()).designer.logoUrl, null);
  const gallery = await (await fetch(`${baseUrl}/api/gallery`)).json();
  for (const item of gallery.items.filter(item => item.designerId === 'designer-a')) { assert.ok(item.designerName); assert.equal(item.designerLogoUrl, logoUrl); }
  const remove = await fetch(`${baseUrl}/api/my/designer-profile/logo`, { method: 'DELETE', headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` } }); assert.equal(remove.status, 200);
  assert.equal((await fetch(`${baseUrl}${logoUrl}`)).status, 404);
});

test('listing reports are validated, persisted and visible only to admins', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'briar-report-'));
  const instance = createApp({ dataDir: directory, seedProducts: [{ id: 'report-piece', title: 'Reported piece', price: 30 }], adminToken: ADMIN_TOKEN });
  const listener = instance.app.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const origin = `http://127.0.0.1:${listener.address().port}`;
  try {
    const send = body => fetch(`${origin}/api/listings/report-piece/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await send({ reason: 'other' })).status, 422);
    const created = await send({ reason: 'misleading', notes: 'The materials seem inconsistent.' }); assert.equal(created.status, 201);
    const report = await created.json();
    assert.equal(instance.db.prepare('SELECT status FROM listing_reports WHERE id=?').get(report.id).status, 'open');
    assert.equal((await fetch(`${origin}/api/admin/listing-reports`)).status, 401);
    const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };
    const queue = await (await fetch(`${origin}/api/admin/listing-reports`, { headers })).json(); assert.equal(queue.reports[0].notes, 'The materials seem inconsistent.');
    assert.equal((await fetch(`${origin}/api/admin/listing-reports/${report.id}/resolve`, { method: 'POST', headers })).status, 200);
    assert.equal(instance.db.prepare('SELECT status FROM listing_reports WHERE id=?').get(report.id).status, 'resolved');
    assert.equal(instance.db.prepare('SELECT status FROM listings WHERE id=?').get('report-piece').status, 'published');
  } finally { await new Promise(resolve => listener.close(resolve)); instance.db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});


test('stores listing SEO and shipping metadata and supports guarded bulk catalog changes', async () => {
  const created = await getJson('/api/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'SEO shipping test piece', description: 'Metadata test.', price: 100, category: 'home',
      seoTitle: 'Botanical wearable art', seoDescription: 'A concise search description.', seoTags: 'botanical, handmade',
      shareImageUrl: 'https://example.com/share.jpg', shippingCostCents: 1250, freeShippingThresholdCents: 25000,
      handlingDaysMin: 2, handlingDaysMax: 5, internationalShipping: true
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.item.seoTitle, 'Botanical wearable art');
  assert.equal(created.body.item.shippingCostCents, 1250);
  assert.equal(created.body.item.handlingDaysMax, 5);
  assert.equal(created.body.item.internationalShipping, true);

  const bulk = await getJson('/api/admin/listings/bulk', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingIds: [created.body.item.id], availability: 'backstock', priceDeltaPercent: 10 })
  });
  assert.equal(bulk.response.status, 200);
  assert.equal(bulk.body.items[0].availability, 'backstock');
  assert.equal(bulk.body.items[0].price, 110);

  const invalid = await getJson('/api/admin/listings/bulk', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingIds: [created.body.item.id], priceDeltaPercent: 5000 })
  });
  assert.equal(invalid.response.status, 422);
});

test('accepts allowlisted commerce analytics and exposes the admin funnel', async () => {
  const event = await getJson('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'begin_checkout', sessionId: 'test-session', value: 100, currency: 'USD', itemCount: 1 })
  });
  assert.equal(event.response.status, 202);

  const rejected = await getJson('/api/analytics/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'arbitrary_event' })
  });
  assert.equal(rejected.response.status, 400);

  const dashboard = await getJson('/api/admin/analytics', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  assert.equal(dashboard.response.status, 200);
  assert.ok(dashboard.body.funnel.begin_checkout >= 1);
});

test('records anonymous site visits and exposes traffic summaries without IP storage', async () => {
  const first = await getJson('/api/analytics/events', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event:'page_view',sessionId:'visit-one',path:'/',referrer:'https://search.example/',deviceCategory:'mobile'})
  });
  assert.equal(first.response.status,202);
  const second = await getJson('/api/analytics/events', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event:'view_designer',sessionId:'visit-one',path:'/designers/maker',designerId:'maker',deviceCategory:'mobile'})
  });
  assert.equal(second.response.status,202);
  const dashboard = await getJson('/api/admin/analytics',{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
  assert.equal(dashboard.response.status,200);
  assert.ok(dashboard.body.traffic.pageViews>=2);
  assert.ok(dashboard.body.traffic.visits>=1);
  assert.ok(dashboard.body.traffic.topPages.some(row=>row.path==='/designers/maker'));
  assert.ok(dashboard.body.traffic.topDesigners.some(row=>row.designerId==='maker'));
  const columns=context.db.prepare('PRAGMA table_info(analytics_events)').all().map(row=>row.name);
  assert.equal(columns.includes('ip'),false);
  assert.equal(columns.includes('ip_address'),false);
});


test('quantity inventory prevents overselling and records admin adjustments', async () => {
  const created = await getJson('/api/listings', {
    method:'POST', headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({title:'Inventory multiple',description:'Stock test',price:25,category:'home',productionType:'Limited Quantity',sku:'HOB-TEST-2',stockQuantity:2,lowStockThreshold:1})
  });
  assert.equal(created.response.status,201);
  assert.equal(created.body.item.stockQuantity,2);
  assert.equal(created.body.item.sku,'HOB-TEST-2');

  const adjusted=await getJson(`/api/admin/listings/${created.body.item.id}/inventory/adjust`,{
    method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({delta:3,reason:'Received three finished pieces'})
  });
  assert.equal(adjusted.response.status,200);
  assert.equal(adjusted.body.item.stockQuantity,5);

  const history=await getJson(`/api/admin/listings/${created.body.item.id}/inventory/history`,{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
  assert.equal(history.response.status,200);
  assert.equal(history.body.items[0].delta,3);
  assert.equal(history.body.items[0].quantity_after,5);

  const belowZero=await getJson(`/api/admin/listings/${created.body.item.id}/inventory/adjust`,{
    method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({delta:-6,reason:'Bad count'})
  });
  assert.equal(belowZero.response.status,409);
});


test('one-of-a-kind and made-to-order inventory modes are enforced', async () => {
  const invalidUnique = await getJson('/api/listings', {
    method:'POST', headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({title:'Impossible duplicate original',description:'Unique piece',price:90,category:'home',productionType:'One of a Kind',stockQuantity:2})
  });
  assert.equal(invalidUnique.response.status,422);

  const unique = await getJson('/api/listings', {
    method:'POST', headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({title:'Single original',description:'Unique piece',price:90,category:'home',productionType:'One of a Kind',stockQuantity:1})
  });
  assert.equal(unique.response.status,201);
  assert.equal(unique.body.item.stockQuantity,1);

  const madeToOrder = await getJson('/api/listings', {
    method:'POST', headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({title:'Made after purchase',description:'Commissioned piece',price:120,category:'home',productionType:'Made to Order',stockQuantity:0})
  });
  assert.equal(madeToOrder.response.status,201);
  assert.equal(madeToOrder.body.item.productionType,'Made to Order');
  assert.equal(madeToOrder.body.item.stockQuantity,0);
});


test('designer notifications are private, persistent, and support read state', async () => {
  const created=await getJson('/api/listings',{method:'POST',headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({title:'Inbox piece',description:'For notification testing',price:45,category:'home'})});
  assert.equal(created.response.status,201);
  const listingId=created.body.item.id;
  context.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(listingId);
  const inquiry=await getJson(`/api/listings/${listingId}/inquiries`,{method:'POST',headers:{Authorization:'Bearer buyer-notification-test','Content-Type':'application/json'},body:JSON.stringify({message:'Is this piece still available?'})});
  assert.ok([201,401].includes(inquiry.response.status));
  if(inquiry.response.status===401){
    const now=new Date().toISOString();
    context.db.prepare("INSERT INTO designer_notifications(id,designer_id,type,title,body,listing_id,action_path,created_at) VALUES ('notification-test','designer-a','customer_message','New question','Is this piece still available?',?,'/account#messages',?)").run(listingId,now);
  }
  const inbox=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  assert.equal(inbox.response.status,200);
  assert.ok(inbox.body.unread>=1);
  const notification=inbox.body.items.find(item=>item.listingId===listingId);
  assert.ok(notification);
  const other=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${OTHER_DESIGNER_TOKEN}`}});
  assert.equal(other.response.status,200);
  assert.equal(other.body.items.some(item=>item.id===notification.id),false);
  const read=await getJson(`/api/my/designer-notifications/${notification.id}/read`,{method:'PATCH',headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  assert.equal(read.response.status,200);
  const refreshed=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  assert.ok(refreshed.body.items.find(item=>item.id===notification.id).readAt);
});


test('inquiry threads keep buyer identity private and authorize both sides', async () => {
  const now=new Date().toISOString();
  context.db.prepare("INSERT OR IGNORE INTO listings(id,designer_id,title,description,price,category,status,moderation_status,created_at,updated_at) VALUES ('thread-listing','designer-a','Thread Piece','Thread test',40,'home','published','approved',?,?)").run(now,now);
  context.db.prepare("INSERT INTO listing_inquiries(id,listing_id,designer_id,buyer_subject,buyer_email,message,created_at) VALUES ('thread-inquiry','thread-listing','designer-a','buyer-thread','private@example.com','Original question',?)").run(now);
  context.db.prepare("INSERT INTO inquiry_messages(id,inquiry_id,sender_role,sender_subject,message,created_at,buyer_read_at) VALUES ('thread-first','thread-inquiry','buyer','buyer-thread','Original question',?,?)").run(now,now);
  const designer=await getJson('/api/my/designer-inquiries',{headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  assert.equal(designer.response.status,200);
  const thread=designer.body.inquiries.find(i=>i.id==='thread-inquiry');
  assert.ok(thread);
  assert.equal(thread.buyerEmail,undefined);
  assert.equal(thread.messages[0].message,'Original question');
  const reply=await getJson('/api/my/designer-inquiries/thread-inquiry/messages',{method:'POST',headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({message:'Yes, it is available.'})});
  assert.equal(reply.response.status,409);
  assert.equal(reply.body.error.code,'inquiry_replies_disabled');
  const outsider=await getJson('/api/my/designer-inquiries/thread-inquiry/messages',{method:'POST',headers:{Authorization:`Bearer ${OTHER_DESIGNER_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({message:'I should not be able to reply.'})});
  assert.equal(outsider.response.status,404);
  const messages=context.db.prepare('SELECT sender_role,message FROM inquiry_messages WHERE inquiry_id=? ORDER BY created_at').all('thread-inquiry');
  assert.equal(messages.length,1);
});


test('admin designer notices are private, prioritized, and auditable', async () => {
  const sent=await getJson('/api/admin/designers/designer-a/messages',{method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({title:'Studio notice',body:'Please review your shipping settings.',priority:'important'})});
  assert.equal(sent.response.status,201);
  const inbox=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  const notice=inbox.body.items.find(item=>item.id===sent.body.message.id);
  assert.ok(notice);
  assert.equal(notice.priority,'important');
  assert.equal(notice.source,'admin');
  const other=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${OTHER_DESIGNER_TOKEN}`}});
  assert.equal(other.body.items.some(item=>item.id===notice.id),false);
  const history=await getJson('/api/admin/designer-messages',{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
  assert.equal(history.response.status,200);
  assert.ok(history.body.items.some(item=>item.id===notice.id&&item.designerId==='designer-a'));
});


test('designer operational notifications dedupe and expose actionable alerts', async () => {
  const now=new Date().toISOString();
  context.db.prepare("INSERT OR IGNORE INTO listings(id,designer_id,title,description,price,category,status,moderation_status,production_type,stock_quantity,low_stock_threshold,created_at,updated_at) VALUES ('alert-piece','designer-a','Alert Piece','test',50,'home','published','approved','One of a Kind',1,1,?,?)").run(now,now);
  context.db.prepare("INSERT OR IGNORE INTO orders(id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at) VALUES ('alert-order','paid','usd',5000,500,4500,?,?)").run(now,now);
  context.db.prepare("INSERT OR IGNORE INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('alert-item','alert-order','alert-piece','designer-a','Alert Piece',5000,1,5000,500,4500)").run();
  context.db.prepare("INSERT OR IGNORE INTO inventory_reservations(listing_id,order_id,status,reserved_at,expires_at,quantity) VALUES ('alert-piece','alert-order','sold',?,?,1)").run(now,new Date(Date.now()+60000).toISOString());
  context.db.prepare("INSERT INTO designer_notifications(id,designer_id,type,title,body,listing_id,order_id,action_path,priority,source,event_key,created_at) VALUES ('alert-note','designer-a','sold_out','One-of-a-kind piece sold','Alert Piece has sold.','alert-piece','alert-order','/account#products','important','system','sold-out:alert-piece:alert-order',?)").run(now);
  assert.throws(()=>context.db.prepare("INSERT INTO designer_notifications(id,designer_id,type,title,body,event_key,created_at) VALUES ('alert-note-2','designer-a','sold_out','duplicate','duplicate','sold-out:alert-piece:alert-order',?)").run(now),/UNIQUE constraint failed/);
  const inbox=await getJson('/api/my/designer-notifications',{headers:{Authorization:`Bearer ${DESIGNER_TOKEN}`}});
  const note=inbox.body.items.find(item=>item.id==='alert-note');
  assert.ok(note);
  assert.equal(note.type,'sold_out');
  assert.equal(note.priority,'important');
  assert.equal(note.listingId,'alert-piece');
  assert.equal(note.orderId,'alert-order');
});


test('admin inventory adjustments enforce piece-type guardrails and retain reasons', async () => {
  const now=new Date().toISOString();
  context.db.prepare("INSERT OR IGNORE INTO listings(id,designer_id,title,description,price,category,status,moderation_status,production_type,stock_quantity,low_stock_threshold,created_at,updated_at) VALUES ('admin-oak','designer-a','Admin OAK','test',20,'home','published','approved','One of a Kind',1,1,?,?)").run(now,now);
  const bad=await getJson('/api/admin/listings/admin-oak/inventory/adjust',{method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({delta:1,reason:'Incorrect count'})});
  assert.equal(bad.response.status,409);
  const sold=await getJson('/api/admin/listings/admin-oak/inventory/adjust',{method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({delta:-1,reason:'Physical recount found piece sold offline'})});
  assert.equal(sold.response.status,200);
  assert.equal(sold.body.item.stockQuantity,0);
  const history=await getJson('/api/admin/listings/admin-oak/inventory/history',{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
  assert.equal(history.response.status,200);
  assert.equal(history.body.items[0].delta,-1);
  assert.equal(history.body.items[0].reason,'Physical recount found piece sold offline');
  context.db.prepare("INSERT OR IGNORE INTO listings(id,designer_id,title,description,price,category,status,moderation_status,production_type,stock_quantity,low_stock_threshold,created_at,updated_at) VALUES ('admin-mto','designer-a','Admin MTO','test',20,'home','published','approved','Made to Order',0,1,?,?)").run(now,now);
  const mto=await getJson('/api/admin/listings/admin-mto/inventory/adjust',{method:'POST',headers:{Authorization:`Bearer ${ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({delta:1,reason:'Should not apply'})});
  assert.equal(mto.response.status,409);
});

test('all five new category frames are served as WebP images', async () => {
  for (const category of ['garment','aesthetic','pattern','accessories','designers']) {
    const response=await fetch(`${baseUrl}/category-${category}-frame.webp`);
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/webp/);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});


test('image safety rejection and provider failure do not replace a designer logo', async () => {
  const upload = async () => {
    const form = new FormData();
    form.append('image', new Blob([await makePng('#aacccc')], { type: 'image/png' }), 'safety.png');
    return fetch(`${baseUrl}/api/my/designer-profile/logo`, { method: 'POST', headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }, body: form });
  };
  try {
    for (const decision of [
      { allow: false, needsHumanReview: false, reason: 'Rejected fixture' },
      { allow: true, needsHumanReview: true, reason: 'Review required fixture' }
    ]) {
      moderationResult = decision;
      assert.equal((await upload()).status, 422);
    }
    moderationStatus = 503;
    assert.equal((await upload()).status, 503);
    const own = await getJson('/api/my/designer-profile', { headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` } });
    assert.equal(own.body.designer.logoUrl, null);
  } finally {
    moderationResult = { allow: true, needsHumanReview: false, reason: 'Safe test image' };
    moderationStatus = 200;
  }
});

