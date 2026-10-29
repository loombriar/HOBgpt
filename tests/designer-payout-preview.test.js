'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {previewDesignerSettlement}=require('../lib/designer-payout-preview');

test('simulates gross, commission, fees and designer net without moving money',()=>{
  const result=previewDesignerSettlement({grossCents:10000,commissionCents:1500,processingFeeCents:300});
  assert.equal(result.designerNetCents,8200);
  assert.equal(result.simulationOnly,true);
});
test('simulates a partial refund and reserve',()=>{
  const result=previewDesignerSettlement({grossCents:10000,commissionCents:1500,processingFeeCents:300,refundedCents:2000,reservedCents:500});
  assert.equal(result.designerNetCents,5700);
});
test('rejects over-deductions instead of generating negative designer payouts',()=>{
  assert.throws(()=>previewDesignerSettlement({grossCents:1000,commissionCents:900,refundedCents:200}),RangeError);
});
test('rejects fractional or negative minor units',()=>{
  assert.throws(()=>previewDesignerSettlement({grossCents:10.5,commissionCents:0}),RangeError);
  assert.throws(()=>previewDesignerSettlement({grossCents:100,commissionCents:-1}),RangeError);
});
test('rejects unsafe integers',()=>{
  assert.throws(()=>previewDesignerSettlement({grossCents:Number.MAX_SAFE_INTEGER+1,commissionCents:0}),RangeError);
});
