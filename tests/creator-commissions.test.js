'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {STANDARD_BPS,FOUNDING_BPS,commissionBasisPoints,platformCommissionCents}=require('../lib/creator-commissions');
test('standard rate is 7% and verified school rate is permanently 5%',()=>{
 const db={prepare:()=>({get:id=>id==='student'?{rate_basis_points:500}:undefined})};
 assert.equal(STANDARD_BPS,700);assert.equal(FOUNDING_BPS,500);
 for(const date of ['2026-10-21','2027-10-21','2050-01-01'])assert.equal(commissionBasisPoints(db,'student',date),500);
 assert.equal(commissionBasisPoints(db,'regular'),700);
 assert.equal(platformCommissionCents(10000,500),500);assert.equal(platformCommissionCents(10000,700),700);
 assert.equal(platformCommissionCents(8001,500),400);
});
test('fee inputs reject negative, fractional or unsupported values',()=>{
 for(const value of [-1,1.5,NaN,Infinity])assert.throws(()=>platformCommissionCents(value,500));
 assert.throws(()=>platformCommissionCents(100,900));assert.throws(()=>commissionBasisPoints({},''));
});
