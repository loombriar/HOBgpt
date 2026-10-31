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

test('proxy trust rejects malformed peer allowlists and malformed forwarded addresses', () => {
  const cases = [
    {peer: '10.0.0.8', trusted: '10.0.0.8/32', forwarded: '203.0.113.1'},
    {peer: '10.0.0.8', trusted: '10.0.0.8:80', forwarded: '203.0.113.1'},
    {peer: '10.0.0.8', trusted: ' 10.0.0.9 ', forwarded: '203.0.113.1'},
    {peer: '10.0.0.8', trusted: '', forwarded: '203.0.113.1'},
    {peer: '10.0.0.8', trusted: '10.0.0.8', forwarded: '203.0.113.1, 192.0.2.3'},
    {peer: '10.0.0.8', trusted: '10.0.0.8', forwarded: '203.0.113.1:1234'},
    {peer: '10.0.0.8', trusted: '10.0.0.8', forwarded: 'unknown'},
    {peer: '10.0.0.8', trusted: '10.0.0.8', forwarded: ''},
  ];
  for (const {peer, trusted, forwarded} of cases) {
    assert.equal(
      clientAddress(request(peer, forwarded), {railway:true, trustedProxyIps:trusted}),
      peer,
      JSON.stringify({peer, trusted, forwarded}),
    );
  }
});

test('explicit ingress peer matches remain exact across IPv4 and IPv6', () => {
  assert.equal(clientAddress(request('10.0.0.8', '2001:db8::123'), {
    railway:true, trustedProxyIps:'192.0.2.10, 10.0.0.8',
  }), '2001:db8::123');
  assert.equal(clientAddress(request('2001:db8::8', '203.0.113.9'), {
    railway:true, trustedProxyIps:'2001:db8::8',
  }), '203.0.113.9');
  assert.equal(clientAddress(request('2001:db8::8', '203.0.113.9'), {
    railway:true, trustedProxyIps:'2001:db8::7',
  }), '2001:db8::8');
  assert.equal(clientAddress(request('::ffff:10.0.0.8', '::ffff:203.0.113.9'), {
    railway:true, trustedProxyIps:['192.0.2.10', '10.0.0.8'],
  }), '203.0.113.9');
});

test('untrusted caller cannot influence addresses used for rate limiting', () => {
  const spoofed = ['203.0.113.1', '203.0.113.2', '198.51.100.99', '2001:db8::12'];
  const addresses = spoofed.map(header => clientAddress(request('192.0.2.33', header), {
    railway:true, trustedProxyIps:'192.0.2.34',
  }));
  assert.deepEqual(addresses, Array(spoofed.length).fill('192.0.2.33'));
});
