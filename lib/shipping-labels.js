const crypto = require('node:crypto');

// This first release deliberately cannot purchase live postage or alter real payouts.
function mountShippingLabels({app, db, authDesigner, fetch: providerFetch = fetch, env = process.env}) {
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_label_quotes (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, designer_id TEXT NOT NULL,
    rates_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS shipping_labels (
    order_id TEXT NOT NULL, designer_id TEXT NOT NULL, quote_id TEXT NOT NULL,
    rate_id TEXT NOT NULL, cost_cents INTEGER NOT NULL, status TEXT NOT NULL,
    transaction_id TEXT, label_url TEXT, tracking_number TEXT, carrier TEXT,
    created_at INTEGER NOT NULL, PRIMARY KEY(order_id,designer_id));`);
  if (!db.prepare('PRAGMA table_info(shipping_labels)').all().some(c=>c.name==='provider_message')) db.exec('ALTER TABLE shipping_labels ADD COLUMN provider_message TEXT');
  require('./postage-test-order').mountPostageTestOrder({app,db,authDesigner,env});
  const key = () => env.SHIPPO_TEST_API_KEY || env.Shippo_Test || env.SHIPPO_API_KEY || '';
  const enabled = () => env.SHIPPO_LABELS_MODE === 'test' && key().startsWith('shippo_test_');
  const error = (message, statusCode = 422) => Object.assign(new Error(message), {statusCode});
  function context(req) {
    const order = db.prepare(`SELECT o.* FROM orders o WHERE o.id=? AND EXISTS
      (SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.designer_id=?)`).get(req.params.orderId, req.designerId);
    if (!order) throw error('Order not found.', 404);
    if (!enabled()) throw error('Postage labels are not enabled. You can still add tracking for postage bought elsewhere.', 409);
    if (order.status !== 'paid' || !String(order.stripe_session_id || '').startsWith('cs_test_')) throw error('Test labels are available only for paid Stripe test orders.', 409);
    const transfer = db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id, req.designerId);
    if (order.refund_status || db.prepare('SELECT 1 FROM order_refunds WHERE order_id=? AND scope IN (?,?)').get(order.id,'full',req.designerId)) throw error('Labels are unavailable for orders with refunds.',409);
    if (transfer?.payout_in_flight || transfer?.status === 'paid' || transfer?.tracking_verified_at || transfer?.tracking_number) throw error('This order already has tracking or a payout in progress.',409);
    const earnings = db.prepare('SELECT SUM(designer_amount_cents) cents FROM order_items WHERE order_id=? AND designer_id=?').get(order.id, req.designerId).cents;
    return {order, earnings};
  }
  const saved = req => db.prepare('SELECT * FROM shipping_labels WHERE order_id=? AND designer_id=?').get(req.params.orderId, req.designerId);
  const publicLabel = row => row && ({status:row.status, costCents:row.cost_cents, labelUrl:row.label_url, trackingNumber:row.tracking_number, carrier:row.carrier, message:row.provider_message || null, test:true});
  async function shippo(endpoint, body) {
    const response = await providerFetch(`https://api.goshippo.com/${endpoint}/`, {
      method:'POST', signal:AbortSignal.timeout(20000),
      headers:{Authorization:`ShippoToken ${key()}`,'Content-Type':'application/json','SHIPPO-API-VERSION':'2018-02-08'},
      body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw error('Shippo could not complete this request. Check your address and parcel details.',502);
    if (result.test !== true) throw error('Shippo did not return a test object. Labels are blocked.',502);
    return result;
  }
  app.get('/api/orders/:orderId/postage', authDesigner, (req,res,next) => {
    try {
      const owns = db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND designer_id=?').get(req.params.orderId,req.designerId);
      if (!owns) throw error('Order not found.',404);
      const order = db.prepare('SELECT status,stripe_session_id FROM orders WHERE id=?').get(req.params.orderId);
      return res.json({enabled:enabled() && order?.status==='paid' && String(order.stripe_session_id||'').startsWith('cs_test_'),test:true,label:publicLabel(saved(req)) || null});
    } catch(e) {next(e);}
  });
  app.post('/api/orders/:orderId/postage/reconcile', authDesigner, async (req,res,next) => {
    try {
      const {order}=context(req);
      const current=saved(req);
      if (!current) throw error('No label request exists for this order.',404);
      if (current.status==='ready') return res.json({label:publicLabel(current)});
      const metadata=`hob-test:${order.id}:${req.designerId}`.slice(0,100);
      const read=async endpoint=>{
        const response=await providerFetch(`https://api.goshippo.com/${endpoint}`,{signal:AbortSignal.timeout(20000),headers:{Authorization:`ShippoToken ${key()}`,'SHIPPO-API-VERSION':'2018-02-08'}});
        if(!response.ok)throw error('Shippo could not check the existing label. No new label was requested.',502);
        return response.json();
      };
      let transaction;
      if(current.transaction_id) transaction=await read(`transactions/${encodeURIComponent(current.transaction_id)}/`);
      else {
        const matches=[];
        for(let page=1;page<=3;page++){
          const list=await read(`transactions/?results=100&page=${page}`);
          if(!Array.isArray(list.results))throw error('Shippo returned an unreadable label history. No new label was requested.',502);
          matches.push(...list.results.filter(t=>t.metadata===metadata && (typeof t.rate==='string'?t.rate:t.rate?.object_id)===current.rate_id));
          if(!list.next)break;
        }
        if(matches.length!==1)throw error(matches.length?'Multiple matching transactions need support review. No new label was requested.':'The existing request was not found in recent Shippo history. No new label was requested.',409);
        transaction=matches[0];
      }
      if(transaction.test!==true || transaction.metadata!==metadata || (typeof transaction.rate==='string'?transaction.rate:transaction.rate?.object_id)!==current.rate_id || !transaction.object_id)throw error('Shippo transaction does not match this test order. No changes were made.',409);
      applyTransaction(req,transaction,current.carrier);
      return res.json({label:publicLabel(saved(req))});
    }catch(e){next(e);}
  });
  function applyTransaction(req,transaction,carrier) {
    let status='review_required';
    let message=`Shippo status: ${String(transaction.status||'unknown')}.`;
    const details=(transaction.messages||[]).map(m=>String(m.code||'')+': '+String(m.text||'')).join(' ').slice(0,700);
    if(details)message+=' '+details;
    if(transaction.status==='SUCCESS' && safeLabelUrl(transaction.label_url) && transaction.tracking_number) {status='ready';message=null;}
    else if(transaction.status==='SUCCESS') {
      let host='missing';try{host=new URL(transaction.label_url).hostname;}catch{}
      message=`Shippo created the sample, but the document could not be accepted (document host: ${host}; tracking: ${transaction.tracking_number?'present':'missing'}). No new label was requested.`;
    }else if(['WAITING','QUEUED'].includes(transaction.status))status='processing';
    else if(transaction.status==='ERROR')status='provider_error';
    db.prepare(`UPDATE shipping_labels SET status=?,transaction_id=?,label_url=?,tracking_number=?,carrier=?,provider_message=? WHERE order_id=? AND designer_id=?`).run(status,transaction.object_id||null,status==='ready'?transaction.label_url:null,transaction.tracking_number||null,carrier,message,req.params.orderId,req.designerId);
  }
  app.post('/api/orders/:orderId/postage/rates', authDesigner, async (req,res,next) => {
    try {
      const {order,earnings} = context(req);
      if (saved(req)) throw error('A label request already exists. Reopen this order to see its status.',409);
      const from = req.body?.from || {};
      const addressFrom = {};
      for (const field of ['name','street1','city','state','zip']) {
        if (typeof from[field] !== 'string' || !from[field].trim() || from[field].length > 150) throw error('Add your complete US return address.');
        addressFrom[field] = from[field].trim();
      }
      addressFrom.street2 = String(from.street2 || '').slice(0,150);
      addressFrom.country = 'US';
      addressFrom.company = 'House of Briar';
      const parcel = {};
      for (const field of ['length','width','height','weight']) {
        const n = Number(req.body?.parcel?.[field]);
        if (!Number.isFinite(n) || n <= 0 || n > (field==='weight'?1120:108)) throw error('Enter valid package dimensions in inches and weight in ounces.');
        parcel[field] = String(n);
      }
      parcel.distance_unit = 'in'; parcel.mass_unit = 'oz';
      let destination;
      try {destination=JSON.parse(order.shipping_details_json);} catch {throw error('This order has no delivery address.');}
      const a = destination?.address;
      if (!destination?.name || !a?.line1 || !a.city || !a.state || !a.postal_code || a.country!=='US') throw error('A complete US delivery address is required.');
      const shipment = await shippo('shipments', {address_from:addressFrom,address_to:{name:destination.name,street1:a.line1,street2:a.line2||'',city:a.city,state:a.state,zip:a.postal_code,country:'US'},parcels:[parcel],async:false});
      const rates = (shipment.rates || []).flatMap(rate => {
        if (rate.currency !== 'USD' || !/^\d+\.\d{2}$/.test(String(rate.amount)) || !rate.object_id) return [];
        const cents = Math.round(Number(rate.amount)*100);
        if (!Number.isSafeInteger(cents) || cents <= 0) return [];
        return [{id:rate.object_id,costCents:cents,carrier:String(rate.provider||''),service:String(rate.servicelevel?.name||''),remainingCents:earnings-cents,affordable:cents<=earnings}];
      }).sort((a,b)=>a.costCents-b.costCents);
      if (!rates.length) throw error('No shipping rates were returned. Check your return address and package details.');
      // Recheck after the provider call in case another tab created a label meanwhile.
      context(req);
      if (saved(req)) throw error('A label request already exists.',409);
      const quoteId = crypto.randomUUID();
      db.prepare('INSERT INTO shipping_label_quotes VALUES (?,?,?,?,?)').run(quoteId,order.id,req.designerId,JSON.stringify(rates),Date.now());
      db.prepare('DELETE FROM shipping_label_quotes WHERE created_at<? AND id NOT IN (SELECT quote_id FROM shipping_labels)').run(Date.now()-86400000);
      res.json({quoteId,rates,earningsCents:earnings,test:true});
    } catch(e) {next(e);}
  });
  app.post('/api/orders/:orderId/postage/label', authDesigner, async (req,res,next) => {
    try {
      const {order,earnings} = context(req);
      const existing = saved(req);
      if (existing) return res.status(existing.status==='ready'?200:409).json({label:publicLabel(existing)});
      if (req.body?.confirmDeduction !== true) throw error('Confirm the postage deduction before creating your label.');
      const quote = db.prepare('SELECT * FROM shipping_label_quotes WHERE id=? AND order_id=? AND designer_id=?').get(String(req.body?.quoteId||''),order.id,req.designerId);
      if (!quote || Date.now()-quote.created_at>15*60000) throw error('Shipping rates expired. Get fresh rates before confirming.',409);
      const rate = JSON.parse(quote.rates_json).find(r=>r.id===req.body?.rateId);
      if (!rate) throw error('Choose a rate from this order.');
      if (rate.costCents>earnings) throw error('Your earnings for this order do not cover that postage. Choose a lower rate or contact support.',409);
      // Durable reservation prevents duplicate provider requests, including after an uncertain timeout.
      const inserted = db.prepare(`INSERT OR IGNORE INTO shipping_labels
        (order_id,designer_id,quote_id,rate_id,cost_cents,status,created_at) VALUES (?,?,?,?,?,'processing',?)`).run(order.id,req.designerId,quote.id,rate.id,rate.costCents,Date.now());
      if (!inserted.changes) return res.status(409).json({label:publicLabel(saved(req))});
      try {
        const transaction = await shippo('transactions',{rate:rate.id,label_file_type:'PDF_4x6',async:false,metadata:`hob-test:${order.id}:${req.designerId}`.slice(0,100)});
        applyTransaction(req,transaction,rate.carrier);
        // Test ledger only: do not change payout amounts, send buyer mail, or attach simulated tracking.
        return res.status(saved(req).status==='ready'?200:202).json({label:publicLabel(saved(req)),remainingCents:earnings-rate.costCents});
      } catch(e) {
        db.prepare("UPDATE shipping_labels SET status='review_required' WHERE order_id=? AND designer_id=? AND transaction_id IS NULL").run(order.id,req.designerId);
        throw error('Label outcome needs review. No second label will be requested automatically. Contact House of Briar.',502);
      }
    } catch(e) {next(e);}
  });
}
function safeLabelUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password && (url.hostname==='goshippo.com' || url.hostname.endsWith('.goshippo.com') || url.hostname==='shippo-delivery-east.s3.amazonaws.com' || url.hostname==='shippo-delivery.s3.amazonaws.com'); } catch {return false;}
}
module.exports={mountShippingLabels,safeLabelUrl};
