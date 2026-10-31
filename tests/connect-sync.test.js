const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp}=require('../server');
async function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-connect-sync-'));const calls=[];
 let account={id:'acct_maker',details_submitted:true,payouts_enabled:false,requirements:{currently_due:['individual.verification.document']}},failure=false;
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:40,category:'fashion'}],designerTokens:{makerToken:'maker'},adminToken:'admin',stripeApi:async endpoint=>{calls.push(endpoint);if(failure)throw new Error('Stripe temporarily unavailable');return account;}});
 ctx.db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_maker',stripe_payouts_enabled=1 WHERE id='maker'").run();
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const old=process.env.STRIPE_CONNECT_WEBHOOK_SECRET;process.env.STRIPE_CONNECT_WEBHOOK_SECRET='connect-test-secret';
 const send=async(event,secret='connect-test-secret',timestamp=Math.floor(Date.now()/1000))=>{const body=JSON.stringify(event),sig=crypto.createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');return fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${timestamp},v1=bad,v1=${sig}`},body});};
 const event=(id='evt_connect')=>({id,type:'account.updated',account:'acct_maker',created:1,data:{object:{id:'acct_maker',payouts_enabled:true}}});
 try{await run({ctx,calls,origin,send,event,setAccount:x=>{account=x},setFailure:x=>{failure=x}});}finally{if(old===undefined)delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;else process.env.STRIPE_CONNECT_WEBHOOK_SECRET=old;await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('signed Connect updates persist fresh readiness, deduplicate durably and recover from restrictions',()=>fixture(async({ctx,calls,send,event,setAccount})=>{
 assert.equal((await send(event(),'wrong')).status,400);assert.equal((await send(event(),undefined,1)).status,400);assert.equal(calls.length,0);
 assert.equal((await send(event())).status,200);let row=ctx.db.prepare("SELECT * FROM designer_profiles WHERE id='maker'").get();assert.equal(row.stripe_payouts_enabled,0);assert.deepEqual(JSON.parse(row.stripe_requirements_due),['individual.verification.document']);assert.ok(row.stripe_status_checked_at);
 assert.equal((await send(event())).status,200);assert.equal(calls.length,1);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM stripe_connect_events').get().n,1);
 setAccount({id:'acct_maker',details_submitted:true,payouts_enabled:true,requirements:{currently_due:[]}});
 const delayed=event('evt_delayed');delayed.created=0;delayed.data.object.payouts_enabled=false;assert.equal((await send(delayed)).status,200);
 row=ctx.db.prepare("SELECT * FROM designer_profiles WHERE id='maker'").get();assert.equal(row.stripe_payouts_enabled,1);assert.equal(row.stripe_requirements_due,'[]');
}));
test('Connect retrieval failures are retried; unknown or mismatched accounts cannot change seller state',()=>fixture(async({ctx,calls,send,event,setFailure,setAccount})=>{
 setFailure(true);assert.equal((await send(event())).status,500);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM stripe_connect_events').get().n,0);assert.equal(ctx.db.prepare("SELECT stripe_payouts_enabled FROM designer_profiles WHERE id='maker'").get().stripe_payouts_enabled,1);
 setFailure(false);assert.equal((await send(event())).status,200);
 const unknown=event('evt_unknown');unknown.account='acct_unknown';unknown.data.object.id='acct_unknown';unknown.data.object.metadata={designer_id:'maker'};const n=calls.length;assert.equal((await send(unknown)).status,200);assert.equal(calls.length,n);
 const mismatch=event('evt_mismatch');mismatch.account='acct_other';assert.equal((await send(mismatch)).status,400);
 setAccount({id:'acct_other',payouts_enabled:true});assert.equal((await send(event('evt_wrong_response'))).status,500);assert.equal(ctx.db.prepare("SELECT 1 FROM stripe_connect_events WHERE event_id='evt_wrong_response'").get(),undefined);
}));
test('legacy PayPal full and seller refunds never touch Stripe or mutate financial records',()=>fixture(async({ctx,calls,origin})=>{
 ctx.db.prepare("INSERT INTO orders (id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,payment_provider,stripe_payment_intent_id) VALUES ('paypal-paid','paid',4000,400,3600,?,'paypal','pi_wrong_provider')").run(new Date().toISOString());
 ctx.db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('item','paypal-paid','piece','maker','Piece',4000,1,4000,400,3600)").run();
 const before=ctx.db.prepare("SELECT * FROM orders WHERE id='paypal-paid'").get();
 for(const route of ['/api/admin/orders/paypal-paid/refund','/api/admin/orders/paypal-paid/designers/maker/refund']){const response=await fetch(origin+route,{method:'POST',headers:{Authorization:'Bearer admin'}});assert.equal(response.status,409);const body=await response.json();assert.equal(body.error.code,'refund_provider_unsupported');assert.match(body.error.message,/original payment provider/);}
 assert.equal(calls.length,0);assert.deepEqual(ctx.db.prepare("SELECT * FROM orders WHERE id='paypal-paid'").get(),before);
}));
