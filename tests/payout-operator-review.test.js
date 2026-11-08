const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const start=source.indexOf("app.get('/api/admin/payout-review/:orderId/:designerId'");
const end=source.indexOf("app.get('/api/admin/operations'",start);
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
