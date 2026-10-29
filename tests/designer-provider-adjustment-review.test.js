'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {reviewProviderAdjustments}=require('../lib/designer-provider-adjustment-review');
function fixture(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT,stripe_session_id TEXT,stripe_payment_intent_id TEXT,currency TEXT,refund_status TEXT);
 CREATE TABLE order_items(order_id TEXT,designer_id TEXT);
 CREATE TABLE order_refunds(order_id TEXT,scope TEXT,stripe_refund_id TEXT,amount_cents INTEGER);
 CREATE TABLE designer_transfers(order_id TEXT,designer_id TEXT,stripe_transfer_id TEXT,stripe_reversal_id TEXT);
 INSERT INTO orders VALUES('o','cs_test_example','pi_test','usd',NULL);
 INSERT INTO order_items VALUES('o','d');
 INSERT INTO order_refunds VALUES('o','d','re_123',1200);
 INSERT INTO designer_transfers VALUES('o','d','tr_123','trr_123');`);
 return db;
}
test('verifies provider evidence but never posts a refund or reversal',async()=>{
 const db=fixture();try{
  const paths=[];
  const api=async path=>{
   paths.push(path);
   return path.startsWith('refunds/')?
    {id:'re_123',livemode:false,payment_intent:'pi_test',currency:'usd',amount:1200,status:'succeeded',metadata:{order_id:'o',refund_scope:'d'}}:
    {id:'trr_123',transfer:'tr_123',amount:900};
  };
  const r=await reviewProviderAdjustments(db,api,{orderId:'o',designerId:'d'});
  assert.equal(r.evidence.length,2);
  assert.equal(r.posted,false);
  assert.equal(r.reviewRequired,true);
  assert.equal(paths.length,2);
 }finally{db.close();}
});
test('mismatched provider refund fails review and cannot be posted',async()=>{
 const db=fixture();try{
  const r=await reviewProviderAdjustments(db,async path=>path.startsWith('refunds/')?
   {id:'re_123',livemode:true,payment_intent:'pi_test',currency:'usd',amount:1200,status:'succeeded',metadata:{order_id:'o',refund_scope:'d'}}:
   {id:'trr_123',transfer:'tr_123',amount:900},{orderId:'o',designerId:'d'});
  assert.ok(r.issues.includes('refund_provider_mismatch:d'));
 }finally{db.close();}
});
test('live orders are rejected before provider calls',async()=>{
 const db=fixture();try{
  db.prepare("UPDATE orders SET stripe_session_id='cs_live_example'").run();
  await assert.rejects(reviewProviderAdjustments(db,async()=>{throw Error('unexpected');},{orderId:'o',designerId:'d'}),/test checkout/);
 }finally{db.close();}
});
