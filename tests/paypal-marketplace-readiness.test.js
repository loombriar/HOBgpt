'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceSandboxReadiness } = require('../lib/paypal-marketplace-readiness');

test('unconfigured sandbox is not ready', () => {
  const result = marketplaceSandboxReadiness({});
  assert.equal(result.readyForSandboxPlanning, false);
  assert.equal(result.readyForMarketplaceTransactions, false);
  assert.ok(result.reasons.includes('sandbox_environment_required'));
});

test('sandbox credentials permit planning only, never transactions', () => {
  const result = marketplaceSandboxReadiness({
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sandbox-id',
    PAYPAL_CLIENT_SECRET: 'sandbox-secret',
    PAYPAL_MARKETPLACE_APPROVED: 'true',
  });
  assert.equal(result.readyForSandboxPlanning, true);
  assert.equal(result.readyForMarketplaceTransactions, false);
});

test('live environment cannot pass sandbox preflight', () => {
  const result = marketplaceSandboxReadiness({
    PAYPAL_ENVIRONMENT: 'live',
    PAYPAL_CLIENT_ID: 'id',
    PAYPAL_CLIENT_SECRET: 'secret',
  });
  assert.equal(result.readyForSandboxPlanning, false);
});
