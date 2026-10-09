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

    const now = new Date().toISOString();
    for (const [designer, listing, order, inquiry] of [
      ['designer-alpha', 'alpha-work', 'alpha-order', 'alpha-inquiry'],
      ['designer-beta', 'beta-work', 'beta-order', 'beta-inquiry']
    ]) {
      ctx.db.prepare("INSERT INTO orders(id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES (?,'paid',3000,300,2700,?)").run(order, now);
      ctx.db.prepare("INSERT INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES (?,?,?,?,?,3000,1,3000,300,2700)").run(order + '-item', order, listing, designer, listing);
      ctx.db.prepare("INSERT INTO listing_inquiries(id,listing_id,designer_id,buyer_subject,buyer_email,message,created_at) VALUES (?,?,?,?,?,?,?)").run(inquiry, listing, designer, 'test-buyer', 'buyer@example.invalid', 'Private question for ' + designer, now);
    }

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
      assert.equal(orders.orders.length, 1);
      assert.equal(orders.orders[0].id, own === 'alpha-work' ? 'alpha-order' : 'beta-order');
      const inquiries = await (await request('/api/my/designer-inquiries', token)).json();
      assert.equal(inquiries.inquiries.length, 1);
      assert.equal(inquiries.inquiries[0].id, own === 'alpha-work' ? 'alpha-inquiry' : 'beta-inquiry');
      const otherInquiry = own === 'alpha-work' ? 'beta-inquiry' : 'alpha-inquiry';
      const forbidden = await request('/api/my/designer-inquiries/' + otherInquiry, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityStatus: 'available' })
      });
      assert.equal(forbidden.status, 404);
    }

    assert.equal((await request('/api/my/listings', '', { headers: { Authorization: '' } })).status, 401);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM listings WHERE id IN ('alpha-work','beta-work')").get().n, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
