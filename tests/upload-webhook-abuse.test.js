const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server');

async function withServer(options, run) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-abuse-'));
  const ctx = createApp({ dataDir, seedProducts: [], ...options });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run({ ctx, origin: 'http://127.0.0.1:' + server.address().port }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('listing upload rejects unauthenticated users, cross-seller uploads and disguised images', async () => {
  await withServer({
    designerTokens: { alpha: 'designer-alpha', beta: 'designer-beta' },
    seedProducts: [{ id: 'alpha-piece', designerId: 'designer-alpha', title: 'Piece', price: 25 }]
  }, async ({ ctx, origin }) => {
    const upload = (token, bytes, filename = 'photo.png') => {
      const form = new FormData();
      form.append('image', new Blob([bytes], { type: 'image/png' }), filename);
      return fetch(origin + '/api/listings/alpha-piece/images', {
        method: 'POST',
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Idempotency-Key': 'security-test-1234' },
        body: form
      });
    };
    assert.equal((await upload(null, 'not an image')).status, 401);
    assert.equal((await upload('beta', 'not an image')).status, 404);
    const disguised = await upload('alpha', '<script>alert(1)</script>');
    assert.equal(disguised.status, 415);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM listing_images').get().n, 0);
  });
});

test('Stripe webhook rejects unsigned, forged and stale requests before persisting events', async () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abuse_test_only';
  try {
    await withServer({}, async ({ ctx, origin }) => {
      const raw = JSON.stringify({ id: 'evt_abuse_001', type: 'checkout.session.expired', data: { object: { id: 'cs_nonexistent' } } });
      const endpoint = origin + '/api/stripe/webhook';
      const send = signature => fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(signature ? { 'Stripe-Signature': signature } : {}) },
        body: raw
      });
      const now = Math.floor(Date.now() / 1000);
      const sign = (timestamp, secret) => 't=' + timestamp + ',v1=' +
        crypto.createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
      assert.equal((await send()).status, 400);
      assert.equal((await send(sign(now, 'wrong-secret'))).status, 400);
      assert.equal((await send(sign(now - 600, process.env.STRIPE_WEBHOOK_SECRET))).status, 400);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM stripe_webhook_events').get().n, 0);
    });
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});
