'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
const {postVerifiedTestRefund}=require('../lib/designer-verified-test-refund');
function setup(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT,status TEXT,stripe_session_id TEXT,stripe_payment_intent_id TEXT,currency TEXT,subtotal_cents INTEGER);
 CREATE TABLE order_items(order_id TEXT,designer_id TEXT,line_total_cents INTEGER,platform_fee_cents INTEGER,designer_amount_cents INTEGER);
 CREATE TABLE order_refunds(order_id TEXT,scope TEXT,status TEXT,stripe_refund_id TEXT,amount_cents INTEGER);
 CREATE TABLE designer_transfers(order_id TEXT,designer_id TEXT,status TEXT,payout_in_flight INTEGER,stripe_reversal_id TEXT);
 INSERT INTO orders VALUES('o','paid','cs_test_123','pi_123','usd',10000);
 INSERT INTO order_items VALUES('o','a',6000,900,5100),('o','b',4000,600,3400);
 INSERT INTO order_refunds VALUES('o','full','succeeded','re_123',10000);`);
 const ledger=createDesignerSettlementLedger(db);
 for(const [designer,gross,fee] of [['a',6000,900],['b',4000,600]]){
  for(const [type,amount] of [['sale',gross],['commission',fee]])
   ledger.record({eventId:type+designer,orderId:'o',designerId:designer,currency:'usd',type,amountCents:amount,sourceReference:'test',testMode:true});
 }
 const api=async()=>({id:'re_123',livemode:false,status:'succeeded',payment_intent:'pi_123',currency:'usd',amount:10000,metadata:{order_id:'o',refund_scope:'full'}});
 return {db,ledger,api,args:{orderId:'o',scope:'full'}};
}
test('previews and atomically journals both sellers once',async()=>{
 const f=setup();try{
  const preview=await postVerifiedTestRefund(f.db,f.ledger,f.api,f.args);
  assert.equal(preview.events.length,2);
  assert.equal(f.ledger.entries('o','a',true).length,2);
  await postVerifiedTestRefund(f.db,f.ledger,f.api,{...f.args,apply:true});
  await postVerifiedTestRefund(f.db,f.ledger,f.api,{...f.args,apply:true});
  assert.equal(f.ledger.summary('o','a',true).availableCents,0);
  assert.equal(f.ledger.summary('o','b',true).availableCents,0);
 }finally{f.db.close();}
});
test('rejects mismatched provider data without posting',async()=>{
 const f=setup();try{
  await assert.rejects(postVerifiedTestRefund(f.db,f.ledger,async()=>({...await f.api(),livemode:true}),{...f.args,apply:true}),/mismatch/);
  assert.equal(f.ledger.entries('o','a',true).length,2);
 }finally{f.db.close();}
});
test('rejects payout activity across any seller before atomic posting',async()=>{
 const f=setup();try{
  f.db.prepare("INSERT INTO designer_transfers VALUES('o','b','paid',0,NULL)").run();
  await assert.rejects(postVerifiedTestRefund(f.db,f.ledger,f.api,{...f.args,apply:true}),/Transfer activity/);
  assert.equal(f.ledger.entries('o','a',true).length,2);
 }finally{f.db.close();}
});
