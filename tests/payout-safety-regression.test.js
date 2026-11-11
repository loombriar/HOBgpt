const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp, SELLER_TERMS_VERSION } = require('../server');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('async function processDesignerTransfers(');
const end = source.indexOf('\n  function releaseExpiredInventoryReservations()', start);
const fn = source.slice(start, end);

async function payoutReleaseFixture(stripeApi) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-payout-retry-'));
  const ctx = createApp({
    dataDir,
    seedProducts: [{ id: 'payout-piece', designerId: 'maker', title: 'Piece', price: 50 }],
    adminToken: 'payout-retry-admin',
    stripeApi
  });
  const db = ctx.db;
  const now = new Date().toISOString();
  db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_retry_maker',status='active' WHERE id='maker'").run();
  db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker', SELLER_TERMS_VERSION, now, 'test');
  db.prepare("INSERT INTO orders (id,stripe_session_id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at) VALUES ('payout-order','cs_retry_order','paid','stripe','usd',5000,500,4500,?,?)").run(now, now);
  db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('payout-line','payout-order','payout-piece','maker','Piece',5000,1,5000,500,4500)").run();
  db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_number,tracking_carrier,tracking_status,tracking_verified_at) VALUES ('held','payout-order','maker','acct_retry_maker',4500,'pending',?,'1Z999AA10123456784','ups','in_transit',?)").run(now, now);
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/admin/orders/payout-order/designers/maker/release`;
  return {
    ctx,
    db,
    async release() {
      const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer payout-retry-admin' } });
      return { status: response.status, body: await response.json() };
    },
    async close() {
      await new Promise(resolve => server.close(resolve));
      db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

test('every Stripe payout path checks verified tracking before transfer API', () => {
  assert.ok(start >= 0 && end > start);
  const gate = fn.indexOf('carrier_verification_required');
  const transfer = fn.indexOf("stripeOperations.request('payout',transferId,'transfers'");
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
  const match = fn.match(/if \((!patterns\.groupReady[\s\S]*?!existing\.tracking_number[\s\S]*?)\) \{ results\.push\(\{ designer_id: group\.designer_id, status: 'pending', reason: 'carrier_verification_required' \}\); continue; \}/);
  assert.ok(match, 'expected payout safety gate');
  const blocked = new Function('existing', 'patterns', 'orderId', 'group', 'return Boolean(' + match[1] + ')');
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
    assert.equal(blocked(transfer,{groupReady:()=>false},'physical-order',{designer_id:'maker'}),expected,name);
  }
  assert.match(fn, /admin_override|releaseReason/);
  assert.ok(fn.indexOf('carrier_verification_required') < fn.indexOf("stripeOperations.request('payout',transferId,'transfers'"));
});

test('only an explicit retry after a definite rejection can use a fresh payout key',()=>{
  assert.match(fn,/releaseReason==='admin_retry'\?stripeOperations\.adminRetryPayoutIdempotencyKey\(transferId,initialKey\):initialKey/);
  assert.match(fn,/if\(error\.payoutConflict\)\{results\.push\(\{designer_id:group\.designer_id,status:'pending',reason:error\.payoutReviewRequired\?'provider_reconciliation_required':'transfer_processing'\}\);continue;\}/);
  const ledger=fs.readFileSync(require('node:path').join(__dirname,'..','lib','stripe-operations.js'),'utf8');
  assert.match(ledger,/rows\.every\(row=>row\.state==='rejected'&&row\.response_json===null&&row\.attempt_count===1\)/);
  assert.match(ledger,/operation_key<>\? AND state IN \('initiating','unknown','received','review_required'\)/);
});

test('admin release retries a definite Stripe rejection with a fresh idempotency key',async()=>{
  const attempts=[];
  const fixture=await payoutReleaseFixture(async(endpoint,request={})=>{
    assert.equal(endpoint,'transfers');
    attempts.push({key:request.idempotencyKey,body:request.body});
    if(attempts.length===1)throw Object.assign(new Error('Destination account rejected'),{providerStatus:401});
    return{id:'tr_after_retry'};
  });
  try{
    const first=await fixture.release();
    assert.equal(first.status,200);
    assert.deepEqual(first.body.results[0],{designer_id:'maker',status:'failed',reason:'provider_rejected'});
    assert.equal(fixture.db.prepare("SELECT status FROM designer_transfers WHERE id='held'").get().status,'failed');

    const second=await fixture.release();
    assert.equal(second.status,200);
    assert.deepEqual(second.body.results[0],{designer_id:'maker',status:'paid',stripe_transfer_id:'tr_after_retry'});
    assert.equal(attempts.length,2);
    assert.equal(attempts[0].key,'hob-transfer-payout-order-maker');
    assert.equal(attempts[1].key,'hob-transfer-payout-order-maker-retry-1');
    assert.equal(attempts[1].body,attempts[0].body);
    assert.deepEqual(fixture.db.prepare("SELECT operation_key,state,attempt_count FROM stripe_operations WHERE kind='payout' AND reference_id='held' ORDER BY operation_key").all(),[
      {operation_key:'hob-transfer-payout-order-maker',state:'rejected',attempt_count:1},
      {operation_key:'hob-transfer-payout-order-maker-retry-1',state:'applied',attempt_count:1}
    ]);
    assert.deepEqual(fixture.db.prepare("SELECT status,stripe_transfer_id,payout_in_flight FROM designer_transfers WHERE id='held'").get(),{status:'paid',stripe_transfer_id:'tr_after_retry',payout_in_flight:0});
  }finally{
    await fixture.close();
  }
});

test('admin release preserves the original key and payout hold after an ambiguous Stripe outcome',async()=>{
  const attempts=[];
  const fixture=await payoutReleaseFixture(async(endpoint,request={})=>{
    assert.equal(endpoint,'transfers');
    attempts.push(request.idempotencyKey);
    if(attempts.length===1)throw new Error('Provider response lost after submission');
    throw Object.assign(new Error('Replay rejected'),{providerStatus:401});
  });
  try{
    const first=await fixture.release();
    assert.equal(first.status,200);
    assert.deepEqual(first.body.results[0],{designer_id:'maker',status:'pending',reason:'provider_outcome_unknown'});
    assert.equal(attempts.length,1);
    assert.equal(attempts[0],'hob-transfer-payout-order-maker');

    const blocked=await fixture.release();
    assert.equal(blocked.status,200);
    assert.deepEqual(blocked.body.results[0],{designer_id:'maker',status:'pending',reason:'transfer_processing'});
    assert.equal(attempts.length,1,'admin release must not start a second key while the outcome is unresolved');

    const reconciliation=await fixture.ctx.reconcileFinancialOperations();
    assert.equal(reconciliation.errors,1);
    assert.deepEqual(attempts,['hob-transfer-payout-order-maker','hob-transfer-payout-order-maker']);
    assert.deepEqual(fixture.db.prepare("SELECT operation_key,state,attempt_count FROM stripe_operations WHERE kind='payout' AND reference_id='held'").get(),{
      operation_key:'hob-transfer-payout-order-maker',state:'unknown',attempt_count:2
    });
    assert.deepEqual(fixture.db.prepare("SELECT status,stripe_transfer_id,payout_in_flight FROM designer_transfers WHERE id='held'").get(),{status:'pending',stripe_transfer_id:null,payout_in_flight:1});
  }finally{
    await fixture.close();
  }
});
