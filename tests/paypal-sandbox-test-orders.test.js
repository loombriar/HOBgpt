'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const {installPayPalSandboxTestOrders}=require('../lib/paypal-sandbox-test-orders');

test('sandbox test endpoints are disabled in production outside the staging environment',()=>{
  const routes=new Map();let statusCode=200,payload;let providerCalls=0;
  const app={get:(route,...handlers)=>routes.set('GET '+route,handlers),post:(route,...handlers)=>routes.set('POST '+route,handlers)};
  const db={exec(){},prepare(){return {get(){return null;},all(){return [];},run(){return {changes:1};}};}};
  const next=(_req,_res,continueToNext)=>continueToNext();
  installPayPalSandboxTestOrders({app,db,paypalApi:async()=>{providerCalls++;return {};},authAdmin:next,checkoutLimiter:next,trustedAppOrigin:()=> 'https://house-of-briar-staging.up.railway.app',env:{PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED:'true',NODE_ENV:'production',RAILWAY_ENVIRONMENT_NAME:'production'}});
  const req={adminRole:'owner',adminActor:'owner'};
  const res={status(code){statusCode=code;return this;},json(value){payload=value;return this;}};
  const handlers=routes.get('GET /api/admin/paypal-sandbox/test-orders');
  let index=0;const run=()=>{const handler=handlers[index++];if(handler)handler(req,res,run);};run();
  assert.equal(statusCode,503);assert.equal(payload.error,'paypal_sandbox_disabled');assert.equal(providerCalls,0);
});

test('admin sandbox test orders persist and capture only the server-owned $1 amount',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-pp-sandbox-'));
  const names=['ADMIN_TOKEN','PAYPAL_ENVIRONMENT','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED','NODE_ENV','RAILWAY_ENVIRONMENT_NAME'];
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
    assert.equal((await fetch(url)).status,401);
    const created=await post(url,true,{amountCents:999999,currency:'EUR',seller:'someone'});
    assert.equal(created.status,201);
    const order=await created.json();
    assert.equal(order.amountCents,100);assert.equal(order.currency,'USD');assert.equal(order.status,'created');
    const experience=calls[0].options.body.payment_source.paypal.experience_context;
    assert.equal(experience.return_url,origin+'/admin?checkout=paypal-sandbox-return');
    assert.equal(experience.cancel_url,origin+'/admin?checkout=paypal-sandbox-cancel');
    const list=await fetch(url,{headers:{Authorization:'Bearer sandbox-test-admin'}});
    assert.equal(list.status,200);const listed=await list.json();assert.equal(listed.enabled,true);assert.equal(listed.items[0].id,order.id);
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
    assert.equal((await fetch(url,{headers:{Authorization:'Bearer sandbox-test-admin'}})).status,503);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    for(const k of names)if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];
  }
});
