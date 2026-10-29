'use strict';

// Append-only accounting journal. No payout initiation or payment provider calls.
// An event ID is unique across the entire journal and immutable on retry.
const TYPES = Object.freeze({
  sale: 'sale', commission: 'commission', processing_fee: 'processing_fee',
  shipping: 'shipping', refund: 'refund', chargeback: 'chargeback',
  reserve_hold: 'reserve_hold', reserve_release: 'reserve_release',
  payout: 'payout', payout_reversal: 'payout_reversal'
});
const CREDIT = new Set(['sale', 'reserve_release', 'payout_reversal']);
const DEBIT = new Set(['commission', 'processing_fee', 'shipping', 'refund', 'chargeback', 'reserve_hold', 'payout']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
function createDesignerSettlementLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS designer_settlement_entries (
    event_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    designer_id TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(length(currency)=3),
    entry_type TEXT NOT NULL CHECK(entry_type IN ('sale','commission','processing_fee','shipping','refund','chargeback','reserve_hold','reserve_release','payout','payout_reversal')),
    amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
    source_reference TEXT NOT NULL,
    test_mode INTEGER NOT NULL CHECK(test_mode IN (0,1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS settlement_by_order_designer ON designer_settlement_entries(order_id,designer_id,test_mode);`);
  function record({eventId,orderId,designerId,currency='usd',type,amountCents,sourceReference,testMode}) {
    if (![eventId,orderId,designerId,sourceReference].every(validId) ||
        typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency) ||
        !Object.hasOwn(TYPES,type) || !Number.isSafeInteger(amountCents) ||
        amountCents <= 0 || typeof testMode !== 'boolean')
      throw new TypeError('Invalid settlement journal event');
    return db.transaction(() => {
      const existing=db.prepare('SELECT * FROM designer_settlement_entries WHERE event_id=?').get(eventId);
      if (existing) {
        if (existing.order_id!==orderId || existing.designer_id!==designerId ||
            existing.currency!==currency || existing.entry_type!==type ||
            existing.amount_cents!==amountCents || existing.source_reference!==sourceReference ||
            existing.test_mode!==Number(testMode))
          throw new Error('Settlement event ID conflicts with immutable entry');
        return {inserted:false};
      }
      // Keep test and live entries strictly isolated, including within an order.
      const mismatch=db.prepare('SELECT 1 FROM designer_settlement_entries WHERE order_id=? AND designer_id=? AND (currency<>? OR test_mode<>?) LIMIT 1').get(orderId,designerId,currency,Number(testMode));
      if (mismatch) throw new Error('Settlement currency or environment mismatch');
      db.prepare('INSERT INTO designer_settlement_entries VALUES (?,?,?,?,?,?,?,?,?)')
        .run(eventId,orderId,designerId,currency,type,amountCents,sourceReference,Number(testMode),new Date().toISOString());
      return {inserted:true};
    }).immediate();
  }
  function entries(orderId,designerId,testMode) {
    if(!validId(orderId)||!validId(designerId)||typeof testMode!=='boolean')throw new TypeError('Invalid ledger lookup');
    return db.prepare('SELECT * FROM designer_settlement_entries WHERE order_id=? AND designer_id=? AND test_mode=? ORDER BY created_at,event_id').all(orderId,designerId,Number(testMode));
  }
  function summary(orderId,designerId,testMode) {
    const rows=entries(orderId,designerId,testMode);
    let availableCents=0, paidCents=0;
    for(const row of rows) {
      availableCents+=(CREDIT.has(row.entry_type)?1:-1)*row.amount_cents;
      if(row.entry_type==='payout')paidCents+=row.amount_cents;
      if(row.entry_type==='payout_reversal')paidCents-=row.amount_cents;
    }
    return {orderId,designerId,testMode,currency:rows[0]?.currency??null,
      availableCents,paidCents,entryCount:rows.length,
      reviewRequired:availableCents<0||paidCents<0};
  }
  return {record,entries,summary};
}
module.exports={createDesignerSettlementLedger};
