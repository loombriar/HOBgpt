const test = require('node:test');
const assert = require('node:assert/strict');
const {clientAddress} = require('../lib/client-address');

const request = (socketIp, headerIp) => ({
  socket: {remoteAddress: socketIp},
  get(name) { return name.toLowerCase() === 'x-real-ip' ? headerIp : undefined; },
});

test('untrusted callers cannot forge their client address', () => {
  assert.equal(clientAddress(request('10.0.0.9', '203.0.113.1'), {railway:true, trustedProxyIps:''}), '10.0.0.9');
  assert.equal(clientAddress(request('10.0.0.9', '203.0.113.1'), {railway:true, trustedProxyIps:'10.0.0.8'}), '10.0.0.9');
  assert.equal(clientAddress(request('10.0.0.9', '203.0.113.1'), {railway:false, trustedProxyIps:'10.0.0.9'}), '10.0.0.9');
});

test('only an explicitly trusted ingress peer can supply a valid client IP', () => {
  assert.equal(clientAddress(request('::ffff:10.0.0.8', '203.0.113.1'), {railway:true, trustedProxyIps:'10.0.0.8'}), '203.0.113.1');
  assert.equal(clientAddress(request('10.0.0.8', 'not-an-ip'), {railway:true, trustedProxyIps:'10.0.0.8'}), '10.0.0.8');
  assert.equal(clientAddress(request('10.0.0.8', '203.0.113.1'), {railway:true, trustedProxyIps:'10.0.0.0/8'}), '10.0.0.8');
});

test('forwarded-for does not override socket identity', () => {
  const req = request('192.0.2.12', undefined);
  req.get = name => name.toLowerCase() === 'x-forwarded-for' ? '203.0.113.1' : undefined;
  assert.equal(clientAddress(req, {railway:true, trustedProxyIps:''}), '192.0.2.12');
});
