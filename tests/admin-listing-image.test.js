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
