const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');const {createPostageAccounting}=require('../lib/postage-accounting');
async function fixture({testMode=false,transferError=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-postage-money-')),calls=[];
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:100}],designerTokens:{'seller-token':'maker'},adminToken:'postage-admin',stripeApi:async(endpoint,options={})=>{
  const body=new URLSearchParams(options.body);calls.push({endpoint,body:Object.fromEntries(body),key:options.idempotencyKey});
  if(endpoint==='transfers'){if(transferError)throw new Error('Connection interrupted');return{id:'tr_postage',amount:Number(body.get('amount')),destination:body.get('destination'),currency:'usd'};}
  if(endpoint.includes('/reversals'))return{id:'trr_postage',amount:Number(body.get('amount'))};
  if(endpoint==='refunds')return{id:'re_postage',status:'succeeded',amount:Number(body.get('amount')),payment_intent:body.get('payment_intent'),currency:'usd'};
  throw new Error('Unexpected API '+endpoint);
 }});
 const db=ctx.db,now=new Date().toISOString();
 db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_postage',status='active' WHERE id='maker'").run();
 db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker',SELLER_TERMS_VERSION,now,'test');
 db.prepare("INSERT INTO orders (id,stripe_session_id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,stripe_payment_intent_id,created_at,paid_at) VALUES ('order',?,'paid','stripe','usd',10000,900,9100,'pi_postage',?,?)").run(testMode?'cs_test_money':'cs_live_money',now,now);
 db.exec("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('item','order','piece','maker','Piece',10000,1,10000,900,9100)");
 db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_number,tracking_carrier,tracking_status,tracking_verified_at) VALUES ('transfer','order','maker','acct_postage',9100,'pending',?,'1Z999AA10123456784','ups','in_transit',?)").run(now,now);
 const accounting=createPostageAccounting(db),server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 return {db,accounting,calls,charge(cost=610,mode=testMode,id='tx'){accounting.charge({transactionId:id,orderId:'order',designerId:'maker',costCents:cost,testMode:mode});},async request(route,method='POST',token='postage-admin'){const r=await fetch(origin+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});return {status:r.status,body:await r.json()};},release(){return this.request('/api/admin/orders/order/designers/maker/release');},async close(){await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('exact net cents reach Stripe once and a buyer refund reverses only the actual transfer',async()=>{
 const f=await fixture();try{f.charge();f.charge();f.charge(777,true,'sample-only');assert.equal(f.accounting.summary('order','maker').netEarningsCents,8490);
 assert.equal((await f.release()).body.results[0].status,'paid');assert.equal(f.calls[0].body.amount,'8490');await f.release();assert.equal(f.calls.filter(c=>c.endpoint==='transfers').length,1);
 assert.equal((await f.request('/api/admin/orders/order/refund')).status,200);assert.equal(f.calls.find(c=>c.endpoint.includes('/reversals')).body.amount,'8490');assert.equal(f.calls.find(c=>c.endpoint==='refunds').body.amount,'10000');
 const s=f.accounting.summary('order','maker');assert.equal(s.netEarningsCents,0);assert.equal(s.unrecoveredPostageCents,610);assert.equal(s.postPayoutCreditCents,0);assert.equal((await f.request('/api/admin/operations','GET')).body.postageReviews[0].unrecoveredPostageCents,610);
 }finally{await f.close();}
});
test('pending postage cancellation holds payout; only confirmed credit restores earnings once',async()=>{
 const f=await fixture();try{f.charge();f.accounting.refundState('tx','refund_pending');assert.equal(f.accounting.summary('order','maker').netEarningsCents,8490);assert.equal((await f.release()).body.results[0].reason,'postage_review_required');assert.equal(f.calls.length,0);
 f.accounting.refundState('tx','refunded');f.accounting.refundState('tx','refunded');f.accounting.refundState('tx','charged');assert.equal(f.accounting.summary('order','maker').netEarningsCents,9100);await f.release();assert.equal(f.calls[0].body.amount,'9100');
 }finally{await f.close();}
});
test('zero or insufficient earnings cannot create zero or negative transfers',async()=>{
 for(const cost of [9100,10000]){const f=await fixture();try{f.charge(cost);assert.equal((await f.release()).body.results[0].reason,cost===9100?'no_transfer_due':'postage_exceeds_earnings');assert.equal(f.calls.length,0);assert.equal(f.db.prepare("SELECT payout_in_flight FROM designer_transfers WHERE id='transfer'").get().payout_in_flight,0);}finally{await f.close();}}
});
test('test/live postage and other sellers remain isolated in the designer breakdown',async()=>{
 for(const testMode of [false,true]){const f=await fixture({testMode});try{f.charge(610,testMode);f.charge(999,!testMode,'other-mode');f.accounting.charge({transactionId:'other-seller',orderId:'order',designerId:'someone-else',costCents:1200,testMode});const r=await f.request('/api/my/orders','GET','seller-token');assert.equal(r.body.orders[0].earnings.netEarningsCents,8490);assert.equal(r.body.orders[0].earnings.testMode,testMode);}finally{await f.close();}}
});
test('uncertain transfers keep their original amount; later credits require review, not a new payout',async()=>{
 const f=await fixture({transferError:true});try{f.charge();await f.release();assert.equal(f.calls[0].body.amount,'8490');assert.throws(()=>f.charge(500,false,'late'),/already fixed/);f.accounting.refundState('tx','refunded');const s=f.accounting.summary('order','maker');assert.equal(s.netEarningsCents,9100);assert.equal(s.payoutAmountCents,8490);assert.equal(s.postPayoutCreditCents,610);await f.release();assert.equal(f.calls.filter(c=>c.endpoint==='transfers').length,1);assert.equal(new URLSearchParams(f.db.prepare("SELECT request_body FROM stripe_operations WHERE kind='payout'").get().request_body).get('amount'),'8490');}finally{await f.close();}
});
test('another seller refund does not hold this seller; unresolved label creation does',async()=>{
 const f=await fixture({testMode:true});try{f.db.exec("INSERT INTO order_refunds (order_id,scope,amount_cents,status,created_at,updated_at) VALUES ('order','other',100,'succeeded',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); UPDATE orders SET refund_status='partial'");assert.equal(f.accounting.summary('order','maker').customerRefundHold,false);f.db.prepare("INSERT INTO shipping_labels (order_id,designer_id,quote_id,rate_id,cost_cents,status,created_at) VALUES ('order','maker','q','rate',610,'processing',?)").run(Date.now());assert.equal((await f.release()).body.results[0].reason,'postage_review_required');assert.equal(f.calls.length,0);}finally{await f.close();}
});

test('carrier adjustment creates a payout hold',async()=>{const f=await fixture();try{f.charge();const a={adjustmentId:'invoice-1',transactionId:'tx',deltaCents:125,testMode:false,source:'carrier_invoice'};f.accounting.recordAdjustment(a);f.accounting.recordAdjustment(a);assert.equal(f.accounting.summary('order','maker').carrierAdjustmentReviewCount,1);assert.equal((await f.release()).body.results[0].reason,'postage_review_required');assert.equal(f.calls.length,0);}finally{await f.close();}});

test('carrier invoice evidence is idempotent, isolated, and cannot silently alter payout cents',async()=>{
 const f=await fixture();try{
  f.charge();
  const before=f.accounting.summary('order','maker');
  const evidence={adjustmentId:'invoice-unique',transactionId:'tx',deltaCents:125,testMode:false,source:'carrier_invoice'};
  f.accounting.recordAdjustment(evidence);
  f.accounting.recordAdjustment(evidence);
  const after=f.accounting.summary('order','maker');
  assert.equal(after.carrierAdjustmentReviewCount,1);
  assert.equal(after.carrierAdjustmentReviewCents,125);
  assert.equal(after.netEarningsCents,before.netEarningsCents);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM postage_adjustments').get().n,1);
  assert.throws(()=>f.accounting.recordAdjustment({...evidence,deltaCents:250}),/conflicts/);
  assert.throws(()=>f.accounting.recordAdjustment({...evidence,adjustmentId:'wrong-mode',testMode:true}),/environment/);
  assert.throws(()=>f.accounting.recordAdjustment({...evidence,adjustmentId:'unknown',transactionId:'not-a-charge'}),/confirmed postage charge/);
  assert.equal((await f.release()).body.results[0].reason,'postage_review_required');
  assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('a carrier adjustment after payout is review-only and cannot cause a second transfer',async()=>{
 const f=await fixture();try{
  f.charge();
  assert.equal((await f.release()).body.results[0].status,'paid');
  f.accounting.recordAdjustment({adjustmentId:'late-invoice',transactionId:'tx',deltaCents:-75,testMode:false,source:'carrier_invoice'});
  const summary=f.accounting.summary('order','maker');
  assert.equal(summary.carrierAdjustmentReviewCount,1);
  assert.equal(summary.carrierAdjustmentReviewCents,-75);
  assert.equal(summary.payoutAmountCents,8490);
  await f.release();
  assert.equal(f.calls.filter(c=>c.endpoint==='transfers').length,1);
  assert.equal(f.db.prepare("SELECT status FROM postage_adjustments WHERE adjustment_id='late-invoice'").get().status,'review_required');
 }finally{await f.close();}
});

test('admin postage queue includes uncertain labels before a charge exists, with mode isolation and no duplicates',async()=>{
 for(const testMode of [false,true]){
  const f=await fixture({testMode});try{
   const insert=f.db.prepare("INSERT INTO shipping_labels (order_id,designer_id,quote_id,rate_id,cost_cents,status,test_mode,created_at) VALUES ('order','maker','quote','rate',610,?,?,?)");
   for(const status of ['processing','review_required']){
    insert.run(status,Number(testMode),Date.now());
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM postage_charges').get().n,0);
    const response=await f.request('/api/admin/operations','GET');
    assert.equal(response.status,200);
    assert.equal(response.body.postageReviews.length,1);
    const row=response.body.postageReviews[0];
    assert.equal(row.orderId,'order');assert.equal(row.designerId,'maker');
    assert.equal(row.postageHold,true);assert.equal(row.testMode,testMode);
    assert.equal(row.postageChargedCents,0);
    assert.equal((await f.release()).body.results[0].reason,'postage_review_required');
    f.db.exec('DELETE FROM shipping_labels');
   }
   insert.run('review_required',Number(!testMode),Date.now());
   assert.deepEqual((await f.request('/api/admin/operations','GET')).body.postageReviews,[]);
   f.db.exec('DELETE FROM shipping_labels');
   insert.run('review_required',Number(testMode),Date.now());
   f.charge();
   assert.equal((await f.request('/api/admin/operations','GET')).body.postageReviews.length,1);
   f.db.exec("UPDATE shipping_labels SET status='ready'");
   assert.deepEqual((await f.request('/api/admin/operations','GET')).body.postageReviews,[]);
   assert.equal(f.calls.length,0);
  }finally{await f.close();}
 }
});
