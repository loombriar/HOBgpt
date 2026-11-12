'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('admin sandbox test orders persist and capture only the server-owned $1 amount',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-pp-sandbox-'));
  const names=['ADMIN_TOKEN','PAYPAL_ENVIRONMENT','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED','NODE_ENV','ADMIN_TOKENS_JSON','ADMIN_TOTP_REQUIRED'];
  const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{ADMIN_TOKEN:'sandbox-test-admin',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'sandbox-id',PAYPAL_CLIENT_SECRET:'sandbox-secret',PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED:'true',NODE_ENV:'test'});
  process.env.ADMIN_TOTP_REQUIRED='false';
  process.env.ADMIN_TOKENS_JSON=JSON.stringify({otherOwner:{token:'other-sandbox-owner',role:'owner'},reviewer:{token:'sandbox-reviewer',role:'reviewer'},support:{token:'sandbox-support',role:'support'}});
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
    const list=(token)=>fetch(url,{headers:token?{Authorization:'Bearer '+token}:{}});
    assert.equal((await list()).status,401);
    assert.equal((await list('sandbox-reviewer')).status,403);
    assert.equal((await list('sandbox-support')).status,403);
    const empty=await list('sandbox-test-admin');
    assert.equal(empty.status,200);
    assert.equal(empty.headers.get('cache-control'),'no-store');
    assert.deepEqual(await empty.json(),{enabled:true,items:[]});
    assert.equal(calls.length,0);
    assert.equal((await post(url,false)).status,401);
    const created=await post(url,true,{amountCents:999999,currency:'EUR',seller:'someone'});
    assert.equal(created.status,201);
    const order=await created.json();
    assert.equal(order.amountCents,100);assert.equal(order.currency,'USD');assert.equal(order.status,'created');
    const listed=await list('sandbox-test-admin');
    assert.equal(listed.status,200);
    assert.deepEqual(await listed.json(),{enabled:true,items:[{
      id:order.id,status:'created',amountCents:100,currency:'USD',paypalOrderId:'SANDBOX12345',captureId:null
    }]});
    assert.deepEqual(await (await list('other-sandbox-owner')).json(),{enabled:true,items:[]});
    assert.equal(calls.length,1,'listing test orders must not contact PayPal');
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
    assert.equal((await list('sandbox-test-admin')).status,503);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    for(const k of names)if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];
  }
});
