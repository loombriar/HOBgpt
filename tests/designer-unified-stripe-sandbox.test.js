'use strict';
// Unified disposable-db test with real Stripe test PaymentIntent/refund and
// synthetic signed Checkout event. This is NOT real hosted Checkout completion.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('real Stripe test payment/refund + signed local webhook + two-designer ledger',
 {skip:process.env.RUN_HOB_UNIFIED_SANDBOX_E2E==='true'?false:'explicit opt-in only'},async()=>{
 const key=process.env.STRIPE_TEST_SECRET_KEY;
 assert.match(key||'',/^sk_test_/);
 assert.equal(process.env.HOB_STRIPE_TEST_WRITES_ACK,'I_AUTHORIZE_TEST_PAYMENTS_AND_REFUNDS');
 assert.notEqual(process.env.NODE_ENV,'production');
 const previous={webhook:process.env.STRIPE_WEBHOOK_SECRET,journal:process.env.ENABLE_TEST_SETTLEMENT_JOURNAL};
 const secret='whsec_'+crypto.randomBytes(24).toString('hex');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hob-unified-stripe-'));
 const orderId='sandbox_'+crypto.randomUUID(),sessionId='cs_test_'+crypto.randomBytes(12).toString('hex');
 const amount=200,fee=15,runId=crypto.randomUUID();
 async function stripe(endpoint,params,idempotency){
  const response=await fetch('https://api.stripe.com/v1/'+endpoint,{
   method:params?'POST':'GET',
   headers:{Authorization:'Bearer '+key,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
    ...(idempotency?{'Idempotency-Key':'hob-unified-'+runId+'-'+idempotency}:{})},
   body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  assert.equal(response.ok,true,'Stripe test API failed: '+(data.error?.message||response.status));
  assert.equal(data.livemode,false);
  return data;
 }
 process.env.STRIPE_WEBHOOK_SECRET=secret;
 process.env.ENABLE_TEST_SETTLEMENT_JOURNAL='true';
 let server,db;
 try{
  const payment=await stripe('payment_intents',{
   amount:String(amount),currency:'usd','payment_method_types[0]':'card',
   payment_method:'pm_card_visa',confirm:'true','metadata[hob_test_run]':runId},'payment');
  assert.equal(payment.status,'succeeded');
  const {createApp}=require('../server');
  const built=createApp({dataDir:temp,adminToken:'sandbox-admin-'+runId,
   sendEmail:async()=>true,stripeApi:async endpoint=>{
    if(endpoint==='refunds/'+encodeURIComponent(''))throw new Error('Unexpected refund');
    return stripe(endpoint);
   }});
  db=built.db;
  const now=new Date().toISOString();
  db.prepare('INSERT INTO orders(id,stripe_session_id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,stripe_payment_intent_id) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(orderId,sessionId,'pending','usd',amount,fee*2,amount-fee*2,now,payment.id);
  const insert=db.prepare('INSERT INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES(?,?,?,?,?,?,?,?,?,?)');
  insert.run('a-'+runId,orderId,'sandbox-list-a','sandbox-a','Sandbox A',100,1,100,fee,100-fee);
  insert.run('b-'+runId,orderId,'sandbox-list-b','sandbox-b','Sandbox B',100,1,100,fee,100-fee);
  server=await new Promise(resolve=>{const s=built.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const payload=JSON.stringify({id:'evt_test_'+runId,type:'checkout.session.completed',livemode:false,
   data:{object:{id:sessionId,livemode:false,payment_status:'paid',payment_intent:payment.id,
    amount_total:amount,currency:'usd',metadata:{order_id:orderId}}}});
  const timestamp=Math.floor(Date.now()/1000);
  const signature='t='+timestamp+',v1='+crypto.createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
  for(let i=0;i<2;i++){
   const response=await fetch(base+'/api/stripe/webhook',{method:'POST',
    headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload});
   assert.equal(response.status,200,'Checkout webhook rejected: '+await response.text());
  }
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status,'paid');
  const {createDesignerSettlementLedger}=require('../lib/designer-settlement-ledger');
  const {createTestRefundAudit}=require('../lib/designer-test-refund-audit');
  const {postVerifiedTestRefund}=require('../lib/designer-verified-test-refund');
  const ledger=createDesignerSettlementLedger(db),audit=createTestRefundAudit(db);
  for(const designer of ['sandbox-a','sandbox-b']){
   const entries=ledger.entries(orderId,designer,true);
   assert.equal(entries.filter(x=>x.entry_type==='sale').length,1);
   assert.equal(entries.filter(x=>x.entry_type==='commission').length,1);
  }
  const refund=await stripe('refunds',{payment_intent:payment.id,amount:String(amount),
   'metadata[order_id]':orderId,'metadata[refund_scope]':'full',
   'metadata[hob_test_run]':runId},'refund');
  assert.equal(refund.status,'succeeded');
  db.prepare('INSERT INTO order_refunds(order_id,scope,amount_cents,status,stripe_refund_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
   .run(orderId,'full',amount,'succeeded',refund.id,now,now);
  const args={orderId,scope:'full',apply:true};
  await postVerifiedTestRefund(db,ledger,async endpoint=>stripe(endpoint),args,audit);
  await postVerifiedTestRefund(db,ledger,async endpoint=>stripe(endpoint),args,audit);
  for(const designer of ['sandbox-a','sandbox-b']){
   assert.equal(ledger.entries(orderId,designer,true).filter(x=>x.entry_type==='refund').length,1);
   assert.equal(ledger.summary(orderId,designer,true).availableCents,0);
  }
  assert.equal(audit.list(orderId,'full').filter(x=>x.action==='apply').length,2);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(db)db.close();
  fs.rmSync(temp,{recursive:true,force:true});
  if(previous.webhook===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous.webhook;
  if(previous.journal===undefined)delete process.env.ENABLE_TEST_SETTLEMENT_JOURNAL;else process.env.ENABLE_TEST_SETTLEMENT_JOURNAL=previous.journal;
 }
});
