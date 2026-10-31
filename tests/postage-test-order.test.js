const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const express=require('express');
const {createApp}=require('../server');
const {mountPostageTestOrder,testOrderAvailable}=require('../lib/postage-test-order');
const env={RAILWAY_PROJECT_ID:'2e6e0159-67a1-4b29-b070-6b99db63fabc',RAILWAY_ENVIRONMENT_NAME:'testing',SHIPPO_LABELS_MODE:'test',SHIPPO_API_KEY:'shippo_test_fixture',STRIPE_SECRET_KEY:'sk_test_fixture'};

test('sample-order helper requires the exact test project, environment, mode and both test keys',()=>{
  assert.equal(testOrderAvailable(env),true);
  for(const change of [{RAILWAY_PROJECT_ID:'production-project'},{RAILWAY_ENVIRONMENT_NAME:'production'},{SHIPPO_LABELS_MODE:'disabled'},{SHIPPO_API_KEY:'shippo_live_key'},{STRIPE_SECRET_KEY:'sk_live_key'}, {STRIPE_SECRET_KEY:''}])assert.equal(testOrderAvailable({...env,...change}),false);
});

test('sample order is isolated, idempotent and never creates a payment, stock change or payable transfer',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-postage-fixture-'));
  const providerCalls=[];
  const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{'fixture-token':'fixture-designer'},adminToken:'fixture-admin',stripeApi:async(...args)=>{providerCalls.push(args);throw new Error('No payments allowed');}});
  const app=express();app.use(express.json());
  mountPostageTestOrder({app,db:ctx.db,env,authDesigner:(req,res,next)=>{req.designerId=req.get('x-designer')||'fixture-designer';next();}});
  app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}/api/my/postage-test-order`;
  try{
    const initialListings=ctx.db.prepare('SELECT COUNT(*) n FROM listings').get().n;
    const first=await fetch(origin,{method:'POST'});assert.equal(first.status,201);const result=await first.json();
    assert.equal(result.simulated,true);
    const again=await fetch(origin,{method:'POST'});assert.equal(again.status,200);assert.equal((await again.json()).orderId,result.orderId);
    const order=ctx.db.prepare('SELECT * FROM orders WHERE id=?').get(result.orderId);
    assert.equal(order.payment_provider,'test_fixture');assert.equal(order.status,'paid');assert.equal(order.designer_amount_cents,9100);assert.ok(order.stripe_session_id.startsWith('cs_test_postage_fixture_'));assert.equal(order.stripe_payment_intent_id,null);assert.equal(order.buyer_email,null);
    const item=ctx.db.prepare('SELECT * FROM order_items WHERE order_id=?').get(order.id);assert.equal(item.designer_id,'fixture-designer');assert.match(item.title,/TEST ONLY/);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM listings').get().n,initialListings);
    const transfer=ctx.db.prepare('SELECT * FROM designer_transfers WHERE order_id=?').get(order.id);assert.equal(transfer.status,'pending');assert.equal(transfer.stripe_account_id,'');assert.equal(transfer.release_reason,'test_fixture');
    const other=await fetch(origin,{method:'POST',headers:{'x-designer':'other-designer'}});assert.equal(other.status,201);assert.notEqual((await other.json()).orderId,result.orderId);
    assert.equal(providerCalls.length,0);
    env.RAILWAY_ENVIRONMENT_NAME='production';assert.equal((await fetch(origin,{method:'POST'})).status,404);assert.equal((await(await fetch(origin)).json()).available,false);env.RAILWAY_ENVIRONMENT_NAME='testing';
  }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
