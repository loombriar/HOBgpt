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

test('payout gate behavior: admin override and simulated tracking never reach Stripe', () => {
  const match = fn.match(/if \((!existing\.tracking_number[\s\S]*?)\) \{ results\.push\(\{ designer_id: group\.designer_id, status: 'pending', reason: 'carrier_verification_required' \}\); continue; \}/);
  assert.ok(match, 'expected payout safety gate');
  const blocked = new Function('existing', 'return Boolean(' + match[1] + ')');
  const valid = {tracking_number:'1Z999AA10123456784',tracking_verified_at:'2026-10-10T00:00:00Z',tracking_status:'in_transit'};
  const scenarios = [
    ['real verified carrier event', valid, false],
    ['no verification timestamp', {...valid,tracking_verified_at:null}, true],
    ['tracking submitted only', {...valid,tracking_status:'submitted'}, true],
    ['simulated Shippo transit', {...valid,tracking_number:'SHIPPO_TRANSIT'}, true],
    ['simulated Shippo delivered', {...valid,tracking_number:'SHIPPO_DELIVERED'}, true],
    ['test tracking status', {...valid,tracking_status:'test_delivered'}, true],
    ['missing tracking number', {...valid,tracking_number:''}, true],
    ['unverified delivery', {...valid,tracking_status:'unknown'}, true]
  ];
  for (const [name, transfer, expected] of scenarios) {
    assert.equal(blocked(transfer),expected,name);
  }
  assert.match(fn, /admin_override|releaseReason/);
  assert.ok(fn.indexOf('carrier_verification_required') < fn.indexOf("stripeApi('transfers'"));
});
