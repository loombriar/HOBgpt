const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp}=require('../server');
const readySeller=require('./helpers/ready-seller');
const address={name:'Mock Buyer',address:{line1:'1 Test Lane',city:'Test City',postal_code:'44101',country:'US'}};
async function fixture(options={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-manus-completion-'));
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:50,shippingCostCents:0}],designerTokens:{seller:'maker'},adminToken:'admin',sendEmail:async()=>true,...options});
 readySeller(ctx.db,'maker');
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const request=async(route,body,token)=>fetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {ctx,origin,request,dir,close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
function deposit(db) {
 const now=new Date().toISOString();
 db.prepare("INSERT INTO listing_inquiries(id,listing_id,designer_id,buyer_subject,message,created_at) VALUES ('inquiry','piece','maker','buyer','Mock request',?)").run(now);
 db.prepare("INSERT INTO special_order_offers(id,inquiry_id,designer_id,buyer_subject,title,total_cents,deposit_cents,lead_days_min,lead_days_max,status,stripe_payment_intent_id,created_at) VALUES ('offer','inquiry','maker','buyer','Mock deposit',10000,5000,7,14,'deposit_paid','pi_deposit',?)").run(now);
}
const refund=status=>({id:'re_deposit',payment_intent:'pi_deposit',currency:'usd',amount:5000,status,metadata:{special_offer_id:'offer'}});
for(const status of ['pending','failed','requires_action','canceled'])test('deposit '+status+' is never marked refunded and retry cannot create another refund',async()=>{
 let calls=0;
 const f=await fixture({stripeApi:async endpoint=>{if(endpoint==='refunds')calls++;return refund(status);}});
 try{
  deposit(f.ctx.db);
  const url='/api/my/special-offers/offer/refund-deposit';
  assert.equal((await f.request(url,{},'seller')).status,200);
  assert.equal(f.ctx.db.prepare("SELECT status FROM special_order_offers WHERE id='offer'").get().status,'deposit_paid');
  assert.equal((await f.request(url,{},'seller')).status,200);assert.equal(calls,1);
  assert.equal(f.ctx.db.prepare("SELECT deposit_refund_status FROM special_order_offers WHERE id='offer'").get().deposit_refund_status,status);
 }finally{await f.close();}
});
test('pending deposit refund becomes refunded only after a bound provider success',async()=>{
 let state='pending';const f=await fixture({stripeApi:async()=>refund(state)});
 try{deposit(f.ctx.db);await f.request('/api/my/special-offers/offer/refund-deposit',{},'seller');state='succeeded';await f.ctx.reconcileFinancialOperations();assert.equal(f.ctx.db.prepare("SELECT status FROM special_order_offers WHERE id='offer'").get().status,'deposit_refunded');}finally{await f.close();}
});
test('lost deposit refund response recovers the original request, with no duplicate amount',async()=>{
 let lost=true;const calls=[];const f=await fixture({stripeApi:async(endpoint,options)=>{calls.push(options);if(lost){lost=false;throw new Error('ECONNRESET after provider accepted');}return refund('succeeded');}});
 try{deposit(f.ctx.db);assert.equal((await f.request('/api/my/special-offers/offer/refund-deposit',{},'seller')).status,500);assert.equal(f.ctx.db.prepare("SELECT status FROM special_order_offers WHERE id='offer'").get().status,'deposit_paid');await f.ctx.reconcileFinancialOperations();assert.equal(f.ctx.db.prepare("SELECT status FROM special_order_offers WHERE id='offer'").get().status,'deposit_refunded');assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);}finally{await f.close();}
});
for(const mode of ['replay','webhook','timeout'])test('unknown Checkout '+mode+' retains inventory and settles the bound paid session',async()=>{
 let lost=true,session,body;const calls=[];
 const f=await fixture({stripeTimeoutMs:30,stripeApi:async(endpoint,options)=>{
  if(endpoint.startsWith('accounts/'))return {details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
  if(endpoint==='checkout/sessions'){
   calls.push(options);body=new URLSearchParams(options.body);
   session={id:'cs_recovered',metadata:{order_id:body.get('metadata[order_id]')},currency:'usd',amount_total:5000,status:'complete',payment_status:'paid',payment_intent:'pi_recovered',shipping_details:address};
   if(lost){lost=false;if(mode==='timeout')return new Promise(()=>{});throw new Error('ECONNRESET after acceptance');}
   return session;
  }
  if(endpoint==='checkout/sessions/cs_recovered')return session;
  throw new Error('Unexpected mock endpoint '+endpoint);
 }});
 const prior=process.env.STRIPE_WEBHOOK_SECRET;
 try{
  const response=await f.request('/api/checkout/session',{items:[{id:'piece',quantity:1}]});assert.ok(response.status>=500);
  const order=f.ctx.db.prepare('SELECT * FROM orders').get();
  assert.equal(order.status,'pending');assert.equal(order.stripe_session_id,null);
  assert.equal(f.ctx.db.prepare('SELECT status FROM inventory_reservations').get().status,'reserved');
  assert.equal((await f.request('/api/checkout/session',{items:[{id:'piece',quantity:1}]})).status,409);
  for(const endpoint of ['/cancel','/inventory/release'])assert.equal((await f.request('/api/admin/orders/'+order.id+endpoint,{},'admin')).status,409);
  assert.equal(new URL(body.get('success_url')).pathname,'/checkout');assert.equal(new URL(body.get('cancel_url')).pathname,'/checkout');
  const oldCallback=await fetch(f.origin+'/?checkout=canceled&order_id='+order.id+'&cancel_token=preserved',{redirect:'manual'});assert.equal(oldCallback.status,303);assert.match(oldCallback.headers.get('location'),/\/checkout\?checkout=canceled.*cancel_token=preserved/);
  if(mode==='webhook'){
   process.env.STRIPE_WEBHOOK_SECRET='whsec_mock_recovery';
   const event=JSON.stringify({id:'evt_mock_recovery',type:'checkout.session.completed',data:{object:session}}),timestamp=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+event).digest('hex');
   const send=()=>fetch(f.origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${sig}`},body:event});
   assert.equal((await send()).status,200);assert.equal((await send()).status,200);
  }else{
   await f.ctx.reconcileFinancialOperations();assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);
   f.ctx.db.prepare("UPDATE inventory_reservations SET expires_at='2000-01-01'").run();await f.ctx.reconcilePendingCheckouts();
  }
  assert.equal(f.ctx.db.prepare('SELECT status FROM orders').get().status,'paid');assert.equal(f.ctx.db.prepare('SELECT status FROM inventory_reservations').get().status,'sold');assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM analytics_events WHERE event_name='purchase'").get().n,1);
 }finally{if(prior===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=prior;await f.close();}
});
test('conclusively rejected Checkout releases its reservations',async()=>{
 const f=await fixture({stripeApi:async(endpoint)=>{if(endpoint.startsWith('accounts/'))return {details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};throw Object.assign(new Error('Invalid checkout'),{providerStatus:400});}});
 try{await f.request('/api/checkout/session',{items:[{id:'piece',quantity:1}]});assert.equal(f.ctx.db.prepare('SELECT status FROM orders').get().status,'canceled');assert.equal(f.ctx.db.prepare('SELECT status FROM inventory_reservations').get().status,'released');}finally{await f.close();}
});
test('unknown payout remains in flight and is recovered with identical parameters',async()=>{
 let lost=true;const calls=[];const f=await fixture({stripeApi:async(endpoint,options)=>{calls.push(options);if(lost){lost=false;throw new Error('ECONNRESET');}return {id:'tr_recovered',amount:4550,currency:'usd',destination:'acct_fixture_maker'};}});
 try{
  const now=new Date().toISOString(),db=f.ctx.db;
  db.prepare("INSERT INTO orders(id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('paid','paid','stripe','usd',5000,450,4550,?)").run(now);
  db.prepare("INSERT INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('line','paid','piece','maker','Piece',5000,1,5000,450,4550)").run();
  db.prepare("INSERT INTO designer_transfers(id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_number,tracking_status,tracking_verified_at) VALUES ('transfer','paid','maker','acct_fixture_maker',4550,'pending',?,'real-tracking','in_transit',?)").run(now,now);
  await f.request('/api/admin/orders/paid/designers/maker/release',{},'admin');
  assert.equal(db.prepare('SELECT payout_in_flight FROM designer_transfers').get().payout_in_flight,1);
  assert.equal(db.prepare('SELECT status FROM designer_transfers').get().status,'pending');
  assert.equal((await f.request('/api/admin/orders/paid/refund',{},'admin')).status,409);
  await f.ctx.reconcileFinancialOperations();
  assert.equal(db.prepare('SELECT status FROM designer_transfers').get().status,'paid');assert.equal(db.prepare('SELECT payout_in_flight FROM designer_transfers').get().payout_in_flight,0);
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);
 }finally{await f.close();}
});
test('public counts omit drafts and withdrawn media returns 404 without immutable caching',async()=>{
 const f=await fixture();try{
  const db=f.ctx.db;db.prepare("UPDATE listings SET status='draft' WHERE id='piece'").run();
  let response=await f.request('/api/designers');assert.equal((await response.json()).designers[0].pieceCount,0);
  db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id='piece'").run();
  fs.writeFileSync(path.join(f.ctx.imagesDir,'piece.webp'),'mock image');
  db.prepare("INSERT INTO listing_images(id,listing_id,storage_key,client_image_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at) VALUES ('image','piece','piece.webp','mock-key',0,'image/webp',10,1,1,'mock-checksum','ready',?)").run(new Date().toISOString());
  response=await f.request('/media/image');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  db.prepare("UPDATE listings SET paused_by_designer=1 WHERE id='piece'").run();assert.equal((await f.request('/media/image')).status,404);
  db.prepare("UPDATE listings SET paused_by_designer=0 WHERE id='piece'").run();db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();assert.equal((await f.request('/media/image')).status,404);
 }finally{await f.close();}
});

test('rotating admin and legacy designer credentials revokes old cookies across restart and buyer routes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-rotation-'));
 let ctx,server,origin;
 const start=async(adminToken,seller)=>{
  ctx=createApp({dataDir:dir,seedProducts:[],adminToken,designerTokens:{[seller]:'maker'}});
  server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 };
 const stop=async()=>{await new Promise(r=>server.close(r));ctx.db.close();};
 try{
  await start('admin-old','seller-old');
  const admin=await fetch(origin+'/api/admin/session',{method:'POST',headers:{Authorization:'Bearer admin-old',Origin:origin}});
  const seller=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer seller-old'}});
  assert.equal(admin.status,200);assert.equal(seller.status,200);
  const adminCookie=admin.headers.get('set-cookie').split(';')[0],sellerCookie=seller.headers.get('set-cookie').split(';')[0];
  await stop();await start('admin-new','seller-new');
  assert.equal((await fetch(origin+'/api/admin/designers',{headers:{Cookie:adminCookie}})).status,401);
  assert.equal((await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:sellerCookie}})).status,401);
  assert.equal((await fetch(origin+'/api/my/special-offers',{headers:{Cookie:sellerCookie}})).status,401);
  assert.equal((await fetch(origin+'/api/my/designer-profile',{headers:{Authorization:'Bearer seller-new'}})).status,200);
  assert.equal((await fetch(origin+'/api/admin/designers',{headers:{Authorization:'Bearer admin-new'}})).status,200);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
