const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('independent verification emails omit provider retry keys; queued emails retain stable keys',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-provider-keys-'));
  const saved={fetch:global.fetch,key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL};
  const deliveries=[],usedKeys=new Map();let ctx,server;
  process.env.RESEND_API_KEY='re_fixture';process.env.RESEND_FROM_EMAIL='House <fixture@example.test>';
  global.fetch=async(url,options)=>{
    if(String(url)!=='https://api.resend.com/emails')return saved.fetch(url,options);
    const headers=new Headers(options.headers),key=headers.get('Idempotency-Key');
    deliveries.push({headers,key});
    if(key&&usedKeys.has(key)&&usedKeys.get(key)!==options.body)return new Response('Idempotency conflict',{status:409});
    if(key)usedKeys.set(key,options.body);
    return new Response(JSON.stringify({id:'email_fixture'}),{status:200});
  };
  try{
    ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},adminToken:'fixture-admin'});
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    const send=(route,email)=>saved.fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,acceptedRules:true})});
    assert.equal((await send('/api/designer/signin-code','first@example.test')).status,202);
    assert.equal((await send('/api/designer/signin-code','second@example.test')).status,202);
    assert.equal((await send('/api/customer/signin-code','buyer@example.test')).status,202);
    assert.equal(deliveries.length,3);
    for(const email of deliveries.slice(0,2))assert.equal(email.headers.has('Idempotency-Key'),false);
    assert.ok(deliveries[2].key&&deliveries[2].key!=='undefined');
    const now=new Date().toISOString();
    ctx.db.prepare("INSERT INTO email_outbox(id,recipient,subject,body_text,status,next_attempt_at,created_at) VALUES ('stable','fixture@example.test','Fixture','Fixture body','pending',?,?)").run(now,now);
    await ctx.processEmailOutbox();
    assert.equal(deliveries.at(-1).key,'hob-email-stable');
    assert.equal(ctx.db.prepare("SELECT status FROM email_outbox WHERE id='stable'").get().status,'sent');
  }finally{
    global.fetch=saved.fetch;
    for(const [name,value] of [['RESEND_API_KEY',saved.key],['RESEND_FROM_EMAIL',saved.from]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    if(server)await new Promise(resolve=>server.close(resolve));
    ctx?.analyticsIngest.close();ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});
