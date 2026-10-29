'use strict';
// Automatic signed-webhook replay against a disposable local test server.
// Requires pre-created test Checkout fixture. Never invokes live payments.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const enabled=process.env.RUN_HOB_SIGNED_WEBHOOK_E2E==='true';
test('automatically delivers signed paid Checkout webhook twice and checks settlement idempotence',
 {skip:enabled?false:'explicit opt-in only'},async()=>{
 const {HOB_E2E_BASE_URL:base,HOB_E2E_ADMIN_TOKEN:token,HOB_E2E_ORDER_ID:orderId,
 HOB_E2E_CHECKOUT_SESSION_ID:sessionId,HOB_E2E_PAYMENT_INTENT_ID:intentId,
 HOB_E2E_WEBHOOK_SECRET:secret,HOB_E2E_CURRENCY:currency,
 HOB_E2E_DESIGNER_IDS:ids,HOB_E2E_CHECKOUT_TOTAL_CENTS:total}=process.env;
 assert.ok(base&&token&&orderId&&sessionId&&intentId&&secret&&currency&&ids&&total,
  'Missing local-only webhook fixture configuration');
 const url=new URL(base);
 assert.equal(url.protocol,'http:');
 assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'Only loopback servers allowed');
 assert.match(sessionId,/^cs_test_/);
 assert.match(intentId,/^pi_/);
 assert.match(secret,/^whsec_/);
 assert.equal(process.env.NODE_ENV==='production',false,'Never run in production');
 const amount=Number(total);
 assert.ok(Number.isSafeInteger(amount)&&amount>0);
 const designers=ids.split(',').filter(Boolean);
 assert.ok(designers.length>=2);
 const payload=JSON.stringify({
  id:'evt_test_hob_'+crypto.randomBytes(12).toString('hex'),
  object:'event',type:'checkout.session.completed',livemode:false,
  data:{object:{id:sessionId,object:'checkout.session',livemode:false,
   payment_status:'paid',payment_intent:intentId,amount_total:amount,
   currency,metadata:{order_id:orderId}}}
 });
 const timestamp=Math.floor(Date.now()/1000);
 const digest=crypto.createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
 const signature='t='+timestamp+',v1='+digest;
 async function post(signatureHeader){
  return fetch(new URL('/api/stripe/webhook',url),{
   method:'POST',headers:{'content-type':'application/json','stripe-signature':signatureHeader},
   body:payload,signal:AbortSignal.timeout(15000)});
 }
 const invalid=await post('t='+timestamp+',v1='+('0'.repeat(64)));
 assert.equal(invalid.status,400,'Invalid signature must be rejected');
 for(let i=0;i<2;i++){
  const response=await post(signature);
  assert.equal(response.status,200,'Signed webhook delivery failed: '+await response.text());
 }
 for(const designerId of designers){
  const endpoint='/api/admin/designer-settlement-ledger?orderId='+encodeURIComponent(orderId)+
   '&designerId='+encodeURIComponent(designerId)+'&testMode=true';
  const response=await fetch(new URL(endpoint,url),{
   headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.ok(result.entries.some(x=>x.entry_type==='sale'));
  assert.ok(result.entries.some(x=>x.entry_type==='commission'));
  assert.equal(result.entries.filter(x=>x.entry_type==='sale').length,1);
  assert.equal(result.entries.filter(x=>x.entry_type==='commission').length,1);
 }
});
