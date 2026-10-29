'use strict';
// Provider evidence review, deliberately read-only. Never infer designer liability
// from a full-order refund or a transfer reversal without explicit allocation.
async function reviewProviderAdjustments(db,stripeApi,{orderId,designerId}) {
 if(typeof orderId!=='string'||!orderId||typeof designerId!=='string'||!designerId)throw new TypeError('Invalid review scope');
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
 if(!order||!String(order.stripe_session_id||'').startsWith('cs_test_'))throw new Error('Verified test checkout order required');
 if(!db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND designer_id=?').get(orderId,designerId))throw new Error('Designer allocation not found');
 const issues=[],evidence=[];
 const refunds=db.prepare('SELECT * FROM order_refunds WHERE order_id=?').all(orderId);
 for(const row of refunds){
  if(!row.stripe_refund_id){issues.push('refund_missing_provider_reference:'+row.scope);continue;}
  const remote=await stripeApi('refunds/'+encodeURIComponent(row.stripe_refund_id));
  const intent=typeof remote.payment_intent==='string'?remote.payment_intent:remote.payment_intent?.id;
  const matches=remote.id===row.stripe_refund_id&&remote.livemode===false&&
   intent===order.stripe_payment_intent_id&&remote.currency===order.currency&&
   remote.amount===row.amount_cents&&remote.metadata?.order_id===orderId&&
   remote.metadata?.refund_scope===row.scope;
  if(!matches){issues.push('refund_provider_mismatch:'+row.scope);continue;}
  evidence.push({kind:'refund',scope:row.scope,providerId:remote.id,status:remote.status,amountCents:remote.amount});
  if(remote.status==='succeeded')issues.push('refund_allocation_requires_review:'+row.scope);
  else issues.push('refund_not_final:'+row.scope);
 }
 const transfer=db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(orderId,designerId);
 if(transfer?.stripe_reversal_id){
  if(!transfer.stripe_transfer_id){issues.push('reversal_missing_parent_transfer');}
  else{
   const remote=await stripeApi('transfers/'+encodeURIComponent(transfer.stripe_transfer_id)+'/reversals/'+encodeURIComponent(transfer.stripe_reversal_id));
   const matches=remote.id===transfer.stripe_reversal_id&&
    (remote.transfer===undefined||remote.transfer===transfer.stripe_transfer_id)&&Number.isSafeInteger(remote.amount)&&remote.amount>0;
   if(!matches)issues.push('reversal_provider_mismatch');
   else{
    evidence.push({kind:'transfer_reversal',providerId:remote.id,transferId:transfer.stripe_transfer_id,amountCents:remote.amount});
    issues.push('reversal_liability_requires_review');
   }
  }
 }
 if(order.refund_status&&!refunds.length)issues.push('legacy_refund_requires_review');
 return {orderId,designerId,testMode:true,evidence,issues,reviewRequired:issues.length>0,posted:false};
}
module.exports={reviewProviderAdjustments};
