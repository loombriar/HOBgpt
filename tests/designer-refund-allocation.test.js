'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {allocateOrderRefund}=require('../lib/designer-refund-allocation');
function fixture(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT,subtotal_cents INTEGER);
 CREATE TABLE order_items(order_id TEXT,designer_id TEXT,line_total_cents INTEGER,platform_fee_cents INTEGER,designer_amount_cents INTEGER);
 INSERT INTO orders VALUES('o',10000);
 INSERT INTO order_items VALUES('o','a',6000,900,5100);
 INSERT INTO order_items VALUES('o','b',4000,600,3400);`);
 return db;
}
test('full refund allocates exact customer gross and separate earnings exposures across designers',()=>{
 const db=fixture();try{
  const r=allocateOrderRefund(db,{orderId:'o',scope:'full',amountCents:10000});
  assert.equal(r.status,'allocatable');
  assert.deepEqual(r.allocations.map(a=>a.customerRefundCents),[6000,4000]);
  assert.deepEqual(r.allocations.map(a=>a.designerEarningsExposureCents),[5100,3400]);
 }finally{db.close();}
});
test('seller refund only allocates to selected designer',()=>{
 const db=fixture();try{
  const r=allocateOrderRefund(db,{orderId:'o',scope:'b',amountCents:4000});
  assert.equal(r.allocations.length,1);
  assert.equal(r.allocations[0].designerId,'b');
 }finally{db.close();}
});
test('refuses to invent seller liability for shipping or partial refund differences',()=>{
 const db=fixture();try{
  assert.equal(allocateOrderRefund(db,{orderId:'o',scope:'full',amountCents:11000}).status,'review_required');
  assert.equal(allocateOrderRefund(db,{orderId:'o',scope:'a',amountCents:3000}).status,'review_required');
 }finally{db.close();}
});
test('rejects inconsistent item fee allocation',()=>{
 const db=fixture();try{
  db.prepare("UPDATE order_items SET designer_amount_cents=5500 WHERE designer_id='a'").run();
  assert.throws(()=>allocateOrderRefund(db,{orderId:'o',scope:'full',amountCents:10000}),/requires review/);
 }finally{db.close();}
});
