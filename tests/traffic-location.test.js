const {test}=require('node:test'),assert=require('node:assert/strict');
const {trafficLocation}=require('../lib/traffic-location');
const request=(ip,header)=>({socket:{remoteAddress:ip},get:()=>header});
test('Railway location lookup retains only approximate place names',()=>{
 let address;const result=trafficLocation(request('10.0.0.1','8.8.8.8'),{railway:true,lookup:ip=>{address=ip;return{country:'US',region:'CA',city:'Mountain View',ll:[37,-122],zip:'94043',range:[1,2]};}});
 assert.equal(address,'8.8.8.8');assert.deepEqual(result,{country:'US',region:'CA',city:'Mountain View'});
 assert.ok(!JSON.stringify(result).includes(address));
});
test('untrusted forwarding headers and private addresses cannot supply a location',()=>{
 let calls=0;const lookup=()=>{calls++;return{city:'Wrong'};};
 for(const ip of ['127.0.0.1','::1','::ffff:127.0.0.1','192.168.0.1','10.1.2.3','fc00::1','not-an-address'])assert.deepEqual(trafficLocation(request(ip,'8.8.8.8'),{railway:false,lookup}),{});
 assert.equal(calls,0);
});
test('unknown or failed lookup leaves activity recording usable',()=>{
 assert.deepEqual(trafficLocation(request('8.8.8.8'),{railway:false,lookup:()=>null}),{});
 assert.deepEqual(trafficLocation(request('8.8.8.8'),{railway:false,lookup:()=>{throw Error('unavailable');}}),{});
});
