const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {once} = require('node:events');
const {createApp,SELLER_TERMS_VERSION} = require('../server');
const {applyShipping} = require('../shipping');

const address={name:'Shipping Buyer',address:{line1:'25 Test Street',line2:'Unit 2',city:'Cleveland',state:'OH',postal_code:'44101',country:'US'}};
async function fixture(run, options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-shipping-'));
  const sessions=new Map(),calls=[],emails=[];let failedBuyerEmail=false;
  const ctx=createApp({dataDir:dir,seedProducts:[
    {id:'a1',designerId:'a',title:'A1',price:60,shippingCostCents:795},
    {id:'a2',designerId:'a',title:'A2',price:50,shippingCostCents:600},
    {id:'b1',designerId:'b',title:'B1',price:10,shippingCostCents:250}
  ],designerTokens:{sellerA:'a',sellerB:'b'},adminToken:'admin',connectAccounts:{a:'acct_a',b:'acct_b'},stripeApi:async(endpoint,options={})=>{
    calls.push({endpoint,options});
    if(endpoint.startsWith('accounts/'))return{details_submitted:true,payouts_enabled:true,charges_enabled:true};
    if(endpoint==='checkout/sessions'){
      const params=new URLSearchParams(options.body),id='cs_shipping_'+sessions.size;
      let total=0;for(let i=0;params.has(`line_items[${i}][quantity]`);i++)total+=Number(params.get(`line_items[${i}][price_data][unit_amount]`));
      sessions.set(id,{id,status:'complete',payment_status:'paid',currency:'usd',amount_total:total,metadata:{order_id:params.get('metadata[order_id]')},payment_intent:'pi_'+id,collected_information:{shipping_details:address}});
      return{id,url:'https://checkout.stripe.test/'+id};
    }
    if(endpoint.startsWith('checkout/sessions/'))return sessions.get(endpoint.split('/').pop());
    if(endpoint==='transfers')return{id:'tr_shipping'};
    if(endpoint==='transfers/tr_shipping/reversals')return{id:'trr_shipping'};
    if(endpoint==='refunds')return{id:'re_shipping',status:'succeeded'};
    throw new Error('Unexpected provider call: '+endpoint);
  },verifyShipmentTracking:async()=>({verified:true,id:'trk_shipping',carrier:'USPS',status:'in_transit'}),sendEmail:async message=>{emails.push(message);if(options.failFirstBuyerEmail && message.subject==='Your House of Briar order is confirmed' && !failedBuyerEmail){failedBuyerEmail=true;throw new Error('Temporary email failure');}return true;}});
  for(const id of ['a','b'])ctx.db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run('acct_'+id,id);
  for(const id of ['a','b'])ctx.db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run(id,SELLER_TERMS_VERSION,new Date().toISOString(),'test');
  ctx.db.prepare("UPDATE listings SET free_shipping_threshold_cents=10000 WHERE id='a1'").run();
  ctx.db.prepare("UPDATE listings SET production_type='Made to Order' WHERE id='b1'").run();
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const request=async(route,body,token)=>{const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json()};};
  try{await run({ctx,calls,sessions,request,origin,emails});}finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}

test('all new US delivery quotes are free regardless of stored rates and thresholds',()=>{
  const rows=[{designerId:'a',designerName:'A',grossCents:6000,shippingCostCents:795,quantity:2,lineTotalCents:6000,designerAmountCents:5400},{designerId:'b',designerName:'B',grossCents:5000,shippingCostCents:null,quantity:1,lineTotalCents:5000,designerAmountCents:4500}];
  const quote=applyShipping(rows);assert.equal(quote.shippingReady,true);assert.equal(quote.shippingCents,0);assert.equal(rows[0].lineTotalCents,6000);assert.equal(rows[0].designerAmountCents,5400);assert.equal(rows[1].shippingCents,0);assert.equal(quote.designers.length,2);
});

test('canonical shipping quote offers free delivery for mixed sellers and blocks stale totals and unsupported countries before reserving',async()=>fixture(async({ctx,calls,request})=>{
  const items=[{id:'a1',quantity:1},{id:'a2',quantity:1},{id:'b1',quantity:2}];
  let result=await request('/api/checkout/quote',{items});assert.equal(result.status,200);assert.equal(result.body.shippingCents,0);assert.equal(result.body.merchandiseCents,13000);assert.equal(result.body.totalBeforeTaxCents,13000);
  for(const extra of [{expectedTotalBeforeTaxCents:14100},{shippingCountry:'CA'}]){result=await request('/api/checkout/session',{items,...extra});assert.ok([409,422].includes(result.status));}
  ctx.db.prepare("UPDATE listings SET shipping_cost_cents=NULL WHERE id='a1'").run();result=await request('/api/checkout/quote',{items});assert.equal(result.body.shippingReady,true);assert.equal(result.body.totalBeforeTaxCents,13000);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(calls.filter(c=>c.endpoint==='checkout/sessions').length,0);
  result=await request('/api/checkout/quote',{items:[{id:'b1',quantity:6},{id:'b1',quantity:6}]});assert.equal(result.status,422);
}));

test('free delivery preserves private addresses and payout/refund holds; prior seller terms still release existing orders',async()=>fixture(async({ctx,calls,sessions,request})=>{
  const checkout=await request('/api/checkout/session',{items:[{id:'a1',quantity:1}],expectedTotalBeforeTaxCents:6000});assert.equal(checkout.status,201);
  const order=ctx.db.prepare('SELECT * FROM orders WHERE id=?').get(checkout.body.orderId);assert.equal(order.subtotal_cents,6000);assert.equal(order.shipping_cents,0);assert.equal(order.platform_fee_cents,600);assert.equal(order.designer_amount_cents,5400);
  const params=new URLSearchParams(calls.find(c=>c.endpoint==='checkout/sessions').options.body);assert.equal(params.get('shipping_address_collection[allowed_countries][0]'),'US');assert.equal(params.get('line_items[1][price_data][unit_amount]'),null);
  const session=sessions.get(checkout.body.sessionId);session.amount_total=5999;assert.equal((await request('/api/checkout/session/'+session.id)).status,409);session.amount_total=6000;
  session.collected_information.shipping_details={...address,address:{...address.address,country:'CA'}};assert.equal((await request('/api/checkout/session/'+session.id)).status,409);session.collected_information.shipping_details=address;
  const paid=await request('/api/checkout/session/'+session.id);assert.equal(paid.body.paid,true);assert.equal('shippingDetails' in paid.body,false);
  await request('/api/checkout/session/'+session.id);assert.equal(ctx.db.prepare('SELECT shipping_cents FROM order_items WHERE order_id=?').get(order.id).shipping_cents,0);
  const seller=await request('/api/my/orders',null,'sellerA');assert.deepEqual(seller.body.orders[0].shippingDetails,address);assert.equal(seller.body.orders[0].shippingCents,0);assert.equal((await request('/api/my/orders',null,'sellerB')).body.orders.length,0);assert.equal((await request('/api/my/orders')).status,401);assert.equal(calls.filter(c=>c.endpoint==='transfers').length,0);
  ctx.db.prepare('DELETE FROM designer_terms_acceptances WHERE designer_id=?').run('a');
  ctx.db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('a','2026-10-06',new Date().toISOString(),'legacy-test');
  // A new sale requires updated consent; fulfillment of the paid order keeps its prior consent.
  for (const route of ['/api/checkout/quote','/api/checkout/session']) {
    const blocked = await request(route,{items:[{id:'a2',quantity:1}]});
    assert.equal(blocked.status,409);
    assert.match(blocked.body.error.message,/isn’t ready to purchase yet/);
    assert.doesNotMatch(blocked.body.error.message,/accept.*terms|Stripe|payout/i);
  }
  assert.equal((await request('/api/orders/'+order.id+'/tracking',{carrier:'USPS',trackingNumber:'9400111899223856928499'},'sellerA')).status,200);assert.equal(new URLSearchParams(calls.find(c=>c.endpoint==='transfers').options.body).get('amount'),'5400');
  assert.equal((await request('/api/admin/orders/'+order.id+'/refund',{},'admin')).status,200);assert.equal(new URLSearchParams(calls.find(c=>c.endpoint==='transfers/tr_shipping/reversals').options.body).get('amount'),'5400');
}));

test('signed paid webhook and stale-checkout reconciliation preserve shipping address and total validation',async()=>fixture(async({ctx,sessions,request,origin})=>{
  const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='whsec_shipping';
  try{
    const checkout=await request('/api/checkout/session',{items:[{id:'a1',quantity:1}]});const session=sessions.get(checkout.body.sessionId);
    const raw=JSON.stringify({id:'evt_shipping',type:'checkout.session.completed',data:{object:session}}),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256','whsec_shipping').update(timestamp+'.'+raw).digest('hex');
    for(let i=0;i<2;i++){const response=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});assert.equal(response.status,200);}
    assert.equal(JSON.parse(ctx.db.prepare('SELECT shipping_details_json FROM orders WHERE id=?').get(checkout.body.orderId).shipping_details_json).address.line1,address.address.line1);
    const other=await request('/api/checkout/session',{items:[{id:'a2',quantity:1}]});const stale=sessions.get(other.body.sessionId);ctx.db.prepare("UPDATE inventory_reservations SET expires_at='2000-01-01' WHERE order_id=?").run(other.body.orderId);stale.amount_total--;
    await ctx.reconcilePendingCheckouts();assert.equal(ctx.db.prepare('SELECT status FROM orders WHERE id=?').get(other.body.orderId).status,'pending');stale.amount_total++;await ctx.reconcilePendingCheckouts();assert.equal(ctx.db.prepare('SELECT status FROM orders WHERE id=?').get(other.body.orderId).status,'paid');
  }finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
}));

test('historical paid delivery amounts survive confirmation and refund under prior terms',async()=>fixture(async({ctx,calls,sessions,request})=>{
  const checkout=await request('/api/checkout/session',{items:[{id:'a1',quantity:1}]});assert.equal(checkout.status,201);
  // Restore a historical persisted checkout snapshot, with delivery paid separately.
  ctx.db.prepare('UPDATE orders SET subtotal_cents=6795,shipping_cents=795,designer_amount_cents=6195 WHERE id=?').run(checkout.body.orderId);
  ctx.db.prepare('UPDATE order_items SET line_total_cents=6795,shipping_cents=795,designer_amount_cents=6195 WHERE order_id=?').run(checkout.body.orderId);
  const session=sessions.get(checkout.body.sessionId);session.amount_total=6795;
  assert.equal((await request('/api/checkout/session/'+session.id)).body.paid,true);
  ctx.db.prepare('DELETE FROM designer_terms_acceptances WHERE designer_id=?').run('a');
  ctx.db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('a','2026-10-06',new Date().toISOString(),'historical');
  assert.equal((await request('/api/orders/'+checkout.body.orderId+'/tracking',{carrier:'USPS',trackingNumber:'9400111899223856928499'},'sellerA')).status,200);
  assert.equal(new URLSearchParams(calls.find(c=>c.endpoint==='transfers').options.body).get('amount'),'6195');
  assert.equal(ctx.db.prepare('SELECT shipping_cents FROM orders WHERE id=?').get(checkout.body.orderId).shipping_cents,795);
  assert.equal((await request('/api/admin/orders/'+checkout.body.orderId+'/refund',{},'admin')).status,200);
  assert.equal(new URLSearchParams(calls.find(c=>c.endpoint==='refunds').options.body).get('amount'),'6795');
}));


test('buyer confirmation requires verified payment, is queued once, and retries a delivery failure',async()=>fixture(async({ctx,sessions,request,emails})=>{
  const checkout=await request('/api/checkout/session',{items:[{id:'a1',quantity:1},{id:'b1',quantity:2}]});
  assert.equal(checkout.status,201);
  const session=sessions.get(checkout.body.sessionId);
  session.customer_details={email:'buyer@example.test'};
  const confirmations=()=>emails.filter(email=>email.subject==='Your House of Briar order is confirmed');
  assert.equal(confirmations().length,0);
  session.amount_total-=1;
  assert.equal((await request('/api/checkout/session/'+session.id)).status,409);
  assert.equal(confirmations().length,0);
  session.amount_total+=1;
  assert.equal((await request('/api/checkout/session/'+session.id)).body.paid,true);
  assert.equal(confirmations().length,1);
  const message=confirmations()[0];
  assert.equal(message.to,'buyer@example.test');
  assert.match(message.text,/A1 × 1/);assert.match(message.text,/B1 × 2/);
  assert.match(message.text,/Total paid: \$80.00/);assert.match(message.text,/Free US delivery/);
  assert.match(message.text,/may arrive separately/);
  assert.doesNotMatch(message.text,/acct_|pi_|Test Street|designer earnings/i);
  const eventKey='buyer-order-confirmation:'+checkout.body.orderId;
  let row=ctx.db.prepare('SELECT * FROM email_outbox WHERE event_key=?').get(eventKey);
  assert.equal(row.status,'failed');
  await request('/api/checkout/session/'+session.id);
  assert.equal(confirmations().length,1);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE event_key=?').get(eventKey).n,1);
  ctx.db.prepare('UPDATE email_outbox SET next_attempt_at=? WHERE event_key=?').run(new Date(0).toISOString(),eventKey);
  await ctx.processEmailOutbox();
  row=ctx.db.prepare('SELECT * FROM email_outbox WHERE event_key=?').get(eventKey);
  assert.equal(row.status,'sent');assert.equal(row.attempts,2);assert.equal(confirmations().length,2);
}, {failFirstBuyerEmail:true}));
