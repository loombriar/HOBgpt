const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../server');

for (const trigger of ['verification', 'checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
  test(`purchase badge: ${trigger} binds the buyer and awards once after payment`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-badges-'));
    const oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_badges';
    let ctx, server, orderId, state = 'unpaid', total = 2000;
    const session = () => ({ id: 'cs_badges', status: 'complete', payment_status: state, currency: 'usd', amount_total: total, metadata: { order_id: orderId } });
    try {
      ctx = createApp({ dataDir: dir, seedProducts: [{ id: 'badge-piece', designerId: 'designer-a', title: 'Badge Piece', description: 'test', price: 20, category: 'fashion' }], designerTokens: {},
        resolveIdentity: async ({ token }) => token === 'buyer-token' ? { sub: 'buyer-a', email: 'buyer@example.test' } : { sub: 'buyer-b' },
        stripeApi: async (route) => route === 'checkout/sessions' ? { id: 'cs_badges', url: 'https://checkout.stripe.test/badges' } : session()
      });
      server = ctx.app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(origin + '/api/checkout/session', { method: 'POST', headers: { Authorization: 'Bearer buyer-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 'badge-piece', quantity: 1 }], buyerSubject: 'attacker' }) });
      assert.equal(response.status, 201);
      orderId = (await response.json()).orderId;
      assert.equal(ctx.db.prepare('SELECT buyer_subject FROM orders WHERE id=?').get(orderId).buyer_subject, 'buyer-a');
      const send = async () => {
        if (trigger === 'verification') return fetch(origin + '/api/checkout/session/cs_badges');
        const raw = JSON.stringify({ id: 'evt_badges', type: trigger, data: { object: session() } });
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto.createHmac('sha256', 'whsec_badges').update(timestamp + '.' + raw).digest('hex');
        return fetch(origin + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw });
      };
      const count = () => ctx.db.prepare('SELECT COUNT(*) AS n FROM user_badges').get().n;
      assert.equal((await send()).status, 200);
      assert.equal(count(), 0);
      state = 'paid'; total = 1999;
      assert.ok((await send()).status >= 400);
      assert.equal(count(), 0);
      total = 2000;
      assert.equal((await send()).status, 200);
      const badge = ctx.db.prepare('SELECT * FROM user_badges').get();
      assert.equal(badge.buyer_subject, 'buyer-a');
      assert.equal(badge.badge_type, 'verified_buyer');
      assert.equal(badge.source_id, orderId);
      assert.equal((await send()).status, 200);
      assert.equal(count(), 1);
      assert.equal(ctx.db.prepare('SELECT awarded_at FROM user_badges').get().awarded_at, badge.awarded_at);
      const other = await fetch(origin + '/api/my/badges', { headers: { Authorization: 'Bearer other-token' } });
      assert.deepEqual((await other.json()).badges, []);
    } finally {
      if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      ctx?.db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
