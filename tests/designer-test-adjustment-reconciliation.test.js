'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
const {reconcileTestAdjustments}=require('../lib/designer-test-adjustment-reconciliation');
function setup(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT,status TEXT,stripe_session_id TEXT,currency TEXT,refund_status TEXT);
 CREATE TABLE order_items(order_id TEXT,designer_id TEXT);
 CREATE TABLE postage_charges(transaction_id TEXT,order_id TEXT,designer_id TEXT,test_mode INTEGER,status TEXT,cost_cents INTEGER);
 CREATE TABLE postage_adjustments(transaction_id TEXT);
 CREATE TABLE order_refunds(order_id TEXT,status TEXT);
 CREATE TABLE designer_transfers(order_id TEXT,designer_id TEXT,status TEXT,amount_cents INTEGER,stripe_transfer_id TEXT,stripe_reversal_id TEXT,payout_in_flight INTEGER);
 INSERT INTO orders VALUES('o','paid','cs_test_123','usd',NULL);
 INSERT INTO order_items VALUES('o','d');
 INSERT INTO postage_charges VALUES('p1','o','d',1,'charged',500);
 INSERT INTO designer_transfers VALUES('o','d','paid',1000,'tr_123',NULL,0);`);
 return {db,ledger:createDesignerSettlementLedger(db),scope:{orderId:'o',designerId:'d'}};
}
test('previews without writes; applies confirmed test charges and transfers idempotently',()=>{
 const f=setup();try{
  const p=reconcileTestAdjustments(f.db,f.ledger,f.scope);
  assert.equal(p.candidates.length,2);
  assert.equal(f.ledger.entries('o','d',true).length,0);
  reconcileTestAdjustments(f.db,f.ledger,{...f.scope,apply:true});
  reconcileTestAdjustments(f.db,f.ledger,{...f.scope,apply:true});
  assert.equal(f.ledger.entries('o','d',true).length,2);
 }finally{f.db.close();}
});
test('refunded or reversed transfers block all writes',()=>{
 const f=setup();try{
  f.db.prepare("INSERT INTO order_refunds VALUES('o','succeeded')").run();
  f.db.prepare("UPDATE designer_transfers SET stripe_reversal_id='trr_123'").run();
  assert.equal(reconcileTestAdjustments(f.db,f.ledger,f.scope).issues.length,2);
  assert.throws(()=>reconcileTestAdjustments(f.db,f.ledger,{...f.scope,apply:true}),/Unresolved/);
  assert.equal(f.ledger.entries('o','d',true).length,0);
 }finally{f.db.close();}
});
test('rejects live Stripe sessions and uncertain postage',()=>{
 const f=setup();try{
  f.db.prepare("UPDATE orders SET stripe_session_id='cs_live_123'").run();
  assert.throws(()=>reconcileTestAdjustments(f.db,f.ledger,f.scope),/test orders/);
  f.db.prepare("UPDATE orders SET stripe_session_id='cs_test_123'").run();
  f.db.prepare("UPDATE postage_charges SET status='review_required'").run();
  assert.equal(reconcileTestAdjustments(f.db,f.ledger,f.scope).reviewRequired,true);
 }finally{f.db.close();}
});
