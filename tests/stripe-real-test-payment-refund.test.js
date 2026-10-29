'use strict';
// Explicit opt-in REAL Stripe TEST API writes. Not an app Checkout E2E.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('Stripe sandbox: create, confirm and refund a real test PaymentIntent',
 {skip:process.env.RUN_HOB_STRIPE_MUTATION_TESTS==='true'?false:'sandbox mutation opt-in only'},async()=>{
 const key=process.env.STRIPE_TEST_SECRET_KEY;
 assert.ok(key&&/^sk_test_/.test(key),'Stripe sk_test_ key required');
 assert.equal(process.env.NODE_ENV==='production',false);
 assert.equal(process.env.HOB_STRIPE_TEST_WRITES_ACK,'I_AUTHORIZE_TEST_PAYMENTS_AND_REFUNDS',
  'Explicit authorization required for Stripe sandbox writes');
 const amount=Number(process.env.HOB_STRIPE_TEST_AMOUNT_CENTS||200);
 assert.ok(Number.isSafeInteger(amount)&&amount>=100&&amount<=1000,'Test amount must be $1–$10');
 const runId=crypto.randomUUID();
 async function api(endpoint,params,idempotencyKey){
  const headers={Authorization:'Bearer '+key};
  if(params)headers['Content-Type']='application/x-www-form-urlencoded';
  if(idempotencyKey)headers['Idempotency-Key']='hob-sandbox-'+runId+'-'+idempotencyKey;
  const response=await fetch('https://api.stripe.com/v1/'+endpoint,{
   method:params?'POST':'GET',headers,
   body:params?new URLSearchParams(params):undefined,
   signal:AbortSignal.timeout(20000)});
  const value=await response.json();
  assert.equal(response.ok,true,'Stripe test API error '+response.status+': '+(value.error?.message||'unknown'));
  assert.equal(value.livemode,false);
  return value;
 }
 const payment=await api('payment_intents',{
  amount:String(amount),currency:'usd',
  'payment_method_types[0]':'card',
  payment_method:'pm_card_visa',confirm:'true',
  'metadata[hob_test_run]':runId
 },'payment');
 assert.equal(payment.status,'succeeded');
 assert.equal(payment.amount,amount);
 assert.equal(payment.currency,'usd');
 const refund=await api('refunds',{
  payment_intent:payment.id,amount:String(amount),
  'metadata[hob_test_run]':runId,
  'metadata[refund_scope]':'full'
 },'refund');
 assert.equal(refund.payment_intent,payment.id);
 assert.equal(refund.amount,amount);
 assert.equal(refund.status,'succeeded');
 const replay=await api('refunds',{
  payment_intent:payment.id,amount:String(amount),
  'metadata[hob_test_run]':runId,
  'metadata[refund_scope]':'full'
 },'refund');
 assert.equal(replay.id,refund.id,'Stripe idempotency key must prevent duplicate refund');
 const retrieved=await api('refunds/'+encodeURIComponent(refund.id));
 assert.equal(retrieved.status,'succeeded');
 assert.equal(retrieved.amount,amount);
 assert.equal(retrieved.metadata.hob_test_run,runId);
});
