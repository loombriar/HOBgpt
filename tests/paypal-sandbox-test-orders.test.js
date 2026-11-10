'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('admin sandbox test orders persist and capture only the server-owned $1 amount',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-pp-sandbox-'));
  const names=['ADMIN_TOKEN','PAYPAL_ENVIRONMENT','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED','NODE_ENV'];
  const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{ADMIN_TOKEN:'sandbox-test-admin',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'sandbox-id',PAYPAL_CLIENT_SECRET:'sandbox-secret',PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED:'true',NODE_ENV:'test'});
  let ctx,server;
  const calls=[];
  try{
    ctx=createApp({dataDir:dir,seedProducts:[],paypalApi:async(endpoint,options={})=>{
      calls.push({endpoint,options});
      if(endpoint==='/v2/checkout/orders')return {id:'SANDBOX12345',status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX12345'}]};
      if(endpoint==='/v2/checkout/orders/SANDBOX12345')return {id:'SANDBOX12345',status:'APPROVED',purchase_units:[{reference_id:ctx.db.prepare('SELECT id FROM paypal_sandbox_test_orders').get().id,amount:{currency_code:'USD',value:'1.00'}}]};
      if(endpoint==='/v2/checkout/orders/SANDBOX12345/capture')return {status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'CAPTURE12345',status:'COMPLETED',amount:{currency_code:'USD',value:'1.00'}}]}}]};
      throw Error('Unexpected PayPal endpoint: '+endpoint);
    }});
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const url=origin+'/api/admin/paypal-sandbox/test-orders';
    const post=(target,auth=true,body={})=>fetch(target,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer sandbox-test-admin'}:{})},body:JSON.stringify(body)});
    assert.equal((await post(url,false)).status,401);
    const created=await post(url,true,{amountCents:999999,currency:'EUR',seller:'someone'});
    assert.equal(created.status,201);
    const order=await created.json();
    assert.equal(order.amountCents,100);assert.equal(order.currency,'USD');assert.equal(order.status,'created');
    assert.equal(calls[0].options.body.purchase_units[0].amount.value,'1.00');
    assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
    assert.equal((await post(url+'/'+order.id+'/capture',false)).status,401);
    assert.equal((await post(url+'/wrong-id/capture')).status,404);
    const captured=await post(url+'/'+order.id+'/capture');
    assert.equal(captured.status,200);assert.equal((await captured.json()).status,'completed');
    const repeat=await post(url+'/'+order.id+'/capture');
    assert.equal(repeat.status,200);assert.equal(calls.filter(c=>c.endpoint.endsWith('/capture')).length,1);
    assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
    const read=await fetch(url+'/'+order.id,{headers:{Authorization:'Bearer sandbox-test-admin'}});
    assert.equal((await read.json()).captureId,'CAPTURE12345');
    process.env.PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED='false';
    assert.equal((await post(url)).status,503);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    for(const k of names)if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];
  }
});
