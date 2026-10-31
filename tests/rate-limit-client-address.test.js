const test=require('node:test');
const assert=require('node:assert/strict');
const {clientAddress}=require('../lib/client-address');

const request=(socketIp,header)=>({
  socket:{remoteAddress:socketIp},
  get(name){return name==='x-real-ip'?header:undefined;}
});

test('Railway public-edge identity distinguishes clients behind the same proxy',()=>{
  const sharedProxy='100.64.5.6';
  assert.equal(clientAddress(request(sharedProxy,'198.51.100.10'),{railway:true,trustedProxyIps:'100.64.5.6'}),'198.51.100.10');
  assert.equal(clientAddress(request(sharedProxy,'203.0.113.20'),{railway:true,trustedProxyIps:'100.64.5.6'}),'203.0.113.20');
  assert.equal(clientAddress(request(sharedProxy,'2001:db8::1'),{railway:true,trustedProxyIps:'100.64.5.6'}),'2001:db8::1');
});
test('Outside Railway, user-supplied forwarding headers cannot rotate the limiter key',()=>{
  for(const supplied of ['198.51.100.10','203.0.113.20','8.8.8.8, 1.1.1.1'])
    assert.equal(clientAddress(request('::ffff:127.0.0.1',supplied),{railway:false}),'127.0.0.1');
});
test('Missing or malformed edge headers fall back to the socket peer',()=>{
  for(const supplied of [undefined,'','fake','8.8.8.8, 1.1.1.1','198.51.100.10:1234'])
    assert.equal(clientAddress(request('100.64.5.6',supplied),{railway:true,trustedProxyIps:'100.64.5.6'}),'100.64.5.6');
});
test('Railway edge address normalizes IPv4-mapped IPv6',()=>{
  assert.equal(clientAddress(request('100.64.5.6','::ffff:198.51.100.10'),{railway:true,trustedProxyIps:'100.64.5.6'}),'198.51.100.10');
});

test('Railway environment alone never authenticates forwarding headers',()=>{
  assert.equal(clientAddress(request('100.64.5.6','203.0.113.20'),{railway:true,trustedProxyIps:''}),'100.64.5.6');
  assert.equal(clientAddress(request('100.64.5.7','203.0.113.20'),{railway:true,trustedProxyIps:'100.64.5.6'}),'100.64.5.7');
  assert.equal(clientAddress(request('100.64.5.6','203.0.113.20'),{railway:true,trustedProxyIps:'100.64.5.6'}),'203.0.113.20');
});
