const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('named administrator roles enforce cookie and bearer permissions and audit denials', async () => {
  const names = ['ADMIN_TOKENS_JSON', 'ADMIN_TOTP_REQUIRED'];
  const previous = names.map(name => process.env[name]);
  process.env.ADMIN_TOTP_REQUIRED = 'false';
  process.env.ADMIN_TOKENS_JSON = JSON.stringify({
    reviewPerson: { token: 'review-person-test-token', role: 'reviewer' },
    supportPerson: { token: 'support-person-test-token', role: 'support' },
    unknownPerson: { token: 'unknown-person-test-token', role: 'unrecognized' },
    ownerPerson: { token: 'owner-person-test-token', role: 'owner' }
  });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-admin-roles-'));
  let ctx, server, providerCalls = 0;
  try {
    ctx = createApp({ dataDir, seedProducts: [], adminToken: 'operator-test-token', designerTokens: { maker: 'maker-role-test-token' },
      fetch: async () => { providerCalls++; throw new Error('Unexpected provider request'); } });
    server = ctx.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const login = async token => {
      const response = await fetch(origin + '/api/admin/session', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, Origin: origin }
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const reviewerCookie = await login('review-person-test-token');
    const supportCookie = await login('support-person-test-token');
    const request = (route, method, headers) => fetch(origin + route, {
      method, headers: { Origin: origin, ...headers }
    });
    const reviewer = { Cookie: reviewerCookie };
    const support = { Cookie: supportCookie };
    assert.equal((await request('/api/admin/listings', 'GET', reviewer)).status, 200);
    assert.equal((await request('/api/admin/support', 'GET', support)).status, 200);
    assert.equal((await request('/api/admin/support', 'GET', reviewer)).status, 403);
    assert.equal((await request('/api/admin/listings', 'GET', support)).status, 403);
    // Reaching validation (404 for a nonexistent listing) proves a permitted write passes the role boundary.
    assert.equal((await request('/api/admin/listings/missing/approve', 'POST', reviewer)).status, 404);
    const created = await fetch(origin + '/api/listings', {
      method: 'POST', headers: { Authorization: 'Bearer maker-role-test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Role review fixture', price: 75, category: 'apparel',
        description: 'A handmade review fixture', productionType: 'One of a Kind' })
    });
    assert.equal(created.status, 201);
    const listingId = (await created.json()).item.id;
    // Prepare a review fixture without requiring image uploads or contacting a payment provider.
    ctx.db.prepare("UPDATE listings SET status='pending_review' WHERE id=?").run(listingId);
    const rejected = await fetch(origin + '/api/admin/listings/' + listingId + '/reject', {
      method: 'POST', headers: { ...reviewer, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Please add garment measurements.' })
    });
    assert.equal(rejected.status, 200);
    assert.equal(ctx.db.prepare('SELECT status FROM listings WHERE id=?').get(listingId).status, 'rejected');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor=? AND role=? AND path=? AND status_code=200')
      .get('reviewPerson', 'reviewer', '/api/admin/listings/' + listingId + '/reject').n, 1);
    const protectedWrites = [
      ['/api/admin/orders/missing/refund', 'POST'],
      ['/api/admin/orders/missing/designers/missing/release', 'POST'],
      ['/api/admin/designers/suspend', 'POST'],
      ['/api/admin/listings/missing', 'DELETE'],
      ['/api/admin/listings/bulk', 'PATCH'],
      ['/api/admin/support/templates/general', 'PATCH']
    ];
    for (const [route, method] of protectedWrites) {
      for (const headers of [reviewer, support, { Authorization: 'Bearer review-person-test-token' }]) {
        const response = await request(route, method, headers);
        assert.equal(response.status, 403, method + ' ' + route);
        assert.equal((await response.json()).error.code, 'admin_role_forbidden');
      }
    }
    // Client-supplied role and actor headers cannot elevate a cookie-backed identity.
    const spoofed = await request('/api/admin/designers', 'GET', {
      ...reviewer, Authorization: 'Bearer owner-person-test-token',
      'X-Admin-Role': 'owner', 'X-Admin-Actor': 'ownerPerson'
    });
    assert.equal(spoofed.status, 403);
    assert.equal((await request('/api/admin/listings', 'GET', {
      Authorization: 'Bearer unknown-person-test-token'
    })).status, 403);
    assert.equal((await request('/api/admin/designers', 'GET', {
      Authorization: 'Bearer owner-person-test-token'
    })).status, 200);
    assert.equal((await request('/api/admin/designers', 'GET', {
      Authorization: 'Bearer operator-test-token'
    })).status, 200);
    assert.equal(providerCalls, 0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor=? AND role=? AND path=? AND status_code=200')
      .get('reviewPerson', 'reviewer', '/api/admin/listings').n, 1);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor=? AND role=? AND path=? AND status_code=403')
      .get('reviewPerson', 'reviewer', '/api/admin/designers').n, 1);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor=? AND role=? AND status_code=403')
      .get('supportPerson', 'support').n > 0, true);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (ctx) ctx.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    });
  }
});
