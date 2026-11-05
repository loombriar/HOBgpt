const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('admin can inspect ready listing photos without exposing them publicly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-admin-image-'));
  const ctx = createApp({ dataDir: dir, adminToken: 'admin-image-test-token', seedProducts: [{ id: 'review-photo', designerId: 'maker', title: 'Review photo', price: 30 }] });
  const server = ctx.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const bytes = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#af4763' } }).webp().toBuffer();
    fs.writeFileSync(path.join(ctx.imagesDir, 'review.webp'), bytes);
    ctx.db.prepare("UPDATE listings SET status='pending_review', moderation_status='pending' WHERE id='review-photo'").run();
    ctx.db.prepare(`INSERT INTO listing_images (id,listing_id,client_image_key,storage_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at) VALUES ('review-image','review-photo','review-image-key','review.webp',0,'image/webp',?,32,32,'fixture','ready',?)`).run(bytes.length,new Date().toISOString());
    const base = 'http://127.0.0.1:' + server.address().port;
    const route = '/api/admin/listings/review-photo/images/review-image/content';
    const request = () => fetch(base + route, { headers: { Authorization: 'Bearer admin-image-test-token' } });
    assert.equal((await fetch(base + route)).status, 401);
    const response = await request();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal((await fetch(base + '/media/review-image')).status, 404);
    for (const [sql, restore] of [
      ["UPDATE listings SET paused_by_designer=1 WHERE id='review-photo'", "UPDATE listings SET paused_by_designer=0 WHERE id='review-photo'"],
      ["UPDATE designer_profiles SET status='suspended' WHERE id='maker'", "UPDATE designer_profiles SET status='active' WHERE id='maker'"],
      ["UPDATE listing_images SET upload_status='deleted' WHERE id='review-image'", "UPDATE listing_images SET upload_status='ready' WHERE id='review-image'"],
      ["UPDATE listings SET status='deleted' WHERE id='review-photo'", "UPDATE listings SET status='pending_review' WHERE id='review-photo'"]
    ]) {
      ctx.db.exec(sql);
      assert.equal((await request()).status, 404);
      ctx.db.exec(restore);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a delayed approval cannot overwrite a rejection or publish a resubmitted revision', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-moderation-race-'));
  const sellerCheckStarted = Promise.withResolvers();
  const sellerCheck = Promise.withResolvers();
  const ctx = createApp({
    dataDir: dir,
    adminToken: 'moderation-race-token',
    seedProducts: [{ id: 'review-piece', designerId: 'maker', title: 'Review piece', price: 30 }],
    stripeApi: async endpoint => {
      assert.equal(endpoint, 'accounts/acct_fixture_maker');
      sellerCheckStarted.resolve();
      return sellerCheck.promise;
    }
  });
  const server = ctx.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    require('./helpers/ready-seller')(ctx.db, 'maker');
    ctx.db.exec("UPDATE listings SET status='pending_review', moderation_status='pending' WHERE id='review-piece'");
    ctx.db.prepare(`
      INSERT INTO listing_images (id,listing_id,client_image_key,storage_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at)
      VALUES ('race-image','review-piece','race-key','race.webp',0,'image/webp',1,1,1,'fixture','ready',?)
    `).run(new Date().toISOString());
    const base = 'http://127.0.0.1:' + server.address().port;
    const review = (action, body = {}) => fetch(base + '/api/admin/listings/review-piece/' + action, {
      method: 'POST',
      headers: { Authorization: 'Bearer moderation-race-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const approval = review('approve');
    await Promise.race([sellerCheckStarted.promise, approval.then(response => {
      assert.fail('Approval returned before checking seller readiness: ' + response.status);
    })]);
    assert.equal((await review('reject', { reason: 'Please clarify the materials.' })).status, 200);
    // Simulate the new pending revision being saved before the original check completes.
    ctx.db.exec("UPDATE listings SET status='pending_review', moderation_status='pending', version=version+1 WHERE id='review-piece'");
    sellerCheck.resolve({ details_submitted: true, payouts_enabled: true, requirements: { currently_due: [] } });

    assert.equal((await approval).status, 409);
    assert.equal(ctx.db.prepare("SELECT status FROM listings WHERE id='review-piece'").get().status, 'pending_review');
    assert.deepEqual(ctx.db.prepare("SELECT title FROM designer_notifications WHERE listing_id='review-piece'").all(),
      [{ title: 'Changes requested' }]);

    assert.equal((await review('approve')).status, 200);
    assert.equal(ctx.db.prepare("SELECT status FROM listings WHERE id='review-piece'").get().status, 'published');
    assert.equal(ctx.db.prepare("SELECT count(*) AS count FROM designer_notifications WHERE listing_id='review-piece' AND title='Listing approved'").get().count, 1);
  } finally {
    sellerCheck.resolve({});
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
