const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createIngressProxy}=require('../ingress-proxy');
const {createIngressGate}=require('../lib/ingress-gate');
const secret='a'.repeat(64);
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
test('proxy signs identity, preserves raw webhook body, rejects missing edge identity',async()=>{
  const gate=createIngressGate({secret});
  const backend=http.createServer((req,res)=>{
    const wrapped={method:req.method,url:req.url,originalUrl:req.url,get:n=>req.headers[n]};
    gate(wrapped,{status(code){res.statusCode=code;return this;},json(body){res.end(JSON.stringify(body));}},()=>{
      const chunks=[];req.on('data',x=>chunks.push(x));req.on('end',()=>{
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ip:wrapped.authenticatedIngressIp,body:Buffer.concat(chunks).toString()}));
      });
    });
  });
  const backendPort=await listen(backend);
  const proxy=createIngressProxy({upstream:`http://127.0.0.1:${backendPort}`,secret});
  const proxyPort=await listen(proxy);
  try{
    const url=`http://127.0.0.1:${proxyPort}/api/stripe/webhook?test=1`;
    const rejected=await fetch(url,{headers:{'x-hob-ingress-client-ip':'1.2.3.4'}});
    assert.equal(rejected.status,403);
    const accepted=await fetch(url,{method:'POST',headers:{'x-real-ip':'198.51.100.9','content-type':'application/json','x-hob-ingress-signature':'fake'},body:'{"a":1}'});
    assert.equal(accepted.status,200);
    assert.deepEqual(await accepted.json(),{ip:'198.51.100.9',body:'{"a":1}'});
  }finally{await close(proxy);await close(backend);}
});
