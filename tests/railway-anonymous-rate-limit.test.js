'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('Railway anonymous report limiter cannot be reset by rotating authenticated ingress peers', async () => {
  const previousRailway = process.env.RAILWAY_PROJECT_ID;
  const previousLoopback = process.env.HOB_LOOPBACK_BACKEND;
  process.env.RAILWAY_PROJECT_ID = 'railway-test-project';
  process.env.HOB_LOOPBACK_BACKEND = 'true';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-railway-anon-limiter-'));
  let context;
  let server;
  try {
    context = createApp({ dataDir, designerTokens: {}, adminToken: 'test-admin', reviewRequired: true });
    server = context.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/api/listings/nonexistent-test-listing/report`;
    // This test uses trusted ingress identity injected at request handling, not
    // untrusted public forwarding headers; the full ingress signature is tested
    // independently by tests/ingress-proxy.test.js.
    // Fake public forwarding headers must not change the budget.
    assert.ok(context.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit_buckets'").get());
    const responses = [];
    for (let i = 0; i < 6; i++) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': `198.51.100.${i+1}`, 'x-forwarded-for': `203.0.113.${i+1}` }, body: '{}' });
      responses.push(response.status);
    }
    assert.deepEqual(responses, [404, 404, 404, 404, 404, 429]);
    const rows = context.db.prepare('SELECT hit_count FROM rate_limit_buckets').all();
    assert.ok(rows.some(row => row.hit_count === 6));
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    context?.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousRailway === undefined) delete process.env.RAILWAY_PROJECT_ID;
    else process.env.RAILWAY_PROJECT_ID = previousRailway;
    if (previousLoopback === undefined) delete process.env.HOB_LOOPBACK_BACKEND;
    else process.env.HOB_LOOPBACK_BACKEND = previousLoopback;
  }
});
