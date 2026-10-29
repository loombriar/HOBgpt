const {test}=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');const {setupAtelierDrafts,registerAtelierDraftReview,DESIGNER_ID}=require('../lib/atelier-staging-drafts');const catalog=require('../fixtures/atelier-emine/catalog.json');
test('complete staging catalog is private, repeatable and preserves supplier details',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-atelier-'));let providerCalls=0;
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},adminToken:'atelier-test-admin',stripeApi:async()=>{providerCalls++;throw Error('No provider calls allowed')}});let server;
 try{
  for(const environment of ['production',undefined,'Staging','preview']){assert.equal(setupAtelierDrafts(ctx.db,{environment,catalog}).imported,0)}
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,0);
  assert.equal(setupAtelierDrafts(ctx.db,{environment:'staging',catalog}).imported,89);
  const profile=ctx.db.prepare('SELECT * FROM designer_profiles WHERE id=?').get(DESIGNER_ID);assert.equal(profile.status,'suspended');assert.equal(profile.stripe_account_id,null);assert.equal(profile.email_verified_at,null);
  const rows=ctx.db.prepare('SELECT * FROM listings WHERE designer_id=?').all(DESIGNER_ID);assert.equal(rows.length,89);assert.ok(rows.every(r=>r.status==='draft'&&r.moderation_status==='pending'&&r.published_at===null&&r.stock_quantity===0&&r.shipping_cost_cents===0&&r.production_type==='Made to Order'));
  for(const p of catalog.products){const row=rows.find(r=>r.sku===p.sku);assert.equal(row.price,Number(p.price_usd));assert.equal(row.description,p.description);assert.equal(row.legacy_image_url,p.image_urls[0]);}
  const imported=ctx.db.prepare('SELECT * FROM supplier_catalog_drafts').all();assert.equal(imported.reduce((n,r)=>n+JSON.parse(r.source_json).image_urls.length,0),529);assert.equal(imported.filter(r=>JSON.parse(r.source_json).photo_review_status.startsWith('blocked_')).length,4);
  ctx.db.prepare('UPDATE supplier_catalog_drafts SET review_notes=? WHERE listing_id=?').run('Keep correction',rows[0].id);
  ctx.db.prepare('UPDATE listings SET title=? WHERE id=?').run('Staff-edited title',rows[0].id);
  assert.equal(setupAtelierDrafts(ctx.db,{environment:'staging',catalog}).imported,0);assert.equal(ctx.db.prepare('SELECT title FROM listings WHERE id=?').get(rows[0].id).title,'Staff-edited title');assert.equal(ctx.db.prepare('SELECT review_notes FROM supplier_catalog_drafts WHERE listing_id=?').get(rows[0].id).review_notes,'Keep correction');
  // Register staging-only review routes with the existing authenticated middleware equivalent.
  const express=require('express');const app=express();app.use(express.json());const authAdmin=(req,res,next)=>req.headers.authorization==='Bearer test'?next():res.status(401).end();const fail=(res,status,code,message)=>res.status(status).json({error:{code,message}});
  registerAtelierDraftReview({app,db:ctx.db,authAdmin,fail,environment:'staging',catalog});server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(origin+'/api/admin/atelier-emine/drafts')).status,401);
  const data=await (await fetch(origin+'/api/admin/atelier-emine/drafts',{headers:{Authorization:'Bearer test'}})).json();assert.equal(data.items.length,89);assert.equal(data.salesEnabled,false);
  const save=await fetch(origin+'/api/admin/atelier-emine/drafts/'+rows[0].id+'/notes',{method:'PATCH',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({notes:'Seller must confirm'})});assert.equal(save.status,200);assert.equal((await save.json()).reviewStatus,'pending_seller_review');assert.equal(ctx.db.prepare('SELECT status FROM listings WHERE id=?').get(rows[0].id).status,'draft');assert.equal(providerCalls,0);
 }finally{if(server)await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('invalid catalog rolls back and cannot create partial supplier drafts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-atelier-invalid-'));const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{}});
 try{const invalid=structuredClone(catalog);invalid.products[88].image_urls=['https://untrusted.example/photo.png'];assert.throws(()=>setupAtelierDrafts(ctx.db,{environment:'staging',catalog:invalid}),/Unexpected supplier photo host/);assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,0);assert.equal(ctx.db.prepare('SELECT id FROM designer_profiles WHERE id=?').get(DESIGNER_ID),undefined)}finally{ctx.db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('staging startup imports into the actual authenticated app while gallery and checkout stay closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-atelier-app-'));const previous=process.env.RAILWAY_ENVIRONMENT_NAME;let ctx,server;
 try{
  process.env.RAILWAY_ENVIRONMENT_NAME='staging';
  try{ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},adminToken:'atelier-real-admin',stripeApi:async()=>{throw Error('Unexpected Stripe request')}})}finally{if(previous===undefined)delete process.env.RAILWAY_ENVIRONMENT_NAME;else process.env.RAILWAY_ENVIRONMENT_NAME=previous;}
  server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(origin+'/api/admin/atelier-emine/drafts')).status,401);
  const response=await fetch(origin+'/api/admin/atelier-emine/drafts',{headers:{Authorization:'Bearer atelier-real-admin'}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.items.length,89);
  const catalogResponse=await fetch(origin+'/api/admin/listings',{headers:{Authorization:'Bearer atelier-real-admin'}});assert.equal((await catalogResponse.json()).items.length,89);
  const gallery=await (await fetch(origin+'/api/gallery')).json();assert.equal(gallery.items.length,0);
  assert.equal((await fetch(origin+'/api/designers/'+DESIGNER_ID)).status,404);
  const quote=await fetch(origin+'/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{listingId:data.items[0].id,quantity:1}]})});assert.ok(quote.status>=400);
  const approval=await fetch(origin+'/api/admin/listings/'+data.items[0].id+'/approve',{method:'POST',headers:{Authorization:'Bearer atelier-real-admin'}});assert.equal(approval.status,409);
 }finally{if(server)await new Promise(r=>server.close(r));ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
