const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
async function fixture(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-audit-'));
 const ctx=createApp({dataDir:dir,seedProducts:[],adminToken:'audit-admin',...options});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 return {ctx,origin,dir,close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
function order(db,id,status='pending'){
 db.prepare('INSERT INTO orders (id,stripe_session_id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'cs_'+id,status,'usd',10000,1000,9000,new Date().toISOString());
}
test('purchase analytics reject fabricated receipts and ignore forged totals and duplicate returns',async()=>{
 const f=await fixture();try{
  order(f.ctx.db,'paid','paid');order(f.ctx.db,'pending');
  const send=body=>fetch(f.origin+'/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'purchase',...body})});
  assert.equal((await send({orderId:'fake',value:99999})).status,409);
  assert.equal((await send({orderId:'pending',value:99999})).status,409);
  assert.equal((await send({orderId:'cs_paid',value:99999,currency:'eur',sessionId:'visitor'})).status,202);
  assert.equal((await send({orderId:'paid',value:1})).status,202);
  const rows=f.ctx.db.prepare("SELECT * FROM analytics_events WHERE event_name='purchase'").all();
  assert.equal(rows.length,1);assert.equal(rows[0].value,100);assert.equal(rows[0].currency,'usd');assert.equal(rows[0].order_id,'paid');assert.equal(rows[0].session_id,'visitor');
 }finally{await f.close();}
});
test('same-day checkouts older than two hours count as abandoned, recent and purchased sessions do not',async()=>{
 const f=await fixture();try{
  const insert=f.ctx.db.prepare('INSERT INTO analytics_events (id,event_name,session_id,created_at) VALUES (?,?,?,?)');
  insert.run('old','begin_checkout','abandoned',new Date(Date.now()-3*3600000).toISOString());
  insert.run('recent','begin_checkout','recent',new Date(Date.now()-3600000).toISOString());
  insert.run('bought-start','begin_checkout','bought',new Date(Date.now()-3*3600000).toISOString());
  insert.run('bought-paid','purchase','bought',new Date(Date.now()-2*3600000).toISOString());
  const response=await fetch(f.origin+'/api/admin/analytics',{headers:{Authorization:'Bearer audit-admin'}});
  assert.equal((await response.json()).commerce.estimatedAbandonedCheckouts,1);
 }finally{await f.close();}
});
test('payment recovery rejects mismatched totals, currencies and order bindings and leaves inventory reserved',async()=>{
 let session;
 const f=await fixture({seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:100}],stripeApi:async()=>session});
 try{
  order(f.ctx.db,'recover');
  f.ctx.db.prepare("INSERT INTO inventory_reservations (listing_id,order_id,status,reserved_at,expires_at) VALUES ('piece','recover','reserved',?,?)").run(new Date(Date.now()-3600000).toISOString(),new Date(Date.now()-1000).toISOString());
  const valid={id:'cs_recover',metadata:{order_id:'recover'},status:'complete',payment_status:'paid',currency:'usd',amount_total:10000};
  for(const change of [{amount_total:1},{currency:'eur'},{id:'cs_other'},{metadata:{order_id:'other'}},{status:'open'}]){
   session={...valid,...change};const result=await f.ctx.reconcilePendingCheckouts();assert.equal(result.errors,1);
   assert.equal(f.ctx.db.prepare("SELECT status FROM orders WHERE id='recover'").get().status,'pending');
   assert.equal(f.ctx.db.prepare("SELECT status FROM inventory_reservations WHERE order_id='recover'").get().status,'reserved');
  }
  session={...valid,shipping_details:{name:'Buyer',address:{line1:'1 Test Lane',city:'Test City',postal_code:'44101',country:'US'}}};
  assert.equal((await f.ctx.reconcilePendingCheckouts()).paid,1);
  assert.equal(f.ctx.db.prepare("SELECT status FROM orders WHERE id='recover'").get().status,'paid');
  assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM analytics_events WHERE event_name='purchase'").get().n,1);
 }finally{await f.close();}
});

test('startup repairs legacy purchase totals and promotion counts without replaying paid orders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-audit-migration-'));
 const options={dataDir:dir,seedProducts:[],designerTokens:{maker:'maker'}};let ctx;
 try{
  ctx=createApp(options);order(ctx.db,'historical','paid');
  ctx.db.prepare("INSERT INTO designer_promo_codes (id,designer_id,code,discount_type,discount_value,use_count,revenue_cents,discount_cents,created_at) VALUES ('promo','maker','WELCOME','percent',10,7,63000,7000,?)").run(new Date().toISOString());
  ctx.db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents,promo_code_id,discount_cents) VALUES ('line','historical','piece','maker','Piece',10000,1,9000,900,8100,'promo',1000)").run();
  const insert=ctx.db.prepare("INSERT INTO analytics_events (id,event_name,order_id,value,currency,created_at) VALUES (?,'purchase',?,99999,'eur',?)");
  insert.run('fake','nonexistent',new Date().toISOString());insert.run('one','historical',new Date().toISOString());insert.run('two','cs_historical',new Date().toISOString());
  ctx.db.exec('ALTER TABLE orders DROP COLUMN promo_stats_recorded');ctx.db.close();ctx=createApp(options);
  assert.deepEqual(ctx.db.prepare("SELECT use_count,revenue_cents,discount_cents FROM designer_promo_codes WHERE id='promo'").get(),{use_count:1,revenue_cents:9000,discount_cents:1000});
  assert.deepEqual(ctx.db.prepare("SELECT order_id,value,currency FROM analytics_events WHERE event_name='purchase'").all(),[{order_id:'historical',value:100,currency:'usd'}]);
  ctx.db.close();ctx=createApp(options);
  assert.equal(ctx.db.prepare("SELECT use_count FROM designer_promo_codes WHERE id='promo'").get().use_count,1);
 }finally{ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('analytics body size is limited before the general JSON parser',async()=>{
 const f=await fixture();try{
  const response=await fetch(f.origin+'/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view',path:'x'.repeat(17000)})});
  assert.equal(response.status,413);assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,0);
 }finally{await f.close();}
});
test('cancellation cannot report success if an order becomes paid while expiring checkout',async()=>{
 let ctx;const f=await fixture({stripeApi:async()=>{ctx.db.prepare("UPDATE orders SET status='paid' WHERE id='race'").run();return{status:'expired'};}});ctx=f.ctx;
 try{
  order(ctx.db,'race');const hash=require('node:crypto').createHash('sha256').update('cancel-secret').digest('hex');
  ctx.db.prepare("UPDATE orders SET cancel_token_hash=? WHERE id='race'").run(hash);
  const response=await fetch(f.origin+'/api/checkout/cancel/race',{method:'POST',headers:{'x-checkout-cancel-token':'cancel-secret'}});
  assert.equal(response.status,409);assert.equal(ctx.db.prepare("SELECT status FROM orders WHERE id='race'").get().status,'paid');
 }finally{await f.close();}
});
