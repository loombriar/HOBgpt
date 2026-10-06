const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');

async function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-operational-events-'));
  let ctx, trackingCalls=0, immediatelyVerified=false;
  const emails=[];
  ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{seller:'designer-a'},adminToken:'admin',connectAccounts:{'designer-a':'acct_test'},
    sendEmail:async message=>{emails.push(message);return true;},
    verifyShipmentTracking:async(number,carrier)=>({id:`trk_${++trackingCalls}`,verified:immediatelyVerified,carrier,status:immediatelyVerified?'in_transit':'pre_transit'}),
    stripeApi:async endpoint=>{
      if(endpoint==='transfers')return {id:'tr_test'};
      const order=ctx.db.prepare('SELECT * FROM orders WHERE stripe_session_id=?').get(endpoint.split('/').at(-1));
      if(order)return {id:order.stripe_session_id,status:'complete',payment_status:'paid',currency:'usd',amount_total:order.subtotal_cents,metadata:{order_id:order.id}};
      throw new Error(`Unexpected Stripe endpoint ${endpoint}`);
    }});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  const call=async(route,token='seller',method='GET',body)=>{
    const response=await fetch(origin+route,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const seed=(id,production='One of a Kind',stock=1,threshold=0,email=null)=>{
    const now=new Date().toISOString(),old=new Date(Date.now()-120000).toISOString();
    ctx.db.prepare(`INSERT INTO listings(id,designer_id,title,description,price,category,status,moderation_status,production_type,stock_quantity,low_stock_threshold,designer_email,created_at,updated_at)
      VALUES (?,'designer-a',?,'test',20,'apparel','published','approved',?,?,?,?,?,?)`).run(id,id,production,stock,threshold,email,now,now);
    ctx.db.prepare("INSERT INTO orders(id,stripe_session_id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES (?,?,'pending',2000,200,1800,?)").run(id,`cs_${id}`,now);
    ctx.db.prepare("INSERT INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES (?,?,?,'designer-a',?,2000,1,2000,200,1800)").run(`item_${id}`,id,id,id);
    ctx.db.prepare("INSERT INTO inventory_reservations(listing_id,order_id,status,reserved_at,expires_at,quantity) VALUES (?,?,'reserved',?,?,1)").run(id,id,old,old);
  };
  const stripeWebhook=async id=>{
    const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{id:`cs_${id}`,metadata:{order_id:id},payment_status:'paid',currency:'usd',amount_total:2000}}});
    const t=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
    return fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${t},v1=${signature}`},body:raw});
  };
  const trackingWebhook=async tracker=>{
    const raw=JSON.stringify({object:'Event',description:'tracker.updated',result:tracker});
    const t=new Date().toISOString(),signedPath='/api/easypost/webhook';
    const signature=crypto.createHmac('sha256',process.env.EASYPOST_WEBHOOK_SECRET).update(t+'POST'+signedPath+raw).digest('hex');
    return fetch(origin+signedPath,{method:'POST',headers:{'Content-Type':'application/json','x-timestamp':t,'x-path':signedPath,'x-hmac-signature-v2':signature},body:raw});
  };
  return {ctx,call,seed,stripeWebhook,trackingWebhook,emails,get trackingCalls(){return trackingCalls;},setVerified(value){immediatelyVerified=value;},
    async close(){await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

function envSecrets() {
  const prior={STRIPE_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET,EASYPOST_WEBHOOK_SECRET:process.env.EASYPOST_WEBHOOK_SECRET};
  process.env.STRIPE_WEBHOOK_SECRET='whsec_coordination';process.env.EASYPOST_WEBHOOK_SECRET='tracking_coordination';
  return ()=>{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}};
}

test('every payment path creates sale/shipment events without email and retries do not duplicate inventory alerts',async()=>{
  const restore=envSecrets(),f=await fixture();
  try {
    for(const lane of ['session','reconcile','webhook']) {
      f.seed(lane);
      if(lane==='session')assert.equal((await f.call(`/api/checkout/session/cs_${lane}`)).status,200);
      if(lane==='reconcile')assert.equal((await f.ctx.reconcilePendingCheckouts()).paid,1);
      if(lane==='webhook')assert.equal((await f.stripeWebhook(lane)).status,200);
      const version=f.ctx.db.prepare('SELECT version FROM listings WHERE id=?').get(lane).version;
      assert.equal((await f.stripeWebhook(lane)).status,200);
      assert.equal((await f.call(`/api/checkout/session/cs_${lane}`)).status,200);
      const notices=f.ctx.db.prepare('SELECT type,action_path FROM designer_notifications WHERE order_id=?').all(lane);
      assert.deepEqual(notices.map(x=>x.type).sort(),['sale','shipping_needed','sold_out']);
      assert.equal(f.ctx.db.prepare('SELECT version FROM listings WHERE id=?').get(lane).version,version);
      assert.equal(f.ctx.db.prepare('SELECT stock_quantity FROM listings WHERE id=?').get(lane).stock_quantity,1);
      assert.ok(notices.every(x=>['/account#products','/account#orders'].includes(x.action_path)));
    }
    assert.equal(f.emails.length,0);
    f.seed('zero-threshold','Limited Quantity',2,0,'seller@example.test');
    await f.call('/api/checkout/session/cs_zero-threshold');
    await f.stripeWebhook('zero-threshold');
    assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE listing_id='zero-threshold' AND type='low_stock'").get().n,0);
    assert.equal(f.emails.filter(x=>x.subject==='You made a sale on House of Briar').length,1);
    const reduced=await f.call('/api/admin/listings/zero-threshold/inventory/adjust','admin','POST',{delta:-1,reason:'Offline removal'});
    assert.equal(reduced.status,200);
    assert.equal(reduced.body.item.availableQuantity,0);
    assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE listing_id='zero-threshold' AND type='low_stock'").get().n,1);
    // A new restock/adjustment cycle must have a new event, while the old sale remains deduped.
    const restock=await f.call('/api/admin/listings/zero-threshold/inventory/adjust','admin','POST',{delta:2,reason:'Restock'});
    const adjusted=await f.call('/api/listings/zero-threshold','seller','PUT',{title:'Batch',category:'apparel',price:20,productionType:'Limited Quantity',stockQuantity:1,lowStockThreshold:0,expectedVersion:restock.body.item.version});
    assert.equal(adjusted.status,200);
    assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE listing_id='zero-threshold' AND type='low_stock'").get().n,2);
    await f.stripeWebhook('zero-threshold');
    assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE listing_id='zero-threshold' AND type='low_stock'").get().n,2);
  } finally {await f.close();restore();}
});

test('tracking retries and carrier webhooks share one verified event and cannot reset a verified shipment',async()=>{
  const restore=envSecrets(),f=await fixture();
  try {
    for(const immediate of [false,true]) {
      const id=immediate?'immediate':'carrier';f.seed(id);await f.call(`/api/checkout/session/cs_${id}`);f.setVerified(immediate);
      const input={carrier:'USPS',trackingNumber:'1234567890'};
      const before=f.trackingCalls;
      assert.equal((await f.call(`/api/orders/${id}/tracking`,'seller','POST',input)).status,immediate?200:202);
      assert.equal((await f.call(`/api/orders/${id}/tracking`,'seller','POST',input)).status,immediate?200:202);
      assert.equal(f.trackingCalls,before+1);
      const transfer=f.ctx.db.prepare('SELECT * FROM designer_transfers WHERE order_id=?').get(id);
      const tracker={id:transfer.tracking_provider_id,status:'in_transit',tracking_details:[{status:'in_transit'}]};
      assert.equal((await f.trackingWebhook(tracker)).status,200);
      assert.equal((await f.trackingWebhook(tracker)).status,200);
      assert.equal((await f.call(`/api/orders/${id}/tracking`,'seller','POST',input)).status,200);
      assert.equal((await f.call(`/api/orders/${id}/tracking`,'seller','POST',{...input,trackingNumber:'different123'})).status,409);
      const notices=f.ctx.db.prepare('SELECT type,event_key FROM designer_notifications WHERE order_id=? AND type LIKE ?').all(id,'tracking_%');
      assert.equal(notices.filter(x=>x.type==='tracking_verified').length,1);
      assert.equal(notices.filter(x=>x.type==='tracking_submitted').length,immediate?0:1);
      assert.ok(f.ctx.db.prepare('SELECT tracking_verified_at FROM designer_transfers WHERE id=?').get(transfer.id).tracking_verified_at);
    }
  } finally {await f.close();restore();}
});
