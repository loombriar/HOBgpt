'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
function fixture() {
  const db=new Database(':memory:');
  const ledger=createDesignerSettlementLedger(db);
  const add=(id,type,amountCents,extra={})=>ledger.record({
    eventId:id,orderId:'order-1',designerId:'atelier-emine',currency:'usd',
    type,amountCents,sourceReference:'provider-event-'+id,testMode:true,...extra
  });
  return {db,ledger,add};
}
test('tracks a sale, commission, processing fee, refund and payout separately',()=>{
  const f=fixture();try {
    f.add('s','sale',10000);f.add('c','commission',1500);f.add('fee','processing_fee',300);
    f.add('refund','refund',2000);f.add('hold','reserve_hold',500);
    assert.equal(f.ledger.summary('order-1','atelier-emine',true).availableCents,5700);
    f.add('release','reserve_release',500);f.add('payout','payout',6200);
    const s=f.ledger.summary('order-1','atelier-emine',true);
    assert.equal(s.availableCents,0);assert.equal(s.paidCents,6200);assert.equal(s.reviewRequired,false);
  }finally{f.db.close();}
});
test('duplicate provider event is idempotent but changed payload is rejected',()=>{
  const f=fixture();try{
    assert.equal(f.add('sale-1','sale',1000).inserted,true);
    assert.equal(f.add('sale-1','sale',1000).inserted,false);
    assert.throws(()=>f.add('sale-1','sale',999),/conflicts/);
    assert.equal(f.ledger.entries('order-1','atelier-emine',true).length,1);
  }finally{f.db.close();}
});
test('isolates test and live data and currencies',()=>{
  const f=fixture();try{
    f.add('sale','sale',1000);
    assert.equal(f.ledger.summary('order-1','atelier-emine',false).entryCount,0);
    assert.throws(()=>f.add('live','sale',1000,{testMode:false}),/mismatch/);
    assert.throws(()=>f.add('eur','sale',1000,{currency:'eur'}),/mismatch/);
  }finally{f.db.close();}
});
test('never silently accepts a negative balance as payout ready',()=>{
  const f=fixture();try{
    f.add('refund','refund',500);
    assert.equal(f.ledger.summary('order-1','atelier-emine',true).reviewRequired,true);
  }finally{f.db.close();}
});
test('rejects invalid amounts and identifiers',()=>{
  const f=fixture();try{
    assert.throws(()=>f.add('zero','sale',0),TypeError);
    assert.throws(()=>f.add('float','sale',1.5),TypeError);
    assert.throws(()=>f.add('negative','sale',-1),TypeError);
    assert.throws(()=>f.add('bad','sale',100,{sourceReference:''}),TypeError);
  }finally{f.db.close();}
});
