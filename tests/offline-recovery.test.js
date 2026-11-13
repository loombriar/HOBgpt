'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const offline = fs.readFileSync(path.join(root, 'offline.html'), 'utf8');

test('offline checkout retry preserves confirmation and cancellation query parameters', async () => {
  const listeners = {};
  const cachedPage = new Response(offline, { headers: { 'Content-Type': 'text/html' } });
  const cacheLookups = [];
  vm.runInNewContext(worker, {
    self: {
      location: { origin: 'https://houseofbriar.shop' },
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    URL,
    fetch: async () => { throw new TypeError('Network unavailable'); },
    caches: { match: async url => { cacheLookups.push(url); return cachedPage.clone(); } },
  });
  for (const query of [
    '?checkout=success&session_id=cs_fixture',
    '?checkout=canceled&order_id=order_fixture&cancel_token=private_fixture',
    '?paypal=success&token=paypal_fixture&PayerID=payer_fixture',
  ]) {
    const original = 'https://houseofbriar.shop/checkout' + query;
    let response;
    listeners.fetch({
      request: { url: original, method: 'GET', mode: 'navigate' },
      respondWith: promise => { response = promise; },
    });
    const html = await (await response).text();
    const href = html.match(/<a href="([^"]*)">Try again<\/a>/)?.[1];
    assert.notEqual(href, undefined, 'Offline page must provide a retry link');
    assert.equal(new URL(href, original).href, original, 'Retry must keep the confirmation URL');
  }
  assert.deepEqual(cacheLookups, ['/offline.html', '/offline.html', '/offline.html']);
});

test('offline worker leaves API, media, external requests and writes on the network', () => {
  const listeners = {};
  vm.runInNewContext(worker, {
    self: {
      location: { origin: 'https://houseofbriar.shop' },
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    URL,
  });
  for (const [url, method] of [
    ['https://houseofbriar.shop/api/checkout/session', 'GET'],
    ['https://houseofbriar.shop/media/private-photo', 'GET'],
    ['https://provider.example/checkout', 'GET'],
    ['https://houseofbriar.shop/checkout', 'POST'],
  ]) {
    listeners.fetch({
      request: { url, method, mode: 'navigate' },
      respondWith: () => assert.fail('Sensitive requests must not receive an offline page'),
    });
  }
});
