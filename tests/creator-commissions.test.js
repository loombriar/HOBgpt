'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {STANDARD_BPS,FOUNDING_BPS,commissionBasisPoints,platformCommissionCents}=require('../lib/creator-commissions');
test('standard creator commission is 7 percent of merchandise subtotal',()=>{
  assert.equal(STANDARD_BPS,700);
  assert.equal(platformCommissionCents(10000,STANDARD_BPS),700);
});
test('founding creator commission is 5 percent of merchandise subtotal',()=>{
  assert.equal(FOUNDING_BPS,500);
  assert.equal(platformCommissionCents(10000,FOUNDING_BPS),500);
});
test('discounted merchandise amount, not shipping or tax, determines platform fee',()=>{
  const merchandiseAfterDiscount=8000,shipping=1200,tax=600;
  assert.equal(platformCommissionCents(merchandiseAfterDiscount,FOUNDING_BPS),400);
  assert.notEqual(platformCommissionCents(merchandiseAfterDiscount+shipping+tax,FOUNDING_BPS),400);
});
test('commission lookup defaults to 7% and recognizes locked 5% assignment',()=>{
  const fakeDb={prepare:()=>({get:id=>id==='founder'?{rate_basis_points:500}:undefined})};
  assert.equal(commissionBasisPoints(fakeDb,'regular'),700);
  assert.equal(commissionBasisPoints(fakeDb,'founder'),500);
});
test('rejects invalid fee input',()=>{
  assert.throws(()=>platformCommissionCents(-1,500));
  assert.throws(()=>platformCommissionCents(100,900));
  assert.throws(()=>platformCommissionCents(1.5,500));
});
