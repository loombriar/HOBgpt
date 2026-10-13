const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
async function fixture(run,{delivery=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-audit-fix-')),emails=[];
 const options={dataDir:dir,seedProducts:[],designerTokens:{},resolveIdentity:async({token})=>['buyer-a','buyer-b'].includes(token)?{sub:token,email:token+'@example.test'}:null,sendEmail:async m=>{emails.push(m);if(delivery==='throw')throw new Error('Provider failed');return delivery;}};
 let ctx=createApp(options);
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,body,token)=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try{await run({ctx,emails,post,restart:()=>{ctx.db.close();ctx=createApp(options);return ctx;}});}finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('public project intake limits writes and recovers after the window',async()=>fixture(async({ctx,post})=>{
 const body={kind:'hire-talent',contact_name:'Test',contact_email:'test@example.test',title:'Test project',description:'A local test project description with enough detail.'};
 for(let i=0;i<5;i++)assert.equal((await post('/api/creative-house/project-requests',body)).status,201);
 const blocked=await post('/api/creative-house/project-requests',body);assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM creative_project_requests').get().n,5);
 ctx.db.prepare('UPDATE rate_limit_buckets SET reset_at=0').run();assert.equal((await post('/api/creative-house/project-requests',body)).status,201);
}));
test('support fills order templates and caps emails by authenticated account',async()=>fixture(async({ctx,emails,post})=>{
 ctx.db.prepare("INSERT INTO orders(id,buyer_subject,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('order-a','buyer-a','paid','usd',100,9,91,?)").run(new Date().toISOString());
 const first=await post('/api/support/messages',{message:'What is the order status?',orderId:'order-a'},'buyer-a');assert.equal(first.status,201);
 assert.match(emails[0].subject,/order-a/);assert.match(emails[0].text,/current status is paid/);assert.doesNotMatch(emails[0].text,/\{\{/);
 assert.equal((await post('/api/support/messages',{message:'What is the order status?',orderId:'order-a'},'buyer-b')).status,404);
 for(let i=0;i<9;i++)assert.equal((await post('/api/support/messages',{message:'A general support question'},'buyer-a')).status,201);
 assert.equal((await post('/api/support/messages',{message:'One more question'},'buyer-a')).status,429);
 assert.equal(emails.length,10);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM support_messages').get().n,10);
 assert.equal((await post('/api/support/messages',{message:'An independent support question'},'buyer-b')).status,201);
}));
test('customer codes are delivered without durable plaintext and old queued codes are retired',async()=>fixture(async({ctx,emails,post,restart})=>{
 const response=await post('/api/customer/signin-code',{email:'test@example.test',acceptedRules:true});assert.equal(response.status,202);
 const {requestId}=await response.json(),code=emails[0].text.match(/Your code is (\d{6})/)[1];
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
 assert.equal((await post('/api/customer/verify-code',{requestId,code})).status,200);
 const now=new Date().toISOString();
 ctx.db.prepare("INSERT INTO customer_login_challenges(id,email,display_name,code_hash,created_at,expires_at) VALUES ('old','old@example.test','Old','hash',?,?)").run(now,new Date(Date.now()+60000).toISOString());
 ctx.db.prepare("INSERT INTO email_outbox(id,recipient,subject,body_text,status,attempts,next_attempt_at,created_at,event_key) VALUES ('old','old@example.test','Your House of Briar sign-in code','Your code is 123456','pending',0,?,?,'customer-signin:old')").run(now,now);
 ctx=restart();assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM customer_login_challenges WHERE id='old'").get().n,0);
}));
for(const delivery of [false,'throw'])test('customer code delivery failure cleans up the challenge: '+delivery,async()=>fixture(async({ctx,post})=>{
 const r=await post('/api/customer/signin-code',{email:'failure@example.test',acceptedRules:true});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'verification_email_unavailable');
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM customer_login_challenges').get().n,0);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
},{delivery}));
