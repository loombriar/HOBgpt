'use strict';
// Exact per-designer allocation of already-recorded refunds; never prorate fees
// or infer a seller debt from platform-paid shipping, tax or promotions.
function allocateOrderRefund(db,{orderId,scope,amountCents}) {
 if(typeof orderId!=='string'||!orderId||typeof scope!=='string'||!scope||!Number.isSafeInteger(amountCents)||amountCents<=0)
  throw new TypeError('Invalid refund allocation');
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
 if(!order)throw new Error('Order not found');
 const rows=db.prepare('SELECT designer_id,SUM(line_total_cents) gross,SUM(platform_fee_cents) commission,SUM(designer_amount_cents) earnings FROM order_items WHERE order_id=? GROUP BY designer_id ORDER BY designer_id').all(orderId);
 if(!rows.length)throw new Error('Order has no designer allocations');
 const totalGross=rows.reduce((sum,r)=>sum+r.gross,0);
 const totalCommission=rows.reduce((sum,r)=>sum+r.commission,0);
 const totalEarnings=rows.reduce((sum,r)=>sum+r.earnings,0);
 if(rows.some(r=>![r.gross,r.commission,r.earnings].every(x=>Number.isSafeInteger(x)&&x>=0)||r.gross!==r.commission+r.earnings))
  throw new Error('Designer allocation requires review');
 if(scope==='full'){
  // Full refund can include shipping or other charges; do not allocate the difference.
  if(amountCents!==totalGross||order.subtotal_cents!==totalGross)
   return {status:'review_required',reason:'full_refund_not_equal_item_gross',orderId,scope,amountCents,totalGrossCents:totalGross,allocations:[]};
  return {status:'allocatable',orderId,scope,amountCents,allocations:rows.map(r=>({
   designerId:r.designer_id,customerRefundCents:r.gross,designerEarningsExposureCents:r.earnings,commissionReversalReviewCents:r.commission
  }))};
 }
 const selected=rows.find(r=>r.designer_id===scope);
 if(!selected)throw new Error('Refund scope is not a designer in this order');
 if(amountCents!==selected.gross)return {status:'review_required',reason:'seller_refund_amount_mismatch',orderId,scope,amountCents,allocations:[]};
 return {status:'allocatable',orderId,scope,amountCents,allocations:[{
  designerId:scope,customerRefundCents:selected.gross,designerEarningsExposureCents:selected.earnings,commissionReversalReviewCents:selected.commission
 }]};
}
module.exports={allocateOrderRefund};
