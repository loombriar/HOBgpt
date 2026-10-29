'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createTestRefundAudit}=require('../lib/designer-test-refund-audit');
test('append-only audit preserves preview, apply and review-required history',()=>{
 const db=new Database(':memory:');try{
  const audit=createTestRefundAudit(db);
  audit.record({orderId:'o',scope:'full',refundId:'re_test',action:'preview',outcome:'verified',detail:'preview'});
  audit.record({orderId:'o',scope:'full',refundId:'re_test',action:'apply',outcome:'posted',detail:'applied'});
  audit.record({orderId:'o',scope:'full',action:'blocked',outcome:'review_required',detail:'provider_mismatch'});
  const rows=audit.list('o','full');
  assert.deepEqual(rows.map(x=>x.action),['preview','apply','blocked']);
  assert.equal(rows[0].refund_id,'re_test');
  assert.equal(audit.list('other','full').length,0);
 }finally{db.close();}
});
test('rejects invalid audit outcomes',()=>{
 const db=new Database(':memory:');try{
  const audit=createTestRefundAudit(db);
  assert.throws(()=>audit.record({orderId:'o',scope:'full',action:'apply',outcome:'paid',detail:'bad'}),/Invalid/);
 }finally{db.close();}
});
