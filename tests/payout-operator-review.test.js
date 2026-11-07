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
