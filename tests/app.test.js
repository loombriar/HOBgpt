const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { once } = require('node:events');
const sharp = require('sharp');
const { createApp } = require('../server');

const DESIGNER_TOKEN = 'designer-token-a';
const OTHER_DESIGNER_TOKEN = 'designer-token-b';
const ADMIN_TOKEN = 'admin-token';

let server;
let context;
let baseUrl;
let tempDir;

before(async () => {
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
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/script\.js"/);

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
  for (const asset of [
    'sewing-navigation-v2.webp'
  ]) {
    assert.ok(html.includes(encodeURIComponent(asset)), `storefront should reference ${asset}`);
    const image = await fetch(`${baseUrl}/${encodeURIComponent(asset)}`);
    assert.equal(image.status, 200, `${asset} should be served`);
    assert.match(image.headers.get('content-type'), /image\/(png|webp)/);
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
    ['shop-garment-filter', 'sewing-navigation-v2.webp'],
    ['shop-aesthetic-filter', 'sewing-navigation-v2.webp'],
    ['shop-accessory-filter', 'sewing-navigation-v2.webp']
  ]) {
    assert.ok(html.includes(`src="/${asset}"`), `${id} should display its authored banner`);
    assert.ok(html.includes(`id="${id}" aria-label=`), `${id} should remain an accessible native filter`);
  }
  assert.ok(html.includes('id="shop-pattern-filter" aria-label="Filter by print or pattern"'), 'pattern filter should remain an accessible native filter');
  assert.equal((html.match(/class="category-window-current" aria-hidden="true"/g) || []).length, 4, 'each filter should have a live selected-value caption');
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
  assert.match(html, /id="shop-sort-filter" aria-label="Sort shop results"/);
  assert.match(html, /Price \/ New/);
  assert.match(script, /activePattern/);
  assert.match(script, /item\.pattern === activePattern/);
  assert.match(script, /favorite-button/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS buyer_favorites/);
  assert.match(server, /\/api\/my\/favorites\/:listingId/);
});
