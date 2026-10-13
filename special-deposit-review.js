function createSpecialDepositReview({db,stripeApi}) {
  db.exec(`CREATE TABLE IF NOT EXISTS special_deposit_reviews (
    offer_id TEXT PRIMARY KEY REFERENCES special_order_offers(id),
    stripe_session_id TEXT NOT NULL, state TEXT NOT NULL,
    payment_intent_id TEXT, amount_cents INTEGER, checked_at TEXT NOT NULL
  )`);
  let running=false;
  async function reconcile(){
    if(running)return {busy:true};
    running=true;
    const summary={checked:0,paidNeedsReview:0,expired:0,unpaid:0,mismatched:0,errors:0};
    try {
      // Bounded batches; oldest checks run first so every recorded session is revisited.
      const offers=db.prepare(`SELECT o.* FROM special_order_offers o
        LEFT JOIN special_deposit_reviews r ON r.offer_id=o.id
        WHERE o.stripe_session_id IS NOT NULL
        ORDER BY COALESCE(r.checked_at,'') LIMIT 50`).all();
      for(const offer of offers){
        summary.checked++;
        let state='provider_unavailable',intent=null,amount=null;
        try {
          const session=await stripeApi(`checkout/sessions/${encodeURIComponent(offer.stripe_session_id)}`);
          const bound=session.id===offer.stripe_session_id && session.metadata?.special_offer_id===offer.id &&
            session.currency==='usd' && Number.isInteger(session.amount_total) && session.amount_total===offer.deposit_cents;
          if(!bound){state='mismatched';summary.mismatched++;}
          else if(session.status==='complete'&&session.payment_status==='paid'){
            intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
            if(!intent||!intent.startsWith('pi_')){state='mismatched';summary.mismatched++;intent=null;}
            else{state=offer.status==='deposit_refunded'?'refund_needs_verification':'paid_needs_review';amount=session.amount_total;summary.paidNeedsReview++;}
          }else if(session.status==='expired'&&session.payment_status==='unpaid'){state='expired_unpaid';summary.expired++;}
          else{state='unpaid_or_pending';summary.unpaid++;}
        }catch{summary.errors++;}
        // This records evidence only. It never changes payment, refund or payout state.
        db.prepare(`INSERT INTO special_deposit_reviews VALUES (?,?,?,?,?,?)
          ON CONFLICT(offer_id) DO UPDATE SET stripe_session_id=excluded.stripe_session_id,state=excluded.state,
          payment_intent_id=excluded.payment_intent_id,amount_cents=excluded.amount_cents,checked_at=excluded.checked_at`).run(offer.id,offer.stripe_session_id,state,intent,amount,new Date().toISOString());
      }
      return summary;
    } finally{running=false;}
  }
  function report(){
    return db.prepare(`SELECT o.id,o.title,o.status offerStatus,o.deposit_cents depositCents,
      o.stripe_session_id sessionId,r.state,r.checked_at checkedAt
      FROM special_order_offers o LEFT JOIN special_deposit_reviews r ON r.offer_id=o.id
      WHERE o.stripe_session_id IS NOT NULL ORDER BY o.created_at DESC LIMIT 100`).all();
  }
  return {reconcile,report};
}
module.exports={createSpecialDepositReview};
