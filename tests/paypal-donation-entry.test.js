const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
test('PayPal donation entry sends the chosen USD amount and cannot mark an unapproved order paid',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-paypal-entry-'));let ctx,server,calls=[];
 try{
  ctx=createApp({dataDir:dir,seedProducts:[],resolveIdentity:async()=>null,sendEmail:async()=>true,paypalApi:async(endpoint,options)=>{calls.push({endpoint,options});return {id:'PP-ENTRY',links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=PP-ENTRY'}]};}});
  server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  const post=amount=>fetch(origin+'/api/paypal/donations/order',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({amount})});
  for(const amount of [0,1001,'bad'])assert.equal((await post(amount)).status,422);assert.equal(calls.length,0);
  const response=await post(12);assert.equal(response.status,201);const result=await response.json();assert.equal(result.url,'https://www.sandbox.paypal.com/checkoutnow?token=PP-ENTRY');
  const row=ctx.db.prepare('SELECT * FROM donations').get();assert.equal(row.status,'pending');assert.equal(row.amount_cents,1200);assert.equal(row.payment_provider,'paypal');assert.equal(row.paypal_capture_id,null);
  const sent=calls[0].options.body;assert.equal(sent.intent,'CAPTURE');assert.deepEqual(sent.purchase_units[0].amount,{currency_code:'USD',value:'12.00'});assert.equal(sent.purchase_units[0].custom_id,row.id);assert.equal(sent.payment_source.paypal.experience_context.shipping_preference,'NO_SHIPPING');
  assert.equal(ctx.db.prepare('SELECT count(*) AS n FROM user_badges').get().n,0);
 }finally{if(server)await new Promise(r=>server.close(r));ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
