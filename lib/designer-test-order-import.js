'use strict';
// Backfill paid TEST checkout allocations only. Does not initiate or authorize payouts.
function importPaidTestOrder(db,ledger,{orderId,designerId}) {
  if(typeof orderId!=='string'||!orderId||typeof designerId!=='string'||!designerId)throw new TypeError('Invalid import scope');
  return db.transaction(()=>{
    const order=db.prepare('SELECT id,status,currency,stripe_session_id,refund_status FROM orders WHERE id=?').get(orderId);
    if(!order||order.status!=='paid'||!String(order.stripe_session_id||'').startsWith('cs_test_'))
      throw new Error('Only verified paid test-mode orders may be imported');
    if(order.refund_status&&order.refund_status!=='none')throw new Error('Refunded orders require manual reconciliation');
    const items=db.prepare('SELECT id,line_total_cents,platform_fee_cents,designer_amount_cents FROM order_items WHERE order_id=? AND designer_id=? ORDER BY id').all(orderId,designerId);
    if(!items.length)throw new Error('Designer allocation not found');
    const currency=String(order.currency||'').toLowerCase();
    for(const item of items){
      if(![item.line_total_cents,item.platform_fee_cents,item.designer_amount_cents].every(x=>Number.isSafeInteger(x)&&x>=0)||
          item.line_total_cents!==item.platform_fee_cents+item.designer_amount_cents)
        throw new Error('Order allocation requires manual review');
      if(item.line_total_cents)ledger.record({eventId:'test-order-sale:'+item.id,orderId,designerId,currency,type:'sale',amountCents:item.line_total_cents,sourceReference:'order-item:'+item.id,testMode:true});
      if(item.platform_fee_cents)ledger.record({eventId:'test-order-commission:'+item.id,orderId,designerId,currency,type:'commission',amountCents:item.platform_fee_cents,sourceReference:'order-item:'+item.id,testMode:true});
    }
    return ledger.summary(orderId,designerId,true);
  }).immediate();
}
module.exports={importPaidTestOrder};
