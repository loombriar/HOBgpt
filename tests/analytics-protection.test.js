const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
async function fixture(run,analyticsOptions={},extra={}){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-analytics-protection-')),emails=[];
  const options={dataDir,seedProducts:[],adminToken:'admin',sendEmail:async m=>{emails.push(m);return true;},analyticsIngest:{cookieKey:'test-only-analytics-cookie-key',...analyticsOptions},...extra};
  const ctx=createApp(options),server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(body,headers={})=>fetch(origin+'/api/analytics/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{await run({ctx,post,origin,options,emails});}finally{await new Promise(r=>server.close(r));ctx.analyticsIngest.close();if(ctx.db.open)ctx.db.close();fs.rmSync(dataDir,{recursive:true,force:true});}
}
const event=(n=1)=>({event:'page_view',sessionId:'visit-'+n,path:'/page-'+n});
const changes=db=>db.prepare('SELECT total_changes() n').get().n;
test('origin checks and bounded event schemas reject invalid requests before any durable write',async()=>fixture(async({ctx,post})=>{
  const before=changes(ctx.db);
  assert.equal((await post(event(),{Origin:'https://evil.test'})).status,403);
  assert.equal((await post(event(),{Origin:''})).status,403);
  for(const body of [[],{event:'unknown'},{...event(),sessionId:{}},{...event(),value:'Infinity'},{...event(),resultCount:-1},{...event(),path:'https://evil.test'},{...event(),listingName:'x'.repeat(301)},{event:'view_product',sessionId:'v'}])assert.equal((await post(body)).status,400);
  assert.equal(changes(ctx.db),before);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,0);
}));
test('signed browser limits resist session-ID and forwarding-header rotation without writing rejected requests',async()=>fixture(async({ctx,post})=>{
  const first=await post(event(1));assert.equal(first.status,202);
  const cookie=first.headers.get('set-cookie').split(';')[0];assert.match(first.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await post(event(2),{Cookie:cookie})).status,202);
  const before=changes(ctx.db);
  for(let n=3;n<9;n++)assert.equal((await post(event(n),{Cookie:cookie,'X-Forwarded-For':'8.8.8.'+n,'X-Real-IP':'1.1.1.'+n})).status,429);
  assert.equal(changes(ctx.db),before);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,2);
},{sessionLimit:2}));
test('global admission limits cannot be evaded with new cookies or fabricated client IPs',async()=>fixture(async({ctx,post})=>{
  for(let n=1;n<=3;n++)assert.equal((await post(event(n),{'X-Forwarded-For':'8.8.8.'+n})).status,202);
  const before=changes(ctx.db);assert.equal((await post(event(4),{'X-Forwarded-For':'9.9.9.9'})).status,429);
  assert.equal(changes(ctx.db),before);
},{minuteLimit:3}));
test('duplicate views are dropped and stored paths/referrers exclude private query strings',async()=>fixture(async({ctx,post})=>{
  const body={...event(),path:'/shop?email=private@example.test#secret',referrer:'https://example.test/private?token=secret'};
  const first=await post(body),cookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal((await first.json()).accepted,true);
  assert.equal((await (await post(body,{Cookie:cookie})).json()).accepted,false);
  const row=ctx.db.prepare('SELECT * FROM analytics_events').get();assert.equal(row.path,'/shop');assert.equal(row.referrer,'https://example.test');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,1);
}));
test('daily ingestion budgets survive restart and rejected capacity does not write to SQLite',async()=>fixture(async({ctx,post,options})=>{
  await post(event(1));await post(event(2));const before=changes(ctx.db);
  assert.equal((await (await post(event(3))).json()).accepted,false);assert.equal(changes(ctx.db),before);
  ctx.analyticsIngest.close();ctx.db.close();
  const restarted=createApp(options),server=restarted.app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const origin=`http://127.0.0.1:${server.address().port}`,beforeRestarted=changes(restarted.db);
    const response=await fetch(origin+'/api/analytics/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(event(4))});
    assert.equal((await response.json()).accepted,false);assert.equal(changes(restarted.db),beforeRestarted);
    assert.equal(restarted.db.prepare('SELECT daily_count FROM analytics_ingestion_budget').get().daily_count,2);
  }finally{await new Promise(r=>server.close(r));restarted.analyticsIngest.close();restarted.db.close();}
},{dailyLimit:2}));
test('hard row cap, bounded batches and 90-day retention preserve verified purchase records',async()=>fixture(async({ctx,post})=>{
  const write=ctx.db.prepare('INSERT INTO analytics_events(id,event_name,session_id,created_at) VALUES (?,?,?,?)');
  write.run('old-view','page_view','old','2000-01-01T00:00:00.000Z');
  write.run('recent-view','page_view','recent',new Date().toISOString());
  ctx.db.prepare("INSERT INTO orders(id,stripe_session_id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('paid','cs_paid','paid','usd',10000,900,9100,'2000-01-01T00:00:00.000Z')").run();
  ctx.db.prepare("INSERT INTO analytics_events(id,event_name,session_id,order_id,created_at) VALUES ('old-purchase','purchase','paid','paid','2000-01-01T00:00:00.000Z')").run();
  assert.equal((await (await post(event(1))).json()).accepted,false);
  ctx.analyticsIngest.sweep();
  assert.ok(ctx.db.prepare("SELECT 1 FROM analytics_events WHERE id='old-purchase'").get());
  assert.equal(ctx.db.prepare("SELECT 1 FROM analytics_events WHERE id='old-view'").get(),undefined);
  assert.equal((await (await post(event(2))).json()).accepted,true);
  assert.equal(ctx.db.prepare('SELECT stored_rows FROM analytics_ingestion_budget').get().stored_rows,2);
},{maxRows:2}));
test('queue pressure drops telemetry and groups admitted events in one bounded transaction',async()=>fixture(async({ctx})=>{
  const write=n=>()=>ctx.db.prepare("INSERT INTO analytics_events(id,event_name,created_at) VALUES (?,'search',?)").run('queued-'+n,new Date().toISOString());
  const promises=Array.from({length:6},(_,n)=>ctx.analyticsIngest.enqueue({browser:'fixture',event:{event:'search'},write:write(n)}));
  ctx.analyticsIngest.flush();assert.deepEqual(await Promise.all(promises),[true,true,false,false,false,false]);
  assert.equal(ctx.analyticsIngest.stats.batches,1);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,2);
},{maxQueue:2}));
test('low storage drops optional analytics while account verification remains usable',async()=>fixture(async({ctx,post,origin,emails})=>{
  assert.equal((await (await post(event())).json()).accepted,false);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n,0);
  const response=await fetch(origin+'/api/customer/signin-code',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'shopper@example.test',acceptedRules:true})});
  assert.equal(response.status,202);const {requestId}=await response.json(),code=emails[0].text.match(/\b\d{6}\b/)[0];
  assert.equal((await fetch(origin+'/api/customer/verify-code',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId,code})})).status,200);
},{freeBytes:()=>0}));
test('a busy SQLite writer drops analytics promptly and preserves the commerce busy timeout',async()=>fixture(async({ctx,post,options})=>{
  const Database=require('better-sqlite3'),locker=new Database(path.join(options.dataDir,'catalog.sqlite'));
  const previous=ctx.db.pragma('busy_timeout',{simple:true});
  try{
    locker.exec('BEGIN IMMEDIATE');const started=Date.now();
    const response=await post(event());assert.equal((await response.json()).accepted,false);
    assert.ok(Date.now()-started<1500,'analytics must not block behind the writer for the default five-second timeout');
    assert.equal(ctx.db.pragma('busy_timeout',{simple:true}),previous);
    locker.exec('ROLLBACK');
    assert.equal((await (await post(event(2))).json()).accepted,true);
  }finally{if(locker.inTransaction)locker.exec('ROLLBACK');locker.close();}
}));
test('exhausted anonymous telemetry budgets do not block verified checkout payment accounting',async()=>fixture(async({ctx,post,origin})=>{
  await post(event());assert.equal((await (await post(event(2))).json()).accepted,false);
  ctx.db.prepare("INSERT INTO orders(id,stripe_session_id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('verified-order','cs_verified_order','pending','usd',10000,900,9100,?)").run(new Date().toISOString());
  const response=await fetch(origin+'/api/checkout/session/cs_verified_order');assert.equal(response.status,200);assert.equal((await response.json()).paid,true);
  assert.equal(ctx.db.prepare("SELECT status FROM orders WHERE id='verified-order'").get().status,'paid');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM analytics_events WHERE event_name='purchase' AND order_id='verified-order'").get().n,1);
  assert.equal(ctx.db.prepare('SELECT daily_count FROM analytics_ingestion_budget').get().daily_count,1);
},{dailyLimit:1,maxRows:1},{stripeApi:async endpoint=>{
  assert.equal(endpoint,'checkout/sessions/cs_verified_order');
  return {id:'cs_verified_order',status:'complete',payment_status:'paid',payment_intent:'pi_verified_order',currency:'usd',amount_total:10000,metadata:{order_id:'verified-order'},shipping_details:{name:'Fixture Buyer',address:{line1:'1 Test Lane',city:'Test City',state:'OH',postal_code:'44101',country:'US'}}};
}}));
