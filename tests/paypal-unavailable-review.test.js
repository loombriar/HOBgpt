const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
test('unavailable PayPal references back off across restart, pause and recover without changing financial status',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-paypal-review-'));
 const previous=process.env.ADMIN_TOKEN;process.env.ADMIN_TOKEN='paypal-review-test-owner';
 let ctx,server,calls=0,mode='missing';
 const options={dataDir:dir,seedProducts:[],paypalApi:async()=>{
  calls++;if(mode==='missing')throw Object.assign(Error('missing'),{providerStatus:404});
  if(mode==='temporary')throw Object.assign(Error('temporary'),{providerStatus:503});
  return {id:'ORDER',intent:'CAPTURE',status:'CREATED',purchase_units:[{reference_id:'fixture',custom_id:'fixture',amount:{currency_code:'USD',value:'5.00'}}]};
 }};
 const state=()=>ctx.db.prepare('SELECT status,paid_at,paypal_capture_id,paypal_checked_at,paypal_unavailable_count,paypal_next_check_at,paypal_review_reason FROM donations WHERE id=?').get('fixture');
 const due=()=>ctx.db.prepare("UPDATE donations SET paypal_next_check_at='2000-01-01T00:00:00.000Z' WHERE id='fixture'").run();
 try{
  ctx=createApp(options);
  ctx.db.prepare("INSERT INTO donations(id,amount_cents,currency,status,created_at,payment_provider,paypal_order_id) VALUES ('fixture',500,'usd','pending',?,'paypal','ORDER')").run(new Date().toISOString());
  await ctx.reconcileDonationBadges();assert.equal(calls,1);assert.equal(state().paypal_unavailable_count,1);assert.equal(state().paypal_review_reason,'order_unavailable');assert.ok(Date.parse(state().paypal_next_check_at)>Date.now());
  await ctx.reconcileDonationBadges();assert.equal(calls,1);
  ctx.db.close();ctx=createApp(options);await ctx.reconcileDonationBadges();assert.equal(calls,1);
  due();await ctx.reconcileDonationBadges();assert.equal(calls,2);assert.equal(state().paypal_unavailable_count,2);
  due();await ctx.reconcileDonationBadges();assert.equal(calls,3);assert.equal(state().paypal_unavailable_count,3);assert.equal(state().paypal_next_check_at,null);
  await ctx.reconcileDonationBadges();assert.equal(calls,3);
  assert.equal(state().status,'pending');assert.equal(state().paid_at,null);assert.equal(state().paypal_capture_id,null);
  server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const anonymous=await fetch(origin+'/api/admin/operations');assert.equal(anonymous.status,401);
  const admin=await fetch(origin+'/api/admin/operations',{headers:{Authorization:'Bearer paypal-review-test-owner'}});assert.equal(admin.status,200);const queue=(await admin.json()).paypalDonationReviews;assert.equal(queue.length,1);assert.deepEqual(queue[0],{id:'fixture',amountCents:500,status:'pending',orderId:'ORDER',attempts:3,nextCheckAt:null,checkedAt:state().paypal_checked_at});
  mode='available';const response=await fetch(origin+'/api/paypal/donations/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paypalOrderId:'ORDER'})});assert.equal(response.status,200);assert.equal((await response.json()).status,'pending');assert.equal(state().paypal_review_reason,null);assert.equal(state().paypal_unavailable_count,0);
  mode='temporary';await ctx.reconcileDonationBadges();assert.equal(state().paypal_unavailable_count,0);assert.equal(state().paypal_review_reason,null);assert.equal(state().status,'pending');
 }finally{if(server)await new Promise(r=>server.close(r));ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.ADMIN_TOKEN;else process.env.ADMIN_TOKEN=previous;}
});
