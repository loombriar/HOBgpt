const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('admin payout release uses real payout gate and never calls Stripe for simulated or unverified tracking',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-payout-integration-'));
 const calls=[];
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'payout-piece',designerId:'maker',title:'Piece',price:50}],adminToken:'payout-admin',stripeApi:async(endpoint)=>{calls.push(endpoint);return {id:'tr_mock_only'};}});
 const db=ctx.db;
 const now=new Date().toISOString();
 const server=ctx.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port+'/api/admin/orders/payout-order/designers/maker/release';
 try{
  db.prepare("INSERT INTO designer_profiles (id,email,display_name,brand_name,stripe_account_id,status,created_at) VALUES ('maker','maker@example.invalid','Maker','Maker','acct_mock_seller','active',?)").run(now);
  db.prepare("INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES ('maker','2026-10-06',?,'test')").run(now);
  db.prepare("INSERT INTO orders (id,stripe_session_id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at) VALUES ('payout-order','cs_mock_order','paid','stripe','usd',5000,500,4500,?,?)").run(now,now);
  db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('payout-line','payout-order','payout-piece','maker','Piece',5000,1,5000,500,4500)").run();
  db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at) VALUES ('held','payout-order','maker','acct_mock_seller',4500,'pending',?)").run(now);
  const release=async()=>{const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer payout-admin'}});assert.equal(res.status,200);return res.json();};
  const cases=[
   {number:'SHIPPO_TRANSIT',status:'test_transit',verified:now},
   {number:'SHIPPO_DELIVERED',status:'delivered',verified:now},
   {number:'1Z999AA10123456784',status:'submitted',verified:now},
   {number:'1Z999AA10123456784',status:'in_transit',verified:null},
   {number:'1Z999AA10123456784',status:'test_delivered',verified:now}
  ];
  for(const scenario of cases){
   db.prepare('UPDATE designer_transfers SET tracking_number=?,tracking_status=?,tracking_verified_at=? WHERE id=?').run(scenario.number,scenario.status,scenario.verified,'held');
   const result=await release();
   assert.equal(result.results[0].reason,'carrier_verification_required',JSON.stringify(scenario));
   assert.equal(calls.length,0,'mock Stripe must not be invoked');
   assert.equal(db.prepare("SELECT status FROM designer_transfers WHERE id='held'").get().status,'pending');
  }
  db.prepare("UPDATE designer_transfers SET tracking_number='1Z999AA10123456784',tracking_status='in_transit',tracking_verified_at=? WHERE id='held'").run(now);
  const allowed=await release();
  assert.equal(allowed.results[0].status,'paid');
  assert.deepEqual(calls,['transfers']);
  assert.equal(db.prepare("SELECT stripe_transfer_id FROM designer_transfers WHERE id='held'").get().stripe_transfer_id,'tr_mock_only');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
