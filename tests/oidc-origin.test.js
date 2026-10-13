const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

async function withApp(options, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-oidc-origin-'));
  const ctx = createApp({ dataDir: dir, seedProducts: [], designerTokens: {}, ...options });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await callback(base); }
  finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('OIDC never performs discovery from an attacker-controlled Host when APP_ORIGIN is absent', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => { requests.push(url); throw new Error('Unexpected outbound discovery'); };
  try {
    await withApp({ appOrigin: '' }, async base => {
      const response = await originalFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-oidc-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 400);
      assert.equal(requests.length, 0);
    });
  } finally { global.fetch = originalFetch; }
});

test('configured OIDC discovery uses the trusted origin and refuses discovery redirects', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: false, status: 302 };
  };
  try {
    await withApp({ appOrigin: 'https://trusted.example' }, async base => {
      const response = await originalFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-oidc-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 401);
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://trusted.example/_genesis/auth/.well-known/openid-configuration');
    assert.equal(requests[0].options.redirect, 'manual');
  } finally { global.fetch = originalFetch; }
});

test('OIDC userinfo must match configured origin and cannot follow redirects', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return { ok: true, status: 200, json: async () => ({ userinfo_endpoint: 'https://trusted.example/oidc/userinfo' }) };
    }
    return { ok: false, status: 302 };
  };
  try {
    await withApp({ appOrigin: 'https://trusted.example' }, async base => {
      const response = await originalFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-oidc-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 401);
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, 'https://trusted.example/oidc/userinfo');
    assert.equal(requests[1].options.redirect, 'manual');
    assert.match(requests[1].options.headers.Authorization, /^Bearer /);
  } finally { global.fetch = originalFetch; }
});

test('OIDC rejects an off-origin userinfo endpoint before requesting it', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, json: async () => ({ userinfo_endpoint: 'https://attacker.example/userinfo' }) };
  };
  try {
    await withApp({ appOrigin: 'https://trusted.example' }, async base => {
      const response = await originalFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-oidc-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 401);
    });
    assert.equal(requests.length, 1);
  } finally { global.fetch = originalFetch; }
});
