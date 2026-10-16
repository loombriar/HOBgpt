const fail=message=>Object.assign(new Error(message),{statusCode:409,code:'postage_review_required'});
function createPostageAccounting(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS postage_charges (
    transaction_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, designer_id TEXT NOT NULL,
    cost_cents INTEGER NOT NULL CHECK(cost_cents>0), test_mode INTEGER NOT NULL CHECK(test_mode IN (0,1)),
    status TEXT NOT NULL CHECK(status IN ('charged','refund_pending','refunded','review_required')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS postage_order_designer ON postage_charges(order_id,designer_id);`);
  const table=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  // All pre-ledger labels were produced by the test-only pilot. Never import them as live costs.
  if(table('shipping_labels'))db.prepare(`INSERT OR IGNORE INTO postage_charges SELECT transaction_id,order_id,designer_id,cost_cents,1,'charged',datetime(created_at/1000,'unixepoch'),CURRENT_TIMESTAMP FROM shipping_labels WHERE status='ready' AND transaction_id IS NOT NULL AND cost_cents>0`).run();
  const transfer=(orderId,designerId)=>db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(orderId,designerId);
  const fixed=t=>Boolean(t&&(t.status==='paid'||t.payout_in_flight||table('stripe_operations')&&db.prepare("SELECT 1 FROM stripe_operations WHERE kind='payout' AND reference_id=?").get(t.id)));
  function charge({transactionId,orderId,designerId,costCents,testMode}) {
    if(typeof transactionId!=='string'||!transactionId||!Number.isSafeInteger(costCents)||costCents<=0||typeof testMode!=='boolean')throw fail('Invalid confirmed postage charge.');
    db.transaction(()=>{
      const existing=db.prepare('SELECT * FROM postage_charges WHERE transaction_id=?').get(transactionId);
      if(existing){if(existing.order_id!==orderId||existing.designer_id!==designerId||existing.cost_cents!==costCents||existing.test_mode!==Number(testMode))throw fail('Postage charge does not match its original record.');return;}
      if(fixed(transfer(orderId,designerId)))throw fail('Payout amount is already fixed. New postage requires House review.');
      const now=new Date().toISOString();db.prepare("INSERT INTO postage_charges VALUES (?,?,?,?,?,'charged',?,?)").run(transactionId,orderId,designerId,costCents,Number(testMode),now,now);
    }).immediate();
  }
  function refundState(transactionId,status) {
    if(!['refund_pending','refunded','charged','review_required'].includes(status))throw fail('Invalid postage refund state.');
    db.transaction(()=>{
      const row=db.prepare('SELECT * FROM postage_charges WHERE transaction_id=?').get(transactionId);
      if(!row)throw fail('Confirmed postage charge is missing.');
      if(row.status==='refunded')return; // terminal; delayed callbacks cannot re-deduct it
      if(fixed(transfer(row.order_id,row.designer_id))&&status!=='refunded')throw fail('Payout amount is already fixed. Postage changes require House review.');
      db.prepare('UPDATE postage_charges SET status=?,updated_at=? WHERE transaction_id=?').run(status,new Date().toISOString(),transactionId);
    }).immediate();
  }
  function summary(orderId,designerId) {
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    const items=db.prepare('SELECT SUM(line_total_cents) sales,SUM(platform_fee_cents) fee,SUM(designer_amount_cents) earnings FROM order_items WHERE order_id=? AND designer_id=?').get(orderId,designerId);
    const testMode=order?.payment_provider==='test_fixture'||String(order?.stripe_session_id||'').startsWith('cs_test_');
    const totals=db.prepare(`SELECT COALESCE(SUM(cost_cents),0) charged,COALESCE(SUM(CASE WHEN status='refunded' THEN cost_cents ELSE 0 END),0) credits,COALESCE(SUM(CASE WHEN status IN ('refund_pending','review_required') THEN 1 ELSE 0 END),0) holds FROM postage_charges WHERE order_id=? AND designer_id=? AND test_mode=?`).get(orderId,designerId,Number(testMode));
    const t=transfer(orderId,designerId);
    const refunds=db.prepare("SELECT status FROM order_refunds WHERE order_id=? AND scope IN ('full',?)").all(orderId,designerId);
    const hasRefundRows=Boolean(db.prepare('SELECT 1 FROM order_refunds WHERE order_id=?').get(orderId));
    const refundHold=refunds.length>0||Boolean(order?.refund_status&&!hasRefundRows);
    const customerRefunded=refunds.some(r=>r.status==='succeeded')||order?.refund_status==='succeeded';
    const label=table('shipping_labels')?db.prepare('SELECT * FROM shipping_labels WHERE order_id=? AND designer_id=?').get(orderId,designerId):null;
    const labelHold=Boolean(label&&(label.test_mode??1)===Number(testMode)&&['processing','review_required'].includes(label.status));
    const postage=totals.charged-totals.credits,net=(items.earnings||0)-postage,alreadyFixed=fixed(t);
    return {salesCents:items.sales||0,houseFeeCents:items.fee||0,designerShareCents:items.earnings||0,postageChargedCents:totals.charged,postageRefundCents:totals.credits,postageCents:postage,netEarningsCents:customerRefunded?0:Math.max(0,net),payoutAmountCents:alreadyFixed?t.amount_cents:Math.max(0,net),postageHold:totals.holds>0||labelHold,insufficientEarnings:net<0,customerRefundHold:refundHold,customerRefunded,unrecoveredPostageCents:customerRefunded?postage:0,postPayoutCreditCents:alreadyFixed&&!refundHold?Math.max(0,net-t.amount_cents):0,testMode};
  }
  function freezePayout(orderId,designerId) {
    return db.transaction(()=>{
      const s=summary(orderId,designerId),t=transfer(orderId,designerId);
      if(s.customerRefundHold||s.postageHold||s.insufficientEarnings)throw fail('Postage or refund review is required before payout.');
      if(!t)throw fail('Payout must be prepared first.');
      if(fixed(t))return t.amount_cents;
      db.prepare('UPDATE designer_transfers SET amount_cents=?,payout_in_flight=1 WHERE id=?').run(s.netEarningsCents,t.id);
      return s.netEarningsCents;
    }).immediate();
  }
  return {charge,refundState,summary,freezePayout};
}
module.exports={createPostageAccounting};
