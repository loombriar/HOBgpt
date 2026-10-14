const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

async function fixture(run) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-admin-hardening-'));
  const ctx = createApp({
    dataDir,
    seedProducts: [],
    adminToken: 'legacy-admin-test-token',
  });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ ctx, origin });
  } finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('named admin login exchanges the bootstrap credential for an HttpOnly session and audits requests', async () => fixture(async ({ ctx, origin }) => {
  const login = await fetch(`${origin}/api/admin/session`, {
    method: 'POST',
    headers: { Authorization: 'Bearer legacy-admin-test-token', Origin: origin },
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /hob_admin_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(login.headers.get('content-security-policy'), /default-src/);
  const cookie = setCookie.split(';')[0];

  const protectedResponse = await fetch(`${origin}/api/admin/designers`, {
    headers: { Cookie: cookie },
  });
  assert.equal(protectedResponse.status, 200);

  const crossOriginMutation = await fetch(`${origin}/api/admin/session`, {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: 'https://evil.example' },
  });
  assert.equal(crossOriginMutation.status, 403);

  const forgedFetchSite = await fetch(`${origin}/api/admin/session`, {method:'DELETE', headers:{Cookie:cookie, Origin:'https://evil.example', 'Sec-Fetch-Site':'same-origin'}});
  assert.equal(forgedFetchSite.status,403);
  const invalidHost = await new Promise((resolve, reject) => {
    const req = require('node:http').request(`${origin}/api/admin/session`, {method:'POST',headers:{Authorization:'Bearer legacy-admin-test-token',Origin:origin,Host:'evil.example'}}, res => {res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(invalidHost,400);
  const logout = await fetch(`${origin}/api/admin/session`, {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: origin },
  });
  assert.equal(logout.status, 200);
  const revoked = await fetch(`${origin}/api/admin/designers`, {headers:{Cookie:cookie}});
  assert.equal(revoked.status,401);

  await new Promise(resolve => setTimeout(resolve, 10));
  const audit = ctx.db.prepare('SELECT actor,role,method,path FROM admin_audit_log ORDER BY created_at').all();
  assert.ok(audit.some(row => row.actor === 'legacy-admin' && row.method === 'GET' && row.path === '/api/admin/designers'));
}));
