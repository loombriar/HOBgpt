// All payment state comes from authenticated PayPal API responses, never webhook amounts.
function registerPayPalDonationRecovery({app, db, paypalApi, donationBadgeSubject, awardBadge}) {
  for (const name of ['paypal_checked_at', 'paypal_capture_started_at']) {
    if (!db.prepare('PRAGMA table_info(donations)').all().some(column => column.name === name))
      db.exec(`ALTER TABLE donations ADD COLUMN ${name} TEXT`);
  }
  const inFlight = new Map();
  const mismatch = () => Object.assign(new Error('PayPal donation payment does not match.'), {statusCode:409});
  function validateOrder(donation, order) {
    const units = order?.purchase_units;
    if (order?.id !== donation.paypal_order_id || order.intent !== 'CAPTURE' || !Array.isArray(units) || units.length !== 1) throw mismatch();
    const unit = units[0];
    if (unit.reference_id !== donation.id || unit.custom_id !== donation.id || unit.amount?.currency_code !== 'USD' ||
        !/^\d+\.\d{2}$/.test(unit.amount?.value || '') || Math.round(Number(unit.amount.value)*100) !== donation.amount_cents) throw mismatch();
    return unit;
  }
  const settle = db.transaction((donation, order) => {
    const unit = validateOrder(donation, order);
    const captures = unit.payments?.captures || [];
    const capture = captures[0];
    if (order.status !== 'COMPLETED' || captures.length !== 1 || !capture?.id || capture.status !== 'COMPLETED' ||
        capture.amount?.currency_code !== 'USD' || !/^\d+\.\d{2}$/.test(capture.amount?.value || '') ||
        Math.round(Number(capture.amount.value)*100) !== donation.amount_cents ||
        (donation.paypal_capture_id && donation.paypal_capture_id !== capture.id)) throw mismatch();
    if (db.prepare('SELECT id FROM donations WHERE paypal_capture_id=? AND id!=?').get(capture.id, donation.id)) throw mismatch();
    const email = (order.payment_source?.paypal?.email_address || order.payer?.email_address || donation.buyer_email || '').trim().toLowerCase();
    const subject = donationBadgeSubject(donation, email);
    db.prepare("UPDATE donations SET status='paid',paid_at=COALESCE(paid_at,?),buyer_subject=COALESCE(buyer_subject,?),buyer_email=COALESCE(buyer_email,?),paypal_capture_id=? WHERE id=?")
      .run(new Date().toISOString(), subject, email || null, capture.id, donation.id);
    if (subject && donation.amount_cents >= 500) awardBadge(subject, 'supporter', 'donation', donation.id);
    return {status:'paid'};
  });
  async function recover(orderId) {
    if (inFlight.has(orderId)) return inFlight.get(orderId);
    const work = (async () => {
      const donation = db.prepare("SELECT * FROM donations WHERE paypal_order_id=? AND payment_provider='paypal'").get(orderId);
      if (!donation) throw Object.assign(new Error('PayPal donation not found.'), {statusCode:404});
      db.prepare('UPDATE donations SET paypal_checked_at=? WHERE id=?').run(new Date().toISOString(), donation.id);
      const endpoint = '/v2/checkout/orders/' + encodeURIComponent(orderId);
      let order = await paypalApi(endpoint);
      validateOrder(donation, order);
      if (order.status === 'APPROVED' && donation.status !== 'paid') {
        // PayPal's idempotency retention is finite. Never blindly recapture an old uncertain attempt.
        if (donation.paypal_capture_started_at && Date.now()-Date.parse(donation.paypal_capture_started_at) > 5*60*60*1000)
          throw Object.assign(new Error('PayPal capture requires provider review.'), {statusCode:409});
        db.prepare('UPDATE donations SET paypal_capture_started_at=COALESCE(paypal_capture_started_at,?) WHERE id=?').run(new Date().toISOString(), donation.id);
        await paypalApi(endpoint + '/capture', {method:'POST', idempotencyKey:'hob-paypal-donation-capture-' + donation.id});
        order = await paypalApi(endpoint);
      }
      if (order.status === 'COMPLETED') return settle(donation, order);
      return {status:'pending'};
    })();
    inFlight.set(orderId, work);
    try { return await work; } finally { inFlight.delete(orderId); }
  }
  let running = false;
  async function reconcile() {
    if (running) return {busy:true};
    running = true;
    const result = {checked:0, paid:0, errors:0};
    try {
      const rows = db.prepare(`SELECT * FROM donations d WHERE payment_provider='paypal' AND paypal_order_id IS NOT NULL
        AND (status='pending' OR (status='paid' AND amount_cents>=500 AND NOT EXISTS
        (SELECT 1 FROM user_badges b WHERE b.badge_type='supporter' AND b.buyer_subject=d.buyer_subject)))
        ORDER BY paypal_checked_at ASC, created_at ASC LIMIT 100`).all();
      for (const row of rows) {
        result.checked++;
        try { if ((await recover(row.paypal_order_id)).status === 'paid') result.paid++; }
        catch { result.errors++; }
      }
      return result;
    } finally { running = false; }
  }
  app.post('/api/paypal/webhook', async (req,res,next) => {
    try {
      const webhookId = process.env.PAYPAL_WEBHOOK_ID;
      if (!webhookId) return res.status(503).json({error:'PayPal webhook is not configured.'});
      const names = {auth_algo:'paypal-auth-algo', cert_url:'paypal-cert-url', transmission_id:'paypal-transmission-id', transmission_sig:'paypal-transmission-sig', transmission_time:'paypal-transmission-time'};
      const verification = {webhook_id:webhookId, webhook_event:req.body};
      for (const [name, header] of Object.entries(names)) {
        verification[name] = req.get(header);
        if (!verification[name]) return res.status(401).json({error:'Missing PayPal signature.'});
      }
      const verified = await paypalApi('/v1/notifications/verify-webhook-signature', {method:'POST',body:verification});
      if (verified.verification_status !== 'SUCCESS') return res.status(401).json({error:'Invalid PayPal signature.'});
      const event = req.body;
      const supported = ['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED'];
      if (!supported.includes(event?.event_type)) return res.json({received:true});
      const orderId = event.event_type === 'CHECKOUT.ORDER.APPROVED' ? event.resource?.id : event.resource?.supplementary_data?.related_ids?.order_id;
      if (typeof orderId !== 'string') return res.status(400).json({error:'Missing PayPal order.'});
      if (db.prepare("SELECT id FROM donations WHERE paypal_order_id=? AND payment_provider='paypal'").get(orderId)) await recover(orderId);
      return res.json({received:true});
    } catch (error) { next(error); }
  });
  return {recover, reconcile};
}
module.exports = {registerPayPalDonationRecovery};
