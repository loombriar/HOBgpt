'use strict';
// Explicit test-only import of confirmed postage and paid transfers; refunds and reversals
// are deliberately review-only until their provider references and allocations are verified.
function reconcileTestAdjustments(db,ledger,{orderId,designerId,apply=false}) {
 if(typeof orderId!=='string'||!orderId||typeof designerId!=='string'||!designerId||typeof apply!=='boolean')throw new TypeError('Invalid scope');
 return db.transaction(()=>{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if(!order||order.status!=='paid'||!String(order.stripe_session_id||'').startsWith('cs_test_'))
   throw new Error('Only paid Stripe test orders can be reconciled');
  const items=db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND designer_id=?').get(orderId,designerId);
  if(!items)throw new Error('Designer is not part of this order');
  const issues=[],candidates=[],currency=String(order.currency||'').toLowerCase();
  const charges=db.prepare('SELECT * FROM postage_charges WHERE order_id=? AND designer_id=?').all(orderId,designerId);
  for(const c of charges){
   if(c.test_mode!==1||c.status!=='charged'||!Number.isSafeInteger(c.cost_cents)||c.cost_cents<=0||!c.transaction_id){
    issues.push('postage_requires_review:'+c.transaction_id);continue;
   }
   const adjustments=db.prepare('SELECT 1 FROM postage_adjustments WHERE transaction_id=? LIMIT 1').get(c.transaction_id);
   if(adjustments){issues.push('postage_adjustment_requires_review:'+c.transaction_id);continue;}
   candidates.push({eventId:'test-postage:'+c.transaction_id,orderId,designerId,currency,type:'shipping',amountCents:c.cost_cents,sourceReference:'postage:'+c.transaction_id,testMode:true});
  }
  const refunds=db.prepare('SELECT * FROM order_refunds WHERE order_id=?').all(orderId);
  if(refunds.length||order.refund_status&&order.refund_status!=='none')issues.push('refund_allocation_requires_review');
  const transfer=db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(orderId,designerId);
  if(transfer?.stripe_reversal_id)issues.push('payout_reversal_requires_review');
  if(transfer?.status==='paid'){
   if(!transfer.stripe_transfer_id||!Number.isSafeInteger(transfer.amount_cents)||transfer.amount_cents<=0)
    issues.push('paid_transfer_reference_requires_review');
   else candidates.push({eventId:'test-transfer:'+transfer.stripe_transfer_id,orderId,designerId,currency,type:'payout',amountCents:transfer.amount_cents,sourceReference:'stripe-transfer:'+transfer.stripe_transfer_id,testMode:true});
  }else if(transfer?.payout_in_flight)issues.push('payout_in_flight_requires_review');
  if(apply){
   // Never post partial adjustments when refund/reversal/charge ambiguity is present.
   if(issues.length)throw new Error('Unresolved adjustment review: '+issues.join(','));
   for(const event of candidates)ledger.record(event);
  }
  return {orderId,designerId,testMode:true,applied:apply,candidates,issues,reviewRequired:issues.length>0};
 }).immediate();
}
module.exports={reconcileTestAdjustments};
