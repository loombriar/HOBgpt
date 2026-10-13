const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('special deposits fail closed without contacting Stripe or modifying offers', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-deposit-safety-'));
  let stripeCalls = 0;
  const ctx = createApp({dataDir, seedProducts: [{id: "piece", designerId: "maker", title: "Test piece", price: 100}], designerTokens: {seller: "maker"},
    resolveIdentity: async () => ({sub: 'buyer', email: 'buyer@example.test', email_verified: true}),
    stripeApi: async () => { stripeCalls++; throw new Error('Stripe must not be called'); }
  });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    ctx.db.prepare("INSERT INTO listing_inquiries (id,listing_id,designer_id,buyer_subject,message,created_at) VALUES ('inquiry','piece','maker','buyer','Test request',?)").run(new Date().toISOString());
    ctx.db.prepare("INSERT INTO special_order_offers (id,inquiry_id,designer_id,buyer_subject,title,total_cents,deposit_cents,lead_days_min,lead_days_max,status,created_at) VALUES ('offer','inquiry','maker','buyer','Custom piece',10000,5000,7,14,'offered',?)").run(new Date().toISOString());
    const before = ctx.db.prepare('SELECT * FROM special_order_offers').all();
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['offer', 'missing']) {
      const response = await fetch(`${origin}/api/my/special-offers/${id}/deposit`, {method: 'POST', headers: {Authorization: 'Bearer buyer'}});
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'special_deposits_unavailable');
    }
    assert.equal(stripeCalls, 0);
    assert.deepEqual(ctx.db.prepare('SELECT * FROM special_order_offers').all(), before);
    const offers = await fetch(origin + '/api/my/special-offers', {headers: {Authorization: 'Bearer buyer'}});
    assert.equal(offers.status, 200);
    assert.equal((await offers.json()).offers.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dataDir, {recursive: true, force: true});
  }
});
