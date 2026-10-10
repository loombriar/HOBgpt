const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('async function processDesignerTransfers(');
const end = source.indexOf('\n  function releaseExpiredInventoryReservations()', start);
const fn = source.slice(start, end);
test('every Stripe payout path checks verified tracking before transfer API', () => {
  assert.ok(start >= 0 && end > start);
  const gate = fn.indexOf('carrier_verification_required');
  const transfer = fn.indexOf("stripeApi('transfers'");
  assert.ok(gate > 0 && transfer > gate);
  assert.match(fn.slice(0, gate), /!existing\.tracking_verified_at/);
  assert.match(fn.slice(0, gate), /!existing\.tracking_number/);
  assert.doesNotMatch(fn.slice(0, gate), /releaseReason === 'tracking_verified'/);
});
test('simulated Shippo tracking and test statuses are rejected before transfer API', () => {
  const gate = fn.slice(0, fn.indexOf('carrier_verification_required'));
  assert.match(gate, /SHIPPO_\(TRANSIT\|DELIVERED/);
  assert.match(gate, /startsWith\('test_'\)/);
});
test('seller terms, paid Stripe order, and refund holds remain prerequisites', () => {
  assert.match(fn, /status = 'paid'/);
  assert.match(fn, /payment_provider !== 'stripe'/);
  assert.match(fn, /payoutSellerTermsAcceptance/);
  assert.match(fn, /refund_hold/);
});
