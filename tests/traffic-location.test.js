const {test}=require('node:test'),assert=require('node:assert/strict');
const {trafficLocation}=require('../lib/traffic-location');
const request=(ip,header)=>({socket:{remoteAddress:ip},get:name=>name==='x-real-ip'?header:undefined});
test('trusted Railway proxy supplies only approximate place names',()=>{
 let address;const result=trafficLocation(request('10.0.0.1','8.8.8.8'),{railway:true,trustedProxyIps:'10.0.0.1',lookup:ip=>{address=ip;return{country:'US',region:'CA',city:'Mountain View',ll:[37,-122],zip:'94043',range:[1,2]};}});
 assert.equal(address,'8.8.8.8');assert.deepEqual(result,{country:'US',region:'CA',city:'Mountain View'});
 assert.ok(!JSON.stringify(result).includes(address));
});
test('Railway flag alone and non-allowlisted peers cannot spoof geolocation',()=>{
 let calls=0;const lookup=()=>{calls++;return{city:'Wrong'};};
 for(const trustedProxyIps of ['', '10.0.0.2']){
  assert.deepEqual(trafficLocation(request('10.0.0.1','8.8.8.8'),{railway:true,trustedProxyIps,lookup}),{});
 }
 assert.equal(calls,0);
});
test('untrusted forwarding headers and private addresses cannot supply a location',()=>{
 let calls=0;const lookup=()=>{calls++;return{city:'Wrong'};};
 for(const ip of ['127.0.0.1','::1','::ffff:127.0.0.1','192.168.0.1','10.1.2.3','fc00::1','not-an-address'])assert.deepEqual(trafficLocation(request(ip,'8.8.8.8'),{railway:false,lookup}),{});
 assert.equal(calls,0);
});
test('malformed headers from a trusted peer cannot inject a public location',()=>{
 let calls=0;const lookup=()=>{calls++;return{city:'Wrong'};};
 for(const header of ['8.8.8.8, 1.1.1.1','not-an-ip','8.8.8.8:443'])
  assert.deepEqual(trafficLocation(request('10.0.0.1',header),{railway:true,trustedProxyIps:'10.0.0.1',lookup}),{});
 assert.equal(calls,0);
});
test('unknown or failed lookup leaves activity recording usable',()=>{
 assert.deepEqual(trafficLocation(request('8.8.8.8'),{railway:false,lookup:()=>null}),{});
 assert.deepEqual(trafficLocation(request('8.8.8.8'),{railway:false,lookup:()=>{throw Error('unavailable');}}),{});
});
test('installed geolocation database supports public IPv4 and IPv6 with the audited parser',()=>{
 const lookup=require('geoip-lite').lookup;
 for(const ip of ['8.8.8.8','2001:4860:4860::8888']){
  assert.equal(lookup(ip).country,'US');
  assert.equal(trafficLocation(request(ip),{railway:false}).country,'US');
 }
});
