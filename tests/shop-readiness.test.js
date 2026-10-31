const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const readySeller=require('./helpers/ready-seller');

test('customer catalog hides unfinished sellers without changing private listings and keeps sold work',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-ready-'));
  const ctx=createApp({dataDir:dir,seedProducts:['ready','terms','stripe','vacation','paused','unknown'].map(id=>({id,designerId:id,title:id,price:30})),designerTokens:{seller:'terms'},stripeApi:async()=>({details_submitted:true,payouts_enabled:true,requirements:{currently_due:[]}})});
  for(const id of ['ready','terms','stripe','vacation','paused','unknown'])readySeller(ctx.db,id);
  ctx.db.prepare("DELETE FROM designer_terms_acceptances WHERE designer_id='terms'").run();
  ctx.db.prepare("UPDATE designer_profiles SET stripe_payouts_enabled=0 WHERE id='stripe'").run();
  ctx.db.prepare("UPDATE designer_profiles SET vacation_mode=1 WHERE id='vacation'").run();
  ctx.db.prepare("UPDATE listings SET paused_by_designer=1 WHERE id='paused'").run();
  ctx.db.prepare("UPDATE designer_profiles SET stripe_status_checked_at=NULL WHERE id='unknown'").run();
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const get=async(route,token)=>{const response=await fetch(base+route,{headers:token?{Authorization:'Bearer '+token}:{}});assert.equal(response.status,200);return response.json();};
  try{
    assert.deepEqual((await get('/api/gallery')).items.map(x=>x.id),['ready']);
    assert.deepEqual((await get('/api/designers/terms')).items,[]);
    const privateListing=await get('/api/listings/terms','seller');
    assert.equal(privateListing.item.status,'published');assert.equal(privateListing.item.title,'terms');
    const blocked=await fetch(base+'/api/checkout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:'terms',quantity:1}]})});
    assert.equal(blocked.status,409);assert.match((await blocked.json()).error.message,/isn’t ready to purchase yet/);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
    readySeller(ctx.db,'terms');
    assert.deepEqual((await get('/api/designers/terms')).items.map(x=>x.id),['terms']);
    const now=new Date().toISOString();
    ctx.db.prepare("INSERT INTO orders(id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('sold-order','paid',3000,300,2700,?)").run(now);
    ctx.db.prepare("INSERT INTO inventory_reservations(listing_id,order_id,status,reserved_at,expires_at,sold_at,quantity) VALUES ('terms','sold-order','sold',?,?,?,1)").run(now,now,now);
    ctx.db.prepare("DELETE FROM designer_terms_acceptances WHERE designer_id='terms'").run();
    const sold=(await get('/api/gallery')).items.find(x=>x.id==='terms');assert.ok(sold);assert.equal(sold.availableQuantity,0);assert.equal(sold.soldQuantity,1);
    ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='terms'").run();
    assert.equal((await get('/api/gallery')).items.some(x=>x.id==='terms'),false);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
