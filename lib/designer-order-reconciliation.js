'use strict';
// Compare existing paid-order allocations with the new journal without changing payout behavior.
function reconcileDesignerOrder(db,ledger,{orderId,designerId,testMode}) {
  if(typeof orderId!=='string'||!orderId||typeof designerId!=='string'||!designerId||typeof testMode!=='boolean')
    throw new TypeError('Invalid reconciliation scope');
  const order=db.prepare('SELECT id,status,currency,stripe_session_id,refund_status FROM orders WHERE id=?').get(orderId);
  if(!order) return {status:'order_missing',orderId,designerId,reviewRequired:true};
  const mode=String(order.stripe_session_id||'').startsWith('cs_test_')?true:
    String(order.stripe_session_id||'').startsWith('cs_live_')?false:null;
  if(mode===null||mode!==testMode) return {status:'environment_unverified',orderId,designerId,reviewRequired:true};
  if(order.status!=='paid') return {status:'order_not_paid',orderId,designerId,reviewRequired:true};
  const allocation=db.prepare('SELECT COALESCE(SUM(line_total_cents),0) gross, COALESCE(SUM(platform_fee_cents),0) commission, COALESCE(SUM(designer_amount_cents),0) net, COUNT(*) item_count FROM order_items WHERE order_id=? AND designer_id=?').get(orderId,designerId);
  if(!allocation.item_count)return {status:'designer_not_in_order',orderId,designerId,reviewRequired:true};
  const journal=ledger.entries(orderId,designerId,testMode);
  const sums={};for(const row of journal)sums[row.entry_type]=(sums[row.entry_type]||0)+row.amount_cents;
  const transfers=db.prepare('SELECT status,amount_cents,stripe_transfer_id FROM designer_transfers WHERE order_id=? AND designer_id=?').all(orderId,designerId);
  const paid=transfers.filter(t=>t.status==='paid');
  const actualPaidCents=paid.reduce((sum,t)=>sum+t.amount_cents,0);
  const issues=[];
  if(allocation.gross-allocation.commission!==allocation.net)issues.push('order_allocation_mismatch');
  if((sums.sale||0)!==allocation.gross)issues.push('journal_sale_mismatch');
  if((sums.commission||0)!==allocation.commission)issues.push('journal_commission_mismatch');
  if((sums.payout||0)-(sums.payout_reversal||0)!==actualPaidCents)issues.push('journal_payout_mismatch');
  if(order.refund_status&&order.refund_status!=='none')issues.push('refund_requires_provider_reconciliation');
  if(journal.some(e=>e.currency!==order.currency))issues.push('currency_mismatch');
  const balance=ledger.summary(orderId,designerId,testMode);
  if(balance.reviewRequired)issues.push('negative_journal_balance');
  return {status:issues.length?'review_required':'reconciled',orderId,designerId,testMode,
    currency:order.currency,allocation:{grossCents:allocation.gross,commissionCents:allocation.commission,designerNetCents:allocation.net},
    actualPaidCents,journal:balance,issues,reviewRequired:issues.length>0};
}
module.exports={reconcileDesignerOrder};
