const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const start=source.indexOf("app.get('/api/admin/payout-review/:orderId/:designerId'");
const end=source.indexOf("app.post('/api/admin/payout-recovery/:orderId/:designerId'",start);
const handler=source.slice(start,end);
test('payout review is authenticated, read-only, and never authorizes retry',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(handler,/authAdmin/);
 assert.match(handler,/stripeOperations.reviewPayout/);
 assert.match(handler,/safeToRetry:false/);
 assert.match(handler,/stripeApi\('transfers\?'/);
 assert.match(handler,/method:'GET'/);
 assert.doesNotMatch(handler,/stripeOperations.request|method:'POST'|UPDATE designer_transfers|DELETE FROM stripe_operations/);
});
test('payout review fails closed for incomplete listings and provider errors',()=>{
 assert.match(handler,/page<10/);
 assert.match(handler,/providerCheck=complete\?'completed':'incomplete'/);
 assert.match(handler,/providerCheck='error'/);
 assert.match(handler,/previously configured account/);
});

test('admin operations exposes payout transfer id for safe hold matching',()=>{
 assert.match(source,/SELECT dt\.id AS transfer_id,dt\.order_id,dt\.designer_id/);
});
test('admin UI disables held retries and offers read-only evidence review',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','apps/default/src/pages/AdminPage.tsx'),'utf8');
 assert.match(ui,/operation\.kind==='payout'&&operation\.referenceId===p\.transfer_id/);
 assert.match(ui,/disabled=\{!!busy\|\|refundHeld\|\|operationHeld\}/);
 assert.match(ui,/Review Stripe evidence/);
 assert.match(ui,/api\/admin\/payout-review/);
});

test('Stripe platform identity is authenticated, read-only and uses configured secret',()=>{
 const start=source.indexOf("app.get('/api/admin/stripe-platform-identity'");
 const end=source.indexOf("app.get('/api/admin/payout-review/",start);
 assert.ok(start>=0&&end>start);
 const handler=source.slice(start,end);
 assert.match(handler,/authAdmin/);
 assert.match(handler,/stripeApi\('account',\{method:'GET'\}\)/);
 assert.match(handler,/matchesConfiguredPlatformAccount/);
 assert.doesNotMatch(handler,/STRIPE_SECRET_KEY|method:'POST'|stripeOperations\.request|UPDATE stripe_operations/);
 const ui=fs.readFileSync(path.join(__dirname,'..','apps/default/src/pages/AdminPage.tsx'),'utf8');
 assert.match(ui,/Verify Stripe platform account/);
 assert.match(ui,/api\/admin\/stripe-platform-identity/);
});

test('original payout diagnostics allowlist parameters without exposing raw payloads',()=>{
 const ledger=fs.readFileSync(path.join(__dirname,'..','lib/stripe-operations.js'),'utf8');
 const start=ledger.indexOf('function reviewPayout(referenceId)');
 const diagnostic=ledger.slice(start);
 assert.match(diagnostic,/new URLSearchParams\(row.request_body/);
 assert.match(diagnostic,/destination:validAccount\(destination\)/);
 assert.match(diagnostic,/amountCents:/);
 assert.match(diagnostic,/providerResponseRecorded:/);
 assert.match(diagnostic,/safeToRetry:false/);
 assert.doesNotMatch(diagnostic,/requestBody:row.request_body|responseJson:row.response_json|return row.request_body/);
 const ui=fs.readFileSync(path.join(__dirname,'..','apps/default/src/pages/AdminPage.tsx'),'utf8');
 assert.match(ui,/Original destination:/);
 assert.match(ui,/Original idempotency key:/);
 assert.match(ui,/Provider response recorded:/);
});

test('payout diagnostics recognize House of Briar prefixed designer IDs',()=>{
 const ledger=fs.readFileSync(path.join(__dirname,'..','lib/stripe-operations.js'),'utf8');
 const start=ledger.indexOf('function reviewPayout(referenceId)');
 const diagnostic=ledger.slice(start);
 assert.match(diagnostic,/const validDesignerId=/);
 assert.match(diagnostic,/designerId:validDesignerId\(designerId\)/);
 assert.match(diagnostic,/validUuid\(orderId\)&&validDesignerId\(designerId\)/);
});

test('destination account review uses read-only Stripe GET and fails closed',()=>{
 assert.match(handler,/stripeApi\('accounts\/'\+encodeURIComponent\(destinations\[0\]\),\{method:'GET'\}\)/);
 assert.match(handler,/evidence\.destinationCheck/);
 assert.match(handler,/capabilities\?\.transfers/);
 assert.match(handler,/payouts_enabled/);
 assert.match(handler,/safeToRetry:false/);
 assert.doesNotMatch(handler,/method:'POST'|stripeOperations\.request|UPDATE stripe_operations/);
 const ui=fs.readFileSync(path.join(__dirname,'..','apps/default/src/pages/AdminPage.tsx'),'utf8');
 assert.match(ui,/Original destination Stripe check:/);
 assert.match(ui,/Transfers capability:/);
});

test('staging recovery is narrowly scoped, durable, and never retries held refunds',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 const start=source.indexOf("app.post('/api/admin/payout-recovery/:orderId/:designerId'");
 assert.ok(start>0);
 const recovery=source.slice(start,source.indexOf("app.get('/api/admin/operations'",start));
 assert.match(recovery,/RAILWAY_ENVIRONMENT_NAME!=='staging'/);
 assert.match(recovery,/startsWith\('sk_test_'\)/);
 assert.match(recovery,/confirmation_required/);
 assert.match(recovery,/original\[0\]\.state!=='rejected'/);
 assert.match(recovery,/postage\.customerRefundHold\|\|postage\.postageHold/);
 assert.match(recovery,/SELECT 1 FROM order_refunds/);
 assert.match(recovery,/SELECT 1 FROM stripe_operations WHERE operation_key/);
 assert.match(recovery,/UPDATE designer_transfers SET payout_in_flight=1/);
 assert.match(recovery,/stripeOperations\.request\('payout'/);
 assert.match(recovery,/if\(!complete\)throw/);
 assert.doesNotMatch(recovery,/method:'POST'/);
});

test('admin recovery control requires exact staging test payout and typed confirmation',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','apps/default/src/pages/AdminPage.tsx'),'utf8');
 assert.match(ui,/p\.order_id===recoveryOrderId&&p\.designer_id===recoveryDesignerId&&p\.amount_cents===465/);
 assert.match(ui,/p\.status==='failed'&&!refundHeld/);
 assert.match(ui,/recoveryConfirmation!==\('RECOVER '\+recoveryOrderId\+' \$4\.65'\)/);
 assert.match(ui,/api\/admin\/payout-recovery/);
 assert.match(ui,/body:JSON\.stringify\(\{confirmation\}\)/);
 assert.match(ui,/setRecoveryNotice\('Sandbox transfer confirmed:/);
});
