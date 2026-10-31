const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createIngressGate } = require('../lib/ingress-gate');
const secret = 'a'.repeat(64);
function invoke(gate, headers, url='/api/example', method='GET') {
  const req = {method,url,originalUrl:url,get:name=>headers[name]};
  const res = {status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  let passed=false;
  gate(req,res,()=>{passed=true;});
  return {passed,req,res};
}
function signed({timestamp='1700000000000',nonce='b'.repeat(32),ip='198.51.100.2',method='GET',url='/api/example'}={}) {
  const payload=[timestamp,nonce,method,url,ip].join('\n');
  return {'x-hob-ingress-timestamp':timestamp,'x-hob-ingress-nonce':nonce,
    'x-hob-ingress-client-ip':ip,
    'x-hob-ingress-signature':crypto.createHmac('sha256',secret).update(payload).digest('hex')};
}
test('requires a valid signed identity',()=>{
  const gate=createIngressGate({secret,now:()=>1700000000000});
  assert.equal(invoke(gate,{}).res.code,403);
  const result=invoke(gate,signed());
  assert.equal(result.passed,true);
  assert.equal(result.req.authenticatedIngressIp,'198.51.100.2');
});
test('rejects replay, changed route, changed client IP, and expired timestamp',()=>{
  const gate=createIngressGate({secret,now:()=>1700000000000});
  const headers=signed();
  assert.equal(invoke(gate,headers).passed,true);
  assert.equal(invoke(gate,headers).res.code,403);
  assert.equal(invoke(gate,signed({nonce:'c'.repeat(32)}),'/api/other').res.code,403);
  const forged=signed({nonce:'d'.repeat(32)});
  forged['x-hob-ingress-client-ip']='203.0.113.5';
  assert.equal(invoke(gate,forged).res.code,403);
  assert.equal(invoke(gate,signed({timestamp:'1699999800000',nonce:'e'.repeat(32)})).res.code,403);
});
test('health probe is exempt but cannot set authenticated identity',()=>{
  const gate=createIngressGate({secret});
  const result=invoke(gate,{'x-hob-ingress-client-ip':'198.51.100.2'},'/api/health');
  assert.equal(result.passed,true);
  assert.equal(result.req.authenticatedIngressIp,undefined);
});
