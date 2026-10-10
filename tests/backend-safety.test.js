const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');

async function fixture(run){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-backend-safety-'));
  const calls=[];let handler=async(endpoint)=>endpoint==='refunds'?{id:'re_test',status:'succeeded'}:endpoint==='transfers'?{id:'tr_test'}:{id:'trr_test'};
  const options={dataDir:dir,seedProducts:[],designerTokens:{makerToken:'maker',otherToken:'other'},adminToken:'admin',stripeApi:async(endpoint,request)=>{calls.push({endpoint,request});return handler(endpoint,request);}};
  const ctx=createApp(options),now=new Date().toISOString();
  for(const id of ['maker','other']){
    ctx.db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run('acct_'+id,id);
    ctx.db.prepare('INSERT INTO designer_terms_acceptances(designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run(id,SELLER_TERMS_VERSION,now,'test');
  }
  ctx.db.prepare("INSERT INTO orders(id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,stripe_payment_intent_id,payment_provider) VALUES ('order','paid','usd',8000,800,7200,?,'pi_test','stripe')").run(now);
  for(const id of ['maker','other']){
    ctx.db.prepare("INSERT INTO order_items(id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES (?,'order',?,?,'Piece',4000,1,4000,400,3600)").run('item_'+id,'piece_'+id,id);
    ctx.db.prepare("INSERT INTO designer_transfers(id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_number,tracking_status,tracking_verified_at) VALUES (?,'order',?,?,3600,'pending',?,?, 'in_transit', ?)").run('transfer_'+id,id,'acct_'+id,now,'1Z999AA10123456784',now);
  }
  const srv=ctx.app.listen(0,'127.0.0.1');await once(srv,'listening');const origin='http://127.0.0.1:'+srv.address().port;
  const call=async(route,token='admin',body,method='POST')=>{const res=await fetch(origin+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json().catch(()=>({}))};};
  const oldSecret=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='safety-secret';
  const webhook=async(id,type='refund.updated',refundId='re_test')=>{const raw=JSON.stringify({id,type,data:{object:{id:refundId,status:'pending'}}}),t=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256','safety-secret').update(t+'.'+raw).digest('hex');return fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${t},v1=${signature}`},body:raw});};
  try{await run({ctx,options,calls,call,webhook,setHandler:value=>{handler=value;}});}finally{if(oldSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=oldSecret;await new Promise(resolve=>srv.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const release='/api/admin/orders/order/designers/maker/release';
const full='/api/admin/orders/order/refund';
const partial='/api/admin/orders/order/designers/maker/refund';

test('full refunds hold unreleased payouts and replay never makes another provider call',()=>fixture(async({ctx,call,calls})=>{
  assert.equal((await call(full)).status,200);
  assert.equal(ctx.db.prepare("SELECT refund_status FROM orders WHERE id='order'").get().refund_status,'succeeded');
  const result=await call(release);assert.equal(result.status,200);assert.equal(result.body.results[0].reason,'refund_hold');
  assert.equal((await call(full)).status,200);assert.equal(calls.filter(c=>c.endpoint==='refunds').length,1);assert.equal(calls.filter(c=>c.endpoint==='transfers').length,0);
  assert.equal((await call(partial)).status,409);
}));

test('seller refunds protect that seller, permit other sellers payouts and reject overlapping full refunds',()=>fixture(async({ctx,call,calls})=>{
  assert.equal((await call(partial)).status,200);assert.equal((await call(release)).body.results[0].reason,'refund_hold');
  assert.equal((await call('/api/admin/orders/order/designers/other/release')).body.results[0].status,'paid');
  assert.equal((await call(full)).status,409);assert.equal(calls.filter(c=>c.endpoint==='refunds').length,1);
  assert.equal(ctx.db.prepare("SELECT amount_cents FROM order_refunds WHERE scope='maker'").get().amount_cents,4000);
}));

test('refund intent blocks payout during a slow provider call; uncertain provider failures retain the hold',()=>fixture(async({ctx,call,setHandler,calls})=>{
  let entered,finish;const waiting=new Promise(r=>{entered=r;});const gate=new Promise(r=>{finish=r;});
  setHandler(async()=>{entered();await gate;throw new Error('provider response lost');});
  const pending=call(full);await waiting;
  try{assert.equal((await call(release)).body.results[0].reason,'refund_hold');}finally{finish();}
  assert.equal((await pending).status,500);
  assert.equal(ctx.db.prepare("SELECT status FROM order_refunds WHERE order_id='order'").get().status,'initiating');
  assert.equal((await call(release)).body.results[0].reason,'refund_hold');
  assert.equal(calls.some(c=>c.endpoint==='transfers'),false);
  setHandler(async()=>({id:'re_test',status:'succeeded'}));assert.equal((await call(full)).status,200);
  assert.equal(calls[0].request.idempotencyKey,calls[1].request.idempotencyKey);
}));

test('refund cannot race an in-flight designer transfer',()=>fixture(async({call,setHandler,calls})=>{
  let entered,finish;const waiting=new Promise(r=>{entered=r;});const gate=new Promise(r=>{finish=r;});
  setHandler(async()=>{entered();await gate;return {id:'tr_test'};});const pending=call(release);await waiting;
  try{assert.equal((await call(full)).status,409);}finally{finish();}
  assert.equal((await pending).status,200);assert.equal(calls.some(c=>c.endpoint==='refunds'),false);
}));

test('refund webhooks refresh live provider state, validate binding, deduplicate and retry failures',()=>fixture(async({ctx,call,setHandler,webhook,calls})=>{
  setHandler(async()=>({id:'re_test',status:'pending'}));assert.equal((await call(full)).status,200);
  const live={id:'re_test',status:'succeeded',payment_intent:'pi_test',currency:'usd',amount:8000};
  setHandler(async()=>({...live,amount:1}));assert.equal((await webhook('evt_bad')).status,400);assert.equal(ctx.db.prepare("SELECT refund_status FROM orders WHERE id='order'").get().refund_status,'pending');
  setHandler(async()=>{throw new Error('temporary outage');});assert.equal((await webhook('evt_final')).status,500);
  setHandler(async()=>live);assert.equal((await webhook('evt_final')).status,200);assert.equal(ctx.db.prepare("SELECT refund_status FROM orders WHERE id='order'").get().refund_status,'succeeded');
  const n=calls.length;assert.equal((await webhook('evt_final')).status,200);assert.equal(calls.length,n);
  assert.equal((await webhook('evt_delayed','refund.created')).status,200);assert.equal(ctx.db.prepare("SELECT refund_status FROM orders WHERE id='order'").get().refund_status,'succeeded');
}));

test('missing donation sessions quarantine using sanitized provider codes and survive restart',()=>fixture(async({ctx,options,setHandler,calls})=>{
  ctx.db.prepare("INSERT INTO donations(id,amount_cents,currency,status,created_at,stripe_session_id) VALUES ('donation',500,'usd','pending',?,'cs_missing')").run(new Date().toISOString());
  setHandler(async()=>{throw Object.assign(new Error('Payment provider request failed.'),{providerCode:'resource_missing',statusCode:502});});
  assert.equal((await ctx.reconcileDonationBadges()).unavailableSessions,1);
  assert.ok(ctx.db.prepare("SELECT reconciliation_blocked_at FROM donations WHERE id='donation'").get().reconciliation_blocked_at);
  const n=calls.length;assert.equal((await ctx.reconcileDonationBadges()).checked,0);assert.equal(calls.length,n);
  const reopened=createApp(options);try{assert.equal((await reopened.reconcileDonationBadges()).checked,0);}finally{reopened.db.close();}
}));

test('Loom Briar startup preserves existing profile details and later deliberately cleared edits',()=>fixture(async({ctx,options})=>{
  ctx.db.prepare("UPDATE designer_profiles SET brand_name='Loom Briar',bio='My saved story',categories='[\"Dresses\"]' WHERE id='maker'").run();
  let reopened=createApp(options);
  try{const profile=reopened.db.prepare("SELECT * FROM designer_profiles WHERE id='maker'").get();assert.equal(profile.bio,'My saved story');assert.equal(profile.categories,'["Dresses"]');assert.equal(profile.brand_defaults_initialized,1);reopened.db.prepare("UPDATE designer_profiles SET bio='',categories='[]' WHERE id='maker'").run();}finally{reopened.db.close();}
  reopened=createApp(options);try{const profile=reopened.db.prepare("SELECT * FROM designer_profiles WHERE id='maker'").get();assert.equal(profile.bio,'');assert.equal(profile.categories,'[]');}finally{reopened.db.close();}
}));

test('buyer and designer freeform continuation is closed while owner availability responses still work',()=>fixture(async({ctx,call})=>{
  const now=new Date().toISOString();
  ctx.db.prepare("INSERT INTO listings(id,designer_id,title,description,price,category,status,moderation_status,created_at,updated_at) VALUES ('piece','maker','Piece','A garment',40,'apparel','published','approved',?,?)").run(now,now);
  const created=await call('/api/listings/piece/inquiries','otherToken',{message:'Would these measurements fit?'});assert.equal(created.status,201);
  const id=created.body.inquiry.id;
  for(const [route,token] of [[`/api/my/inquiries/${id}/messages`,'otherToken'],[`/api/my/designer-inquiries/${id}/messages`,'makerToken']]){const reply=await call(route,token,{message:'Freeform follow-up'});assert.equal(reply.status,409);assert.equal(reply.body.error.code,'inquiry_replies_disabled');}
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM inquiry_messages WHERE inquiry_id=?').get(id).n,1);
  assert.equal((await call(`/api/my/designer-inquiries/${id}`,'makerToken',{availabilityStatus:'available'},'PATCH')).status,200);
  assert.equal(ctx.db.prepare('SELECT availability_status FROM listing_inquiries WHERE id=?').get(id).availability_status,'available');
}));

test('old unresolved refunds require provider review instead of replaying an expired idempotency key',()=>fixture(async({ctx,call,calls})=>{
  const old='2000-01-01T00:00:00.000Z';
  ctx.db.prepare("INSERT INTO order_refunds(order_id,scope,amount_cents,status,created_at,updated_at) VALUES ('order','full',8000,'initiating',?,?)").run(old,old);
  const result=await call(full);assert.equal(result.status,409);assert.equal(result.body.error.code,'refund_review_required');assert.equal(calls.length,0);
  assert.equal((await call(release)).body.results[0].reason,'refund_hold');
}));


test('payout retries queue one failure notification and preserve email delivery retries',()=>fixture(async({ctx,options,call,setHandler})=>{
  const now=new Date().toISOString();
  ctx.db.prepare("INSERT INTO listings(id,designer_id,title,price,category,status,moderation_status,created_at,updated_at) VALUES ('piece_maker','maker','Piece',40,'fashion','published','approved',?,?)").run(now,now);
  ctx.db.prepare("UPDATE designer_profiles SET email='maker@example.test' WHERE id='maker'").run();
  const messages=[];
  options.sendEmail=async message=>{messages.push(message);throw Error('Temporary email outage');};
  setHandler(async()=>{throw Error('Temporary transfer outage');});
  await call(release);await call(release);
  const eventKey='payout-email:transfer_maker:failed';
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE event_key=?').get(eventKey).n,1);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE event_key='payout:transfer_maker:failed'").get().n,1);
  assert.equal(messages.length,1);
  options.sendEmail=async message=>{messages.push(message);return true;};
  ctx.db.prepare('UPDATE email_outbox SET next_attempt_at=? WHERE event_key=?').run(new Date(0).toISOString(),eventKey);
  await ctx.processEmailOutbox();
  assert.equal(messages.length,2);
  assert.equal(messages[0].idempotencyKey,messages[1].idempotencyKey);
  assert.equal(ctx.db.prepare('SELECT status FROM email_outbox WHERE event_key=?').get(eventKey).status,'sent');
}));

