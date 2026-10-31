const crypto = require('node:crypto');

// Live postage is opt-in and gated independently of the existing test pilot.
function mountShippingLabels({app, db, authDesigner, fetch: providerFetch = fetch, env = process.env, sellerTermsVersion}) {
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_label_quotes (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, designer_id TEXT NOT NULL,
    rates_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS shipping_labels (
    order_id TEXT NOT NULL, designer_id TEXT NOT NULL, quote_id TEXT NOT NULL,
    rate_id TEXT NOT NULL, cost_cents INTEGER NOT NULL, status TEXT NOT NULL,
    transaction_id TEXT, label_url TEXT, tracking_number TEXT, carrier TEXT,
    created_at INTEGER NOT NULL, PRIMARY KEY(order_id,designer_id));`);
  if (!db.prepare('PRAGMA table_info(shipping_labels)').all().some(c=>c.name==='test_mode')) db.exec('ALTER TABLE shipping_labels ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 1');
  if (!db.prepare('PRAGMA table_info(shipping_labels)').all().some(c=>c.name==='provider_message')) db.exec('ALTER TABLE shipping_labels ADD COLUMN provider_message TEXT');
  require('./postage-test-order').mountPostageTestOrder({app,db,authDesigner,env});
  db.exec('CREATE TABLE IF NOT EXISTS shipping_label_attempts (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, designer_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, archived_at INTEGER NOT NULL)');
  const accounting=require('./postage-accounting').createPostageAccounting(db);
  const isTest = order => String(order?.stripe_session_id || '').startsWith('cs_test_') || order?.payment_provider === 'test_fixture';
  const keyFor = order => isTest(order) ? (env.SHIPPO_TEST_API_KEY || env.Shippo_Test || env.SHIPPO_API_KEY || '') : (env.SHIPPO_API_KEY || '');
  const enabledFor = order => isTest(order)
    ? env.SHIPPO_LABELS_MODE === 'test' && keyFor(order).startsWith('shippo_test_')
    : env.SHIPPO_LIVE_LABELS_ENABLED === 'true' && keyFor(order).startsWith('shippo_live_');
  const metadataFor = (order, designerId) => `hob-${isTest(order)?'test':'live'}:${order.id}:${designerId}`.slice(0,100);
  const error = (message, statusCode = 422) => Object.assign(new Error(message), {statusCode});
  function context(req, allowRefund=false, readExistingRefund=false) {
    const order = db.prepare(`SELECT o.* FROM orders o WHERE o.id=? AND EXISTS
      (SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.designer_id=?)`).get(req.params.orderId, req.designerId);
    if (!order) throw error('Order not found.', 404);
    if (!enabledFor(order)) throw error('Postage labels are not enabled for this order. You can still add tracking for postage bought elsewhere.', 409);
    if (order.status !== 'paid') throw error('Labels require a paid order.', 409);
    const transfer = db.prepare('SELECT * FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id, req.designerId);
    if (!allowRefund && (order.refund_status || db.prepare('SELECT 1 FROM order_refunds WHERE order_id=? AND scope IN (?,?)').get(order.id,'full',req.designerId))) throw error('Labels are unavailable for orders with refunds.',409);
    const ownLabel = db.prepare('SELECT tracking_number,test_mode,status FROM shipping_labels WHERE order_id=? AND designer_id=?').get(order.id,req.designerId);
    const linkedTracking = Boolean(transfer?.tracking_number && ownLabel?.test_mode===0 && ownLabel.tracking_number===transfer.tracking_number && ownLabel.status==='ready');
    if (!readExistingRefund && (transfer?.payout_in_flight || transfer?.status === 'paid' || transfer?.tracking_verified_at || (transfer?.tracking_number && !linkedTracking))) throw error('This order already has tracking or a payout in progress.',409);
    const earnings = db.prepare('SELECT SUM(designer_amount_cents) cents FROM order_items WHERE order_id=? AND designer_id=?').get(order.id, req.designerId).cents;
    return {order, earnings, testMode:isTest(order)};
  }
  const saved = req => db.prepare('SELECT * FROM shipping_labels WHERE order_id=? AND designer_id=?').get(req.params.orderId, req.designerId);
  const publicLabel = row => row && ({status:row.status, costCents:row.cost_cents, labelUrl:row.label_url, trackingNumber:row.tracking_number, carrier:row.carrier, message:row.provider_message || null, cancelStatus:row.transaction_id?db.prepare('SELECT status FROM shipping_label_refunds WHERE transaction_id=?').get(row.transaction_id)?.status||null:null, test:row.test_mode !== 0});
  require('./postage-refunds').mountPostageRefunds({app,db,authDesigner,context,keyFor,isTest,metadataFor,providerFetch,publicLabel,saved,accounting});
  async function shippo(endpoint, body, order) {
    const response = await providerFetch(`https://api.goshippo.com/${endpoint}/`, {
      method:'POST', signal:AbortSignal.timeout(20000),
      headers:{Authorization:`ShippoToken ${keyFor(order)}`,'Content-Type':'application/json','SHIPPO-API-VERSION':'2018-02-08'},
      body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw error('Shippo could not complete this request. Check your address and parcel details.',502);
    if (result.test !== isTest(order)) throw error('Shippo returned the wrong test/live environment. Label outcome requires review.',502);
    return result;
  }
  app.get('/api/orders/:orderId/postage', authDesigner, (req,res,next) => {
    try {
      const owns = db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND designer_id=?').get(req.params.orderId,req.designerId);
      if (!owns) throw error('Order not found.',404);
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
      return res.json({enabled:enabledFor(order) && order?.status==='paid',test:isTest(order),label:publicLabel(saved(req)) || null});
    } catch(e) {next(e);}
  });
  app.post('/api/orders/:orderId/postage/correct', authDesigner, async (req,res,next) => {
    try {
      const {order}=context(req);
      const current=saved(req);
      if(!current || !['provider_error','cancelled'].includes(current.status) || !current.transaction_id)throw error('Only a confirmed failed or refunded label can be replaced.',409);
      const response=await providerFetch(`https://api.goshippo.com/transactions/${encodeURIComponent(current.transaction_id)}/`,{signal:AbortSignal.timeout(20000),headers:{Authorization:`ShippoToken ${keyFor(order)}`,'SHIPPO-API-VERSION':'2018-02-08'}});
      if(!response.ok)throw error('Shippo could not recheck the failed label. It remains held.',502);
      const transaction=await response.json();
      if(transaction.test!==isTest(order) || transaction.status!==(current.status==='cancelled'?'REFUNDED':'ERROR') || transaction.object_id!==current.transaction_id || transaction.metadata!==metadataFor(order,req.designerId) || (typeof transaction.rate==='string'?transaction.rate:transaction.rate?.object_id)!==current.rate_id)throw error('The provider has not confirmed this request failed. It remains held.',409);
      db.transaction(()=>{
        const latest=saved(req);
        if(!latest || latest.status!==current.status || latest.transaction_id!==current.transaction_id)throw error('Label status changed. Check it again.',409);
        db.prepare('INSERT OR IGNORE INTO shipping_label_attempts VALUES (?,?,?,?,?)').run(current.transaction_id,req.params.orderId,req.designerId,JSON.stringify(latest),Date.now());
        db.prepare('DELETE FROM shipping_labels WHERE order_id=? AND designer_id=?').run(req.params.orderId,req.designerId);
      }).immediate();
      res.json({label:null,corrected:true,message:current.status==='cancelled'?'Refunded label kept for reference. Enter your sender details and get fresh rates for the replacement.':'Failed attempt kept for reference. Correct your sender details and get fresh rates.'});
    }catch(e){next(e);}
  });
  app.post('/api/orders/:orderId/postage/reconcile', authDesigner, async (req,res,next) => {
    try {
      const {order}=context(req);
      const current=saved(req);
      if (!current) throw error('No label request exists for this order.',404);
      if (['ready','cancelled'].includes(current.status)) return res.json({label:publicLabel(current)});
      const metadata=metadataFor(order,req.designerId);
      const read=async endpoint=>{
        const response=await providerFetch(`https://api.goshippo.com/${endpoint}`,{signal:AbortSignal.timeout(20000),headers:{Authorization:`ShippoToken ${keyFor(order)}`,'SHIPPO-API-VERSION':'2018-02-08'}});
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
      if(transaction.test!==isTest(order) || transaction.metadata!==metadata || (typeof transaction.rate==='string'?transaction.rate:transaction.rate?.object_id)!==current.rate_id || !transaction.object_id)throw error('Shippo transaction does not match this order. No changes were made.',409);
      applyTransaction(req,transaction,current.carrier);
      return res.json({label:publicLabel(saved(req))});
    }catch(e){next(e);}
  });
  function applyTransaction(req,transaction,carrier) {
    const {order}=context(req);
    let status='review_required';
    let message=`Shippo status: ${String(transaction.status||'unknown')}.`;
    const details=(transaction.messages||[]).map(m=>String(m.code||'')+': '+String(m.text||'')).join(' ').slice(0,700);
    if(details)message+=' '+details;
    if(transaction.status==='SUCCESS' && transaction.object_id && safeLabelUrl(transaction.label_url) && transaction.tracking_number) {status='ready';message=null;}
    else if(transaction.status==='SUCCESS') {
      let host='missing';try{host=new URL(transaction.label_url).hostname;}catch{}
      message=`Shippo created the label, but the document could not be accepted (document host: ${host}; tracking: ${transaction.tracking_number?'present':'missing'}). No new label was requested.`;
    }else if(['WAITING','QUEUED'].includes(transaction.status))status='processing';
    else if(transaction.status==='ERROR')status='provider_error';
    db.transaction(()=>{
      db.prepare(`UPDATE shipping_labels SET status=?,transaction_id=?,label_url=?,tracking_number=?,carrier=?,provider_message=? WHERE order_id=? AND designer_id=?`).run(status,transaction.object_id||null,status==='ready'?transaction.label_url:null,transaction.tracking_number||null,carrier,message,req.params.orderId,req.designerId);
      if(status==='ready') {
        accounting.charge({transactionId:transaction.object_id,orderId:req.params.orderId,designerId:req.designerId,costCents:saved(req).cost_cents,testMode:isTest(order)});
        // Only live, successfully purchased labels are linked to fulfillment tracking.
        // Never overwrite externally supplied tracking or release a payout here.
        if(!isTest(order) && carrier && transaction.tracking_number) {
          const columns=db.prepare('PRAGMA table_info(designer_transfers)').all().map(c=>c.name);
          if(columns.includes('tracking_carrier')) {
            const changed=db.prepare(`UPDATE designer_transfers SET tracking_number=?,tracking_carrier=? WHERE order_id=? AND designer_id=? AND (tracking_number IS NULL OR tracking_number=?) AND COALESCE(payout_in_flight,0)=0 AND status!='paid' AND tracking_verified_at IS NULL`)
              .run(transaction.tracking_number,String(carrier).toLowerCase(),req.params.orderId,req.designerId,transaction.tracking_number);
            if(changed.changes!==1)throw error('Label purchased but tracking could not be linked safely. Support review is required.',409);
          }
        }
      }
    }).immediate();
  }
  app.post('/api/orders/:orderId/postage/rates', authDesigner, async (req,res,next) => {
    try {
      const {order,earnings,testMode} = context(req);
      if (saved(req)) throw error('A label request already exists. Reopen this order to see its status.',409);
      const from = req.body?.from || {};
      const addressFrom = {};
      for (const field of ['name','street1','city','state','zip']) {
        if (typeof from[field] !== 'string' || !from[field].trim() || from[field].length > 150) throw error('Add your complete US return address.');
        addressFrom[field] = from[field].trim();
      }
      addressFrom.street2 = String(from.street2 || '').slice(0,150);
      const email=String(from.email||'').trim();
      const phone=String(from.phone||'').trim();
      if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw error('Add a valid sender email for the carrier.');
      const phoneDigits=phone.replace(/\D/g,'');
      if(!/^\+?[\d() .-]{7,30}$/.test(phone) || phoneDigits.length<7 || phoneDigits.length>15)throw error('Add a valid sender phone number for the carrier.');
      addressFrom.email=email; addressFrom.phone=phone;
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
      const shipment = await shippo('shipments', {address_from:addressFrom,address_to:{name:destination.name,street1:a.line1,street2:a.line2||'',city:a.city,state:a.state,zip:a.postal_code,country:'US'},parcels:[parcel],async:false},order);
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
      res.json({quoteId,rates,earningsCents:earnings,test:testMode});
    } catch(e) {next(e);}
  });
  app.post('/api/orders/:orderId/postage/label', authDesigner, async (req,res,next) => {
    try {
      const {order,earnings,testMode} = context(req);
      const existing = saved(req);
      if (existing) return res.status(existing.status==='ready'?200:409).json({label:publicLabel(existing)});
      if (req.body?.confirmDeduction !== true) throw error('Confirm the postage deduction before creating your label.');
      if (!testMode) {
        if (!sellerTermsVersion) throw error('Current Seller Terms configuration is unavailable.',409);
        const accepted = db.prepare('SELECT 1 FROM designer_terms_acceptances WHERE designer_id=? AND terms_version=?').get(req.designerId,sellerTermsVersion);
        if (!accepted) throw error('Accept the current Seller Terms before buying live postage.',409);
      }
      const quote = db.prepare('SELECT * FROM shipping_label_quotes WHERE id=? AND order_id=? AND designer_id=?').get(String(req.body?.quoteId||''),order.id,req.designerId);
      if (!quote || Date.now()-quote.created_at>15*60000) throw error('Shipping rates expired. Get fresh rates before confirming.',409);
      const rate = JSON.parse(quote.rates_json).find(r=>r.id===req.body?.rateId);
      if (!rate) throw error('Choose a rate from this order.');
      if (rate.costCents>earnings) throw error('Your earnings for this order do not cover that postage. Choose a lower rate or contact support.',409);
      // A stale quote must not race with an already-fixed seller payout.
      const transfer = db.prepare('SELECT status,payout_in_flight,tracking_verified_at,tracking_number FROM designer_transfers WHERE order_id=? AND designer_id=?').get(order.id,req.designerId);
      if (transfer?.payout_in_flight || transfer?.status === 'paid' || transfer?.tracking_verified_at || transfer?.tracking_number) throw error('Tracking or payout state changed. Request a new review.',409);
      // Durable reservation prevents duplicate provider requests, including after an uncertain timeout.
      const inserted = db.prepare(`INSERT OR IGNORE INTO shipping_labels
        (order_id,designer_id,quote_id,rate_id,cost_cents,status,created_at,test_mode) VALUES (?,?,?,?,?,'processing',?,?)`).run(order.id,req.designerId,quote.id,rate.id,rate.costCents,Date.now(),Number(testMode));
      if (!inserted.changes) return res.status(409).json({label:publicLabel(saved(req))});
      try {
        const transaction = await shippo('transactions',{rate:rate.id,label_file_type:'PDF_4x6',async:false,metadata:metadataFor(order,req.designerId)},order);
        applyTransaction(req,transaction,rate.carrier);
        // The ledger charges once by provider transaction; the payout is frozen at release.
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
