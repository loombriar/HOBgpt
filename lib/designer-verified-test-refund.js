'use strict';
const {allocateOrderRefund}=require('./designer-refund-allocation');
// Explicit admin-only sandbox posting, never from a webhook or a live refund.
async function postVerifiedTestRefund(db,ledger,stripeApi,{orderId,scope,apply=false},audit=null) {
 if(typeof orderId!=='string'||!orderId||typeof scope!=='string'||!scope||typeof apply!=='boolean')throw new TypeError('Invalid refund request');
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
 if(!order||order.status!=='paid'||!String(order.stripe_session_id||'').startsWith('cs_test_'))throw new Error('Paid test checkout required');
 const refund=db.prepare('SELECT * FROM order_refunds WHERE order_id=? AND scope=?').get(orderId,scope);
 if(!refund||refund.status!=='succeeded'||!refund.stripe_refund_id)throw new Error('Succeeded referenced refund required');
 const remote=await stripeApi('refunds/'+encodeURIComponent(refund.stripe_refund_id));
 const intent=typeof remote.payment_intent==='string'?remote.payment_intent:remote.payment_intent?.id;
 if(remote.id!==refund.stripe_refund_id||remote.livemode!==false||remote.status!=='succeeded'||
    intent!==order.stripe_payment_intent_id||remote.currency!==order.currency||
    remote.amount!==refund.amount_cents||remote.metadata?.order_id!==orderId||
    remote.metadata?.refund_scope!==scope)throw new Error('Stripe refund evidence mismatch');
 const allocation=allocateOrderRefund(db,{orderId,scope,amountCents:remote.amount});
 if(allocation.status!=='allocatable')throw new Error('Refund allocation requires review: '+allocation.reason);
 const overlapping=db.prepare('SELECT scope FROM order_refunds WHERE order_id=? AND scope<>?').all(orderId,scope);
 if(overlapping.length)throw new Error('Overlapping refund scopes require manual review');
 const events=allocation.allocations.map(a=>({
  eventId:'verified-test-refund:'+remote.id+':'+a.designerId,
  orderId,designerId:a.designerId,currency:remote.currency,
  type:'refund',amountCents:a.designerEarningsExposureCents,
  sourceReference:'stripe-refund:'+remote.id,testMode:true
 }));
 // Only import an earnings exposure against a previously journaled sale and commission.
 // Existing payouts or other refund records require manual reconciliation.
 return db.transaction(()=>{
  for(const event of events){
   const rows=ledger.entries(orderId,event.designerId,true);
   if(!rows.some(r=>r.entry_type==='sale')||!rows.some(r=>r.entry_type==='commission'))
    throw new Error('Base sale/commission journal missing');
   if(rows.some(r=>r.entry_type==='payout'||r.entry_type==='payout_reversal'))
    throw new Error('Payout activity requires manual refund review');
   if(rows.some(r=>r.entry_type==='refund'&&r.event_id!==event.eventId))
    throw new Error('Multiple refund events require manual review');
   const t=db.prepare('SELECT 1 FROM designer_transfers WHERE order_id=? AND designer_id=? AND (status=? OR payout_in_flight=1 OR stripe_reversal_id IS NOT NULL)').get(orderId,event.designerId,'paid');
   if(t)throw new Error('Transfer activity requires manual review');
   if(event.amountCents<=0)throw new Error('Zero seller earnings exposure requires manual review');
  }
  if(apply)for(const event of events)ledger.record(event);
  if(audit)audit.record({orderId,scope,refundId:remote.id,
   action:apply?'apply':'preview',outcome:apply?'posted':'verified',
   detail:apply?'verified_test_refund_journal_applied':'verified_test_refund_preview'});
  return {orderId,scope,refundId:remote.id,testMode:true,applied:apply,
   events:events.map(({eventId,designerId,amountCents})=>({eventId,designerId,amountCents})),
   commissionReversalRequiresReview:true};
 }).immediate();
}
module.exports={postVerifiedTestRefund};
