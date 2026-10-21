'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {STANDARD_BPS,FOUNDING_BPS,commissionBasisPoints,studentDiscountExpiresAt,platformCommissionCents}=require('../lib/creator-commissions');
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
test('student gets 5% for 12 months and 7% at the anniversary',()=>{
  const db={prepare:sql=>({get:id=>sql.includes('founding_creator_assignments')?undefined:id==='student'?{assigned_at:'2026-10-21T12:00:00.000Z'}:undefined})};
  assert.equal(commissionBasisPoints(db,'student','2027-10-21T11:59:59.999Z'),500);
  assert.equal(commissionBasisPoints(db,'student','2027-10-21T12:00:00.000Z'),700);
  assert.equal(commissionBasisPoints(db,'regular','2026-10-21T12:00:00.000Z'),700);
});
test('general founders retain 5% after first year',()=>{
  const db={prepare:sql=>({get:()=>sql.includes('founding_creator_assignments')?{founder_number:1}:undefined})};
  assert.equal(commissionBasisPoints(db,'founder','2030-01-01T00:00:00Z'),500);
});
test('leap-day activation expires on February 28 in the next year',()=>{
  assert.equal(studentDiscountExpiresAt('2024-02-29T09:30:00Z'),'2025-02-28T09:30:00.000Z');
});
test('rejects invalid fee input',()=>{
  assert.throws(()=>platformCommissionCents(-1,500));
  assert.throws(()=>platformCommissionCents(100,900));
  assert.throws(()=>platformCommissionCents(1.5,500));
});
