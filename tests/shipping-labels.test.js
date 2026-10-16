const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const Database=require('better-sqlite3');
const {once}=require('node:events');
const {mountShippingLabels,safeLabelUrl}=require('../lib/shipping-labels');

async function fixture({key='shippo_test_fixture',session='cs_test_order',cost='5.00',transaction,mode='test'}={}) {
  const db=new Database(':memory:');
  db.exec(`CREATE TABLE orders (id TEXT,status TEXT,stripe_session_id TEXT,shipping_details_json TEXT,refund_status TEXT);
    CREATE TABLE order_items (order_id TEXT,designer_id TEXT,designer_amount_cents INTEGER);
    CREATE TABLE designer_transfers (order_id TEXT,designer_id TEXT,payout_in_flight INTEGER,status TEXT,tracking_verified_at TEXT,tracking_number TEXT,amount_cents INTEGER);
    CREATE TABLE order_refunds (order_id TEXT,scope TEXT);`);
  db.prepare('INSERT INTO orders VALUES (?,?,?,?,NULL)').run('order','paid',session,JSON.stringify({name:'Test Buyer',address:{line1:'100 Test Street',city:'Columbus',state:'OH',postal_code:'43211',country:'US'}}));
  db.exec("INSERT INTO order_items VALUES ('order','seller',9100); INSERT INTO designer_transfers VALUES ('order','seller',0,'pending',NULL,NULL,9100)");
  const app=express();app.use(express.json());
  const calls=[];
  mountShippingLabels({app,db,env:{SHIPPO_LABELS_MODE:mode,SHIPPO_TEST_API_KEY:key},authDesigner:(req,res,next)=>{req.designerId=req.get('x-seller')||'seller';next();},fetch:async(url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body)});
    if(url.includes('/shipments/'))return Response.json({test:true,rates:[{object_id:'rate',currency:'USD',amount:cost,provider:'USPS',servicelevel:{name:'Ground'}}]});
    if(transaction)return transaction();
    return Response.json({test:true,status:'SUCCESS',object_id:'transaction',tracking_number:'TEST123',label_url:'https://deliver.goshippo.com/test.pdf'});
  }});
  app.use((err,req,res,next)=>res.status(err.statusCode||500).json({error:{message:err.message}}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}/api/orders/order/postage`;
  return {db,calls,async call(path='',body,designer='seller'){
    const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-seller':designer},body:body?JSON.stringify(body):undefined});
    return {status:res.status,body:await res.json()};
  },async close(){await new Promise(resolve=>server.close(resolve));db.close();}};
}
const parcel={length:10,width:8,height:2,weight:12};
const from={name:'Test Designer',street1:'200 Test Street',city:'Columbus',state:'OH',zip:'43211'};
const quote=f=>f.call('/rates',{from,parcel});
const buy=(f,q,extra={})=>f.call('/label',{quoteId:q.body.quoteId,rateId:'rate',confirmDeduction:true,...extra});

test('sample label records exact deduction once, saves printable PDF and tracking, and leaves payout untouched',async()=>{
  const f=await fixture();try{
    const q=await quote(f);assert.equal(q.status,200);assert.equal(q.body.rates[0].remainingCents,8600);
    assert.equal(f.calls[0].body.address_to.street1,'100 Test Street');
    assert.equal(f.calls[0].body.address_from.company,'House of Briar');
    const label=await buy(f,q);assert.equal(label.status,200);assert.equal(label.body.label.costCents,500);assert.equal(label.body.label.trackingNumber,'TEST123');
    assert.equal((await buy(f,q)).status,200);assert.equal(f.calls.length,2);
    const transfer=f.db.prepare('SELECT * FROM designer_transfers').get();assert.equal(transfer.amount_cents,9100);assert.equal(transfer.tracking_number,null);
    assert.equal((await f.call()).body.label.status,'ready');
  }finally{await f.close();}
});

test('live keys, disabled pilot, live orders and another designer cannot create labels',async()=>{
  for(const config of [{key:'shippo_live_key'},{mode:'disabled'},{session:'cs_live_order'}]){
    const f=await fixture(config);try{assert.equal((await quote(f)).status,409);assert.equal(f.calls.length,0);}finally{await f.close();}
  }
  const f=await fixture();try{assert.equal((await f.call('/rates',{from,parcel},'other')).status,404);assert.equal((await f.call('',undefined,'other')).status,404);assert.equal(f.calls.length,0);}finally{await f.close();}
});

test('insufficient earnings, unconfirmed deduction, expired and forged rates cannot buy postage',async()=>{
  const expensive=await fixture({cost:'100.00'});try{const q=await quote(expensive);assert.equal(q.body.rates[0].affordable,false);assert.equal((await buy(expensive,q)).status,409);assert.equal(expensive.calls.length,1);}finally{await expensive.close();}
  const f=await fixture();try{
    const q=await quote(f);assert.equal((await buy(f,q,{confirmDeduction:false})).status,422);assert.equal((await buy(f,q,{rateId:'forged'})).status,422);
    f.db.prepare('UPDATE shipping_label_quotes SET created_at=?').run(Date.now()-16*60000);
    assert.equal((await buy(f,q)).status,409);assert.equal(f.calls.length,1);
  }finally{await f.close();}
});

test('uncertain provider outcome persists review hold and never retries a label purchase',async()=>{
  const f=await fixture({transaction:()=>{throw new Error('timeout');}});try{
    const q=await quote(f);assert.equal((await buy(f,q)).status,502);
    const retry=await buy(f,q);assert.equal(retry.status,409);assert.equal(retry.body.label.status,'review_required');assert.equal(f.calls.length,2);
  }finally{await f.close();}
});

test('concurrent confirmation requests produce one provider transaction',async()=>{
  const f=await fixture({transaction:async()=>{await new Promise(resolve=>setTimeout(resolve,30));return Response.json({test:true,status:'SUCCESS',object_id:'transaction',tracking_number:'TEST123',label_url:'https://deliver.goshippo.com/test.pdf'});}});
  try{const q=await quote(f);const responses=await Promise.all([buy(f,q),buy(f,q)]);assert.ok(responses.some(r=>r.status===200));assert.equal(f.calls.filter(c=>c.url.includes('/transactions/')).length,1);}finally{await f.close();}
});

test('invalid parcels, refunded orders and unsafe/non-test label responses fail closed',async()=>{
  const f=await fixture();try{assert.equal((await f.call('/rates',{from,parcel:{...parcel,weight:0}})).status,422);f.db.exec("UPDATE orders SET refund_status='pending'");assert.equal((await quote(f)).status,409);assert.equal(f.calls.length,0);}finally{await f.close();}
  for(const response of [{test:false,status:'SUCCESS'},{test:true,status:'SUCCESS',object_id:'tx',tracking_number:'TEST123',label_url:'https://evil.test/label.pdf'}]){
    const f=await fixture({transaction:()=>Response.json(response)});try{const q=await quote(f);assert.equal((await buy(f,q)).status,502);assert.equal((await f.call()).body.label.status,'review_required');}finally{await f.close();}
  }
  assert.equal(safeLabelUrl('javascript:alert(1)'),false);assert.equal(safeLabelUrl('https://goshippo.com.evil.test/a'),false);
});
