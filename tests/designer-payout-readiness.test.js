'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {assessDesignerPayout} = require('../lib/designer-payout-readiness');

test('Turkish designer remains blocked before provider and compliance approval', () => {
  const result = assessDesignerPayout({country:'TR',method:'global_payouts'});
  assert.equal(result.payoutsReady, false);
  assert.ok(result.reasons.includes('provider_approval_required'));
  assert.ok(result.reasons.includes('compliance_approval_required'));
});

test('unknown or unsupported payout method fails closed', () => {
  const result = assessDesignerPayout({country:'TR',method:'manual_wire',providerApproved:true,complianceApproved:true,recipientVerified:true,payoutRailReady:true});
  assert.equal(result.payoutsReady, false);
  assert.ok(result.reasons.includes('approved_payout_method_required'));
});

test('verified approved alternative provider may become ready', () => {
  const result = assessDesignerPayout({country:'TR',method:'approved_marketplace_provider',providerApproved:true,complianceApproved:true,recipientVerified:true,payoutRailReady:true});
  assert.equal(result.payoutsReady, true);
  assert.deepEqual(result.reasons, []);
});

test('missing or malformed country is blocked', () => {
  assert.equal(assessDesignerPayout({country:'Turkey'}).payoutsReady,false);
  assert.ok(assessDesignerPayout({country:'Turkey'}).reasons.includes('valid_country_required'));
});

test('truthy strings do not count as approvals', () => {
  const result=assessDesignerPayout({country:'TR',method:'global_payouts',providerApproved:'true',complianceApproved:'true',recipientVerified:'true',payoutRailReady:'true'});
  assert.equal(result.payoutsReady,false);
});
