'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
const {importPaidTestOrder}=require('../lib/designer-test-order-import');
const {reconcileDesignerOrder}=require('../lib/designer-order-reconciliation');
function fixture(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,currency TEXT,stripe_session_id TEXT,refund_status TEXT);
 CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,designer_id TEXT,line_total_cents INTEGER,platform_fee_cents INTEGER,designer_amount_cents INTEGER);
 CREATE TABLE designer_transfers(order_id TEXT,designer_id TEXT,status TEXT,amount_cents INTEGER,stripe_transfer_id TEXT);
 INSERT INTO orders VALUES('o','paid','usd','cs_test_example',NULL);
 INSERT INTO order_items VALUES('i','o','atelier',10000,1500,8500);
 INSERT INTO designer_transfers VALUES('o','atelier','pending',8500,NULL);`);
 const ledger=createDesignerSettlementLedger(db);
 const scope={orderId:'o',designerId:'atelier'};
 return {db,ledger,scope};
}
test('imports actual paid test-order allocations idempotently and reconciles',()=>{
 const f=fixture();try{
  importPaidTestOrder(f.db,f.ledger,f.scope);
  importPaidTestOrder(f.db,f.ledger,f.scope);
  assert.equal(f.ledger.entries('o','atelier',true).length,2);
  const result=reconcileDesignerOrder(f.db,f.ledger,{...f.scope,testMode:true});
  assert.equal(result.status,'reconciled');
  assert.equal(result.allocation.designerNetCents,8500);
 }finally{f.db.close();}
});
test('rejects live order import and refuses cross-environment reconciliation',()=>{
 const f=fixture();try{
  f.db.prepare("UPDATE orders SET stripe_session_id='cs_live_example'").run();
  assert.throws(()=>importPaidTestOrder(f.db,f.ledger,f.scope),/test-mode/);
  assert.equal(reconcileDesignerOrder(f.db,f.ledger,{...f.scope,testMode:true}).status,'environment_unverified');
 }finally{f.db.close();}
});
test('refunds are blocked from automatic import and flagged for review',()=>{
 const f=fixture();try{
  f.db.prepare("UPDATE orders SET refund_status='succeeded'").run();
  assert.throws(()=>importPaidTestOrder(f.db,f.ledger,f.scope),/Refunded/);
  const result=reconcileDesignerOrder(f.db,f.ledger,{...f.scope,testMode:true});
  assert.ok(result.issues.includes('refund_requires_provider_reconciliation'));
 }finally{f.db.close();}
});
test('flags payout mismatch and rejects changed source allocations',()=>{
 const f=fixture();try{
  importPaidTestOrder(f.db,f.ledger,f.scope);
  f.db.prepare("UPDATE designer_transfers SET status='paid'").run();
  assert.ok(reconcileDesignerOrder(f.db,f.ledger,{...f.scope,testMode:true}).issues.includes('journal_payout_mismatch'));
  f.db.prepare("UPDATE order_items SET line_total_cents=11000,designer_amount_cents=9500").run();
  assert.throws(()=>importPaidTestOrder(f.db,f.ledger,f.scope),/conflicts/);
 }finally{f.db.close();}
});
