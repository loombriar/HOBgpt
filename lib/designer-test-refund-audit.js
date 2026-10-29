'use strict';
// Persistent append-only operator decision trail; contains no Stripe secrets or PII.
function createTestRefundAudit(db){
 db.exec(`CREATE TABLE IF NOT EXISTS designer_test_refund_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL, scope TEXT NOT NULL, refund_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('preview','apply','blocked')),
  outcome TEXT NOT NULL CHECK(outcome IN ('verified','posted','review_required')),
  detail TEXT NOT NULL, created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS test_refund_audit_lookup ON designer_test_refund_audit(order_id,scope,audit_id);`);
 function record({orderId,scope,refundId=null,action,outcome,detail}){
  if(typeof orderId!=='string'||!orderId||typeof scope!=='string'||!scope||
    !['preview','apply','blocked'].includes(action)||
    !['verified','posted','review_required'].includes(outcome)||
    typeof detail!=='string'||detail.length>300)throw new TypeError('Invalid refund audit record');
  return db.prepare('INSERT INTO designer_test_refund_audit(order_id,scope,refund_id,action,outcome,detail,created_at) VALUES(?,?,?,?,?,?,?)')
   .run(orderId,scope,refundId,action,outcome,detail,new Date().toISOString()).lastInsertRowid;
 }
 function list(orderId,scope){
  if(typeof orderId!=='string'||!orderId||typeof scope!=='string'||!scope)throw new TypeError('Invalid audit scope');
  return db.prepare('SELECT * FROM designer_test_refund_audit WHERE order_id=? AND scope=? ORDER BY audit_id').all(orderId,scope);
 }
 return {record,list};
}
module.exports={createTestRefundAudit};
