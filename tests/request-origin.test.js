const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedRequestOrigin } = require('../lib/request-origin');

function req(headers) {
  return { get: name => headers[name] };
}

const configured = 'https://house-of-briar-production.up.railway.app';
const previousAllowed = process.env.ALLOWED_HOSTS;

test('customer requests accept the serving custom domain through HTTPS termination', () => {
  process.env.ALLOWED_HOSTS = 'houseofbriar.shop';
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', origin: 'https://houseofbriar.shop' }), configured), true);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', origin: configured }), configured), true);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', 'sec-fetch-site': 'same-origin' }), configured), true);
});

test('customer origin validation rejects outside sites, opaque origins and untrusted forwarding headers', () => {
  process.env.ALLOWED_HOSTS = 'houseofbriar.shop';
  for (const origin of ['https://evil.example', 'https://houseofbriar.shop.evil.example', 'http://houseofbriar.shop', 'null', 'https://houseofbriar.shop/path', 'https://user@houseofbriar.shop']) {
    assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', origin, 'x-forwarded-host': 'evil.example' }), configured), false, origin);
  }
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', 'sec-fetch-site': 'same-site' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop', origin: 'https://houseofbriar.shop', 'sec-fetch-site': 'cross-site' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop@evil.example', origin: 'https://evil.example' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'evil.example', origin: 'https://evil.example' }), configured), false);
});

test('host blacklisting rejects spoofed or malformed custom-domain requests', () => {
  process.env.ALLOWED_HOSTS = 'houseofbriar.shop';
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop.evil.example', origin: 'https://houseofbriar.shop.evil.example' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'evil.example', origin: 'https://houseofbriar.shop' }), configured), false);
  assert.equal(isTrustedRequestOrigin(req({ host: 'houseofbriar.shop:443', origin: 'https://houseofbriar.shop' }), configured), false);
});

test.after(() => {
  if (previousAllowed === undefined) delete process.env.ALLOWED_HOSTS;
  else process.env.ALLOWED_HOSTS = previousAllowed;
});
