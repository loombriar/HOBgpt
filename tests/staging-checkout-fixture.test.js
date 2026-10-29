const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const {FIXTURE_ID}=require('../lib/staging-checkout-fixture');
test('staging checkout fixture is private until normal approval, repeatable, and unavailable for live payments',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-launch-fixture-'));
  const previous={environment:process.env.RAILWAY_ENVIRONMENT_NAME,key:process.env.STRIPE_SECRET_KEY};
  let ctx,server;
  try{
    process.env.RAILWAY_ENVIRONMENT_NAME='staging';process.env.STRIPE_SECRET_KEY='sk_test_fixture';
    ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{seller:'test-seller'},adminToken:'admin'});
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const call=async(route,method='GET',body,token='admin')=>{
      const response=await fetch(origin+route,{method,headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      return {status:response.status,body:await response.json()};
    };
    const route='/api/admin/staging/checkout-fixture';
    assert.equal((await call(route,'POST',{confirmTestOnly:true},'invalid')).status,403);
    assert.equal((await call(route,'POST',{})).status,422);
    assert.equal((await call(route,'POST',{confirmTestOnly:true})).status,409);
    const source=await call('/api/listings','POST',{title:'STAGING ONLY — Shipping Label Test Piece',category:'apparel',price:25},'seller');
    assert.equal(source.status,201);
    ctx.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(source.body.item.id);
    const original=ctx.db.prepare('SELECT * FROM listings WHERE id=?').get(source.body.item.id);
    const first=await call(route,'POST',{confirmTestOnly:true});assert.equal(first.status,201);
    assert.equal(first.body.item.id,FIXTURE_ID);assert.equal(first.body.item.status,'pending_review');
    assert.equal(first.body.item.price,5);assert.equal(first.body.item.availableQuantity,1);
    assert.match(first.body.item.description,/No physical garment/);
    const images=ctx.db.prepare("SELECT * FROM listing_images WHERE listing_id=?").all(FIXTURE_ID);
    assert.equal(images.length,1);assert.ok(fs.statSync(path.join(dir,'images',images[0].storage_key)).size>0);
    const repeated=await call(route,'POST',{confirmTestOnly:true});assert.equal(repeated.status,200);assert.equal(repeated.body.reused,true);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM listing_images WHERE listing_id=?').get(FIXTURE_ID).n,1);
    assert.deepEqual(ctx.db.prepare('SELECT * FROM listings WHERE id=?').get(source.body.item.id),original);
    assert.equal(ctx.db.prepare('SELECT stripe_account_id FROM designer_profiles WHERE id=?').get('test-seller').stripe_account_id,null);
    assert.equal((await call(`/api/admin/listings/${FIXTURE_ID}/approve`,'POST',{})).status,409);
    assert.ok(!(await call('/api/gallery')).body.items.some(i=>i.id===FIXTURE_ID));
    process.env.STRIPE_SECRET_KEY='sk_live_fixture';
    assert.equal((await call(route)).body.enabled,false);
    assert.equal((await call(route,'POST',{confirmTestOnly:true})).status,404);
    const quote=await call('/api/checkout/quote','POST',{items:[{id:FIXTURE_ID,quantity:1}]});
    assert.equal(quote.status,409);assert.match(quote.body.error.message,/staging test payments/);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  }finally{
    if(server)await new Promise(r=>server.close(r));ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    for(const [key,value]of [['RAILWAY_ENVIRONMENT_NAME',previous.environment],['STRIPE_SECRET_KEY',previous.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
test('production cannot enable the fixture even with test credentials',async()=>{
  const express=require('express');const {registerStagingCheckoutFixture}=require('../lib/staging-checkout-fixture');
  const app=express();app.use(express.json());const previous=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY='sk_test_fixture';
  registerStagingCheckoutFixture({app,db:{prepare(){throw Error('Production must not access fixture data');}},authAdmin:(_q,_s,n)=>n(),fail:(res,status,code)=>res.status(status).json({code}),environment:'production'});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await(await fetch(origin+'/api/admin/staging/checkout-fixture')).json()).enabled,false);assert.equal((await fetch(origin+'/api/admin/staging/checkout-fixture',{method:'POST'})).status,404);}
  finally{await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=previous;}
});
