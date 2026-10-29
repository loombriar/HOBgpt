'use strict';
// Opt-in Stripe TEST API integration suite. Reads an EXISTING succeeded sandbox refund.
// No Stripe mutations, real charges, webhooks or production credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
const {createTestRefundAudit}=require('../lib/designer-test-refund-audit');
const {postVerifiedTestRefund}=require('../lib/designer-verified-test-refund');

const enabled=process.env.RUN_STRIPE_REFUND_SANDBOX_TESTS==='true';
const secret=process.env.STRIPE_TEST_SECRET_KEY;
const refundId=process.env.STRIPE_TEST_REFUND_ID;
const checkoutId=process.env.STRIPE_TEST_CHECKOUT_SESSION_ID;
const amount=Number(process.env.STRIPE_TEST_REFUND_AMOUNT_CENTS);
const scope=process.env.STRIPE_TEST_REFUND_SCOPE||'full';
const orderId=process.env.STRIPE_TEST_ORDER_ID;
const currency=process.env.STRIPE_TEST_CURRENCY;
const configured=secret&&refundId&&checkoutId&&orderId&&currency&&Number.isSafeInteger(amount)&&amount>0;
const sandbox=test;

sandbox('real Stripe sandbox refund: verified multi-designer posting, replay, audit and failure rejection',
 {skip:!enabled?'opt-in only':!configured?'missing required Stripe sandbox fixtures':false},async()=>{
 assert.match(secret,/^sk_test_/,'Only Stripe test keys are permitted');
 assert.match(refundId,/^re_/);
 assert.match(checkoutId,/^cs_test_/);
 assert.match(currency,/^[a-z]{3}$/);
 assert.equal(scope,'full','This fixture tests exact full-item-gross refunds only');
 const stripeApi=async(path)=>{
  assert.equal(path,'refunds/'+encodeURIComponent(refundId));
  const response=await fetch('https://api.stripe.com/v1/'+path,{
   headers:{Authorization:'Bearer '+secret,'Stripe-Version':'2024-06-20'},
   signal:AbortSignal.timeout(15000)
  });
  const payload=await response.json();
  if(!response.ok)throw new Error('Stripe sandbox retrieval failed: '+response.status);
  return payload;
 };
 const remote=await stripeApi('refunds/'+encodeURIComponent(refundId));
 assert.equal(remote.livemode,false);
 assert.equal(remote.status,'succeeded');
 assert.equal(remote.amount,amount);
 assert.equal(remote.currency,currency);
 assert.equal(remote.metadata?.order_id,orderId);
 assert.equal(remote.metadata?.refund_scope,scope);
 const paymentIntent=typeof remote.payment_intent==='string'?remote.payment_intent:remote.payment_intent?.id;
 assert.ok(paymentIntent);
 // The fixture is deliberately a local mirror of an existing provider refund.
 // Two designers split the item gross; platform fees are explicit.
 const a=Math.floor(amount*0.6),b=amount-a;
 const feeA=Math.floor(a*0.15),feeB=Math.floor(b*0.15);
 assert.ok(a>feeA&&b>feeB);
 const db=new Database(':memory:');
 try{
  db.exec(`CREATE TABLE orders(id TEXT,status TEXT,stripe_session_id TEXT,stripe_payment_intent_id TEXT,currency TEXT,subtotal_cents INTEGER);
   CREATE TABLE order_items(order_id TEXT,designer_id TEXT,line_total_cents INTEGER,platform_fee_cents INTEGER,designer_amount_cents INTEGER);
   CREATE TABLE order_refunds(order_id TEXT,scope TEXT,status TEXT,stripe_refund_id TEXT,amount_cents INTEGER);
   CREATE TABLE designer_transfers(order_id TEXT,designer_id TEXT,status TEXT,payout_in_flight INTEGER,stripe_reversal_id TEXT);`);
  db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?)').run(orderId,'paid',checkoutId,paymentIntent,currency,amount);
  const insertItem=db.prepare('INSERT INTO order_items VALUES(?,?,?,?,?)');
  insertItem.run(orderId,'sandbox_designer_a',a,feeA,a-feeA);
  insertItem.run(orderId,'sandbox_designer_b',b,feeB,b-feeB);
  db.prepare('INSERT INTO order_refunds VALUES(?,?,?,?,?)').run(orderId,scope,'succeeded',refundId,amount);
  const ledger=createDesignerSettlementLedger(db),audit=createTestRefundAudit(db);
  for(const [designer,gross,fee] of [['sandbox_designer_a',a,feeA],['sandbox_designer_b',b,feeB]]){
   ledger.record({eventId:'sandbox-sale:'+designer,orderId,designerId:designer,currency,
    type:'sale',amountCents:gross,sourceReference:'sandbox-fixture',testMode:true});
   ledger.record({eventId:'sandbox-commission:'+designer,orderId,designerId:designer,currency,
    type:'commission',amountCents:fee,sourceReference:'sandbox-fixture',testMode:true});
  }
  const args={orderId,scope,apply:true};
  await postVerifiedTestRefund(db,ledger,stripeApi,args,audit);
  await postVerifiedTestRefund(db,ledger,stripeApi,args,audit);
  for(const designer of ['sandbox_designer_a','sandbox_designer_b']){
   assert.equal(ledger.summary(orderId,designer,true).availableCents,0);
   assert.equal(ledger.entries(orderId,designer,true).filter(x=>x.entry_type==='refund').length,1);
  }
  assert.equal(audit.list(orderId,scope).filter(x=>x.action==='apply').length,2);
  await assert.rejects(postVerifiedTestRefund(db,ledger,async path=>({...await stripeApi(path),status:'failed'}),args,audit),/mismatch/);
  assert.equal(audit.list(orderId,scope).length,2);
 }finally{db.close();}
});
