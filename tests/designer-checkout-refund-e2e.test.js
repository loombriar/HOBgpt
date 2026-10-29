'use strict';
// Explicitly opt-in, local-only integration harness. Uses a pre-provisioned real
// Stripe test Checkout -> paid webhook -> refund fixture in a disposable server.
// Does not create Stripe payments, refunds, transfers, or international payouts.
const test=require('node:test'),assert=require('node:assert/strict');
const enabled=process.env.RUN_HOB_CHECKOUT_REFUND_E2E==='true';
test('sandbox Checkout -> webhook -> ledger -> refund -> audit verification',
 {skip:enabled?false:'explicit opt-in only'},async()=>{
 const base=process.env.HOB_E2E_BASE_URL;
 const token=process.env.HOB_E2E_ADMIN_TOKEN;
 const orderId=process.env.HOB_E2E_ORDER_ID;
 const designers=(process.env.HOB_E2E_DESIGNER_IDS||'').split(',').filter(Boolean);
 const refundId=process.env.HOB_E2E_REFUND_ID;
 const stripeKey=process.env.STRIPE_TEST_SECRET_KEY;
 assert.ok(base&&token&&orderId&&refundId&&stripeKey&&designers.length>=2,'Missing sandbox fixture configuration');
 const url=new URL(base);
 assert.equal(url.protocol,'http:','Only disposable HTTP loopback server permitted');
 assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname),'Never run against production or remote staging');
 assert.match(stripeKey,/^sk_test_/);
 assert.match(refundId,/^re_/);
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 async function admin(path,options={}){
  const response=await fetch(new URL(path,url),{...options,headers,signal:AbortSignal.timeout(15000)});
  const payload=await response.json();
  assert.equal(response.status,200,JSON.stringify(payload));
  return payload;
 }
 const stripeResponse=await fetch('https://api.stripe.com/v1/refunds/'+encodeURIComponent(refundId),{
  headers:{Authorization:'Bearer '+stripeKey},signal:AbortSignal.timeout(15000)});
 assert.equal(stripeResponse.status,200,'Stripe test refund retrieval failed');
 const refund=await stripeResponse.json();
 assert.equal(refund.livemode,false);
 assert.equal(refund.status,'succeeded');
 assert.equal(refund.metadata?.order_id,orderId);
 assert.equal(refund.metadata?.refund_scope,'full');
 const preview=await admin('/api/admin/designer-settlement-ledger/post-verified-test-refund',{
  method:'POST',body:JSON.stringify({orderId,scope:'full',apply:false})});
 assert.equal(preview.testMode,true);
 assert.equal(preview.applied,false);
 assert.equal(preview.refundId,refundId);
 assert.equal(preview.events.length,designers.length);
 assert.deepEqual(new Set(preview.events.map(x=>x.designerId)),new Set(designers));
 // This endpoint posts only to the disposable local test ledger; no Stripe write.
 const apply=async()=>admin('/api/admin/designer-settlement-ledger/post-verified-test-refund',{
  method:'POST',body:JSON.stringify({orderId,scope:'full',apply:true})});
 await apply();await apply();
 const audit=await admin('/api/admin/designer-settlement-ledger/test-refund-audit?orderId='+
  encodeURIComponent(orderId)+'&scope=full');
 assert.ok(audit.entries.filter(x=>x.action==='apply'&&x.outcome==='posted').length>=2);
 for(const designerId of designers){
  const ledger=await admin('/api/admin/designer-settlement-ledger?orderId='+
   encodeURIComponent(orderId)+'&designerId='+encodeURIComponent(designerId)+'&testMode=true');
  assert.ok(ledger.entries.some(x=>x.entry_type==='sale'));
  assert.ok(ledger.entries.some(x=>x.entry_type==='commission'));
  assert.equal(ledger.entries.filter(x=>x.entry_type==='refund').length,1);
  assert.equal(ledger.summary.availableCents,0);
 }
});
