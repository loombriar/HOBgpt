const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('two designers cannot read or change each other\'s private listings, orders, or inquiries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-designer-isolation-'));
  const ctx = createApp({
    dataDir: dir,
    seedProducts: [
      { id: 'alpha-work', designerId: 'designer-alpha', title: 'Alpha work', price: 30 },
      { id: 'beta-work', designerId: 'designer-beta', title: 'Beta work', price: 40 }
    ],
    designerTokens: { 'alpha-test-token': 'designer-alpha', 'beta-test-token': 'designer-beta' }
  });
  const server = ctx.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (route, token, options = {}) => fetch(base + route, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, ...options.headers }
    });

    for (const [token, own, other] of [
      ['alpha-test-token', 'alpha-work', 'beta-work'],
      ['beta-test-token', 'beta-work', 'alpha-work']
    ]) {
      assert.equal((await request('/api/listings/' + own, token)).status, 200);
      assert.equal((await request('/api/listings/' + other, token)).status, 404);
      assert.equal((await request('/api/listings/' + other, token, {
        method: 'DELETE'
      })).status, 404);

      const listings = await (await request('/api/my/listings', token)).json();
      assert.ok(listings.items.some(item => item.id === own));
      assert.ok(!listings.items.some(item => item.id === other));

      const orders = await (await request('/api/my/orders', token)).json();
      assert.deepEqual(orders.orders, []);
      const inquiries = await (await request('/api/my/designer-inquiries', token)).json();
      assert.deepEqual(inquiries.inquiries, []);
    }

    assert.equal((await request('/api/my/listings', '', { headers: { Authorization: '' } })).status, 401);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM listings WHERE id IN ('alpha-work','beta-work')").get().n, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
