const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
async function setup(email='reviewer@example.test'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-reviewer-')),mail=[];
 const ctx=createApp({dataDir:dir,adminToken:'admin-test',reviewerEmail:email,sendEmail:async m=>{mail.push(m);return true;}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 const post=(route,body,cookie='',origin=url)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
 const verify=async(address=email)=>{
  const r=await post('/api/customer/signin-code',{email:address,name:'Review account',acceptedRules:true});assert.equal(r.status,202);
  const {requestId}=await r.json(),code=mail.at(-1).text.match(/\b(\d{6})\b/)[1];
  const result=await post('/api/customer/verify-code',{requestId,code});assert.equal(result.status,200);return result.headers.get('set-cookie').split(';')[0];
 };
 return{ctx,url,post,verify,mail,close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
const password='app-review-only-password-123';
test('reviewer password requires fresh mailbox verification and grants only customer permissions',async()=>{
 const f=await setup();try{
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password})).status,403);
  const cookie=await f.verify();
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password},cookie,'https://evil.test')).status,403);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password:'short'},cookie)).status,422);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password},cookie)).status,200);
  const record=f.ctx.db.prepare('SELECT * FROM reviewer_credentials').get();assert.notEqual(record.password_hash,password);assert.equal(record.password_hash.length,128);
  const r=await f.post('/api/reviewer/signin',{role:'customer',email:'reviewer@example.test',password});assert.equal(r.status,200);
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
  const reviewCookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(f.url+'/api/customer/session',{headers:{Cookie:reviewCookie}})).status,200);
  assert.equal((await fetch(f.url+'/api/my/designer-profile',{headers:{Cookie:reviewCookie,Origin:f.url}})).status,401);
  assert.equal((await fetch(f.url+'/api/admin/customer-signups',{headers:{Cookie:reviewCookie}})).status,401);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password},reviewCookie)).status,403);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password:password+'-rotated'},cookie)).status,200);
  assert.equal((await fetch(f.url+'/api/customer/session',{headers:{Cookie:reviewCookie}})).status,401);
 }finally{await f.close();}
});
test('unconfigured access, another verified email, stale verification, wrong roles and wrong passwords fail closed',async()=>{
 const f=await setup();try{
  const other=await f.verify('other@example.test');
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password},other)).status,403);
  const cookie=await f.verify();
  f.ctx.db.prepare("UPDATE customer_sessions SET created_at='2020-01-01T00:00:00.000Z'").run();
  assert.equal((await f.post('/api/reviewer/enroll',{role:'customer',password},cookie)).status,403);
  for(const role of ['admin','designer','customer'])assert.equal((await f.post('/api/reviewer/signin',{role,email:'reviewer@example.test',password})).status,401);
  assert.equal((await f.post('/api/reviewer/signin',{role:'customer',email:'reviewer@example.test',password},'', 'https://evil.test')).status,403);
 }finally{await f.close();}
 const disabled=await setup('');try{assert.equal((await (await fetch(disabled.url+'/api/reviewer/status')).json()).enabled,false);}finally{await disabled.close();}
});
test('failed reviewer sign-ins are rate limited',async()=>{
 const f=await setup();try{
  for(let i=0;i<10;i++)assert.equal((await f.post('/api/reviewer/signin',{role:'customer',email:'reviewer@example.test',password:'wrong'})).status,401);
  assert.equal((await f.post('/api/reviewer/signin',{role:'customer',email:'reviewer@example.test',password:'wrong'})).status,429);
 }finally{await f.close();}
});
test('designer reviewer uses a mailbox-verified account, cannot become admin, and is revoked on rotation',async()=>{
 const f=await setup();try{
  f.ctx.db.prepare("INSERT INTO designer_profiles(id,email,display_name,brand_name,status,created_at) VALUES ('review-designer','reviewer@example.test','Reviewer','Review label','active',?)").run(new Date().toISOString());
  const request=await f.post('/api/designer/signin-code',{email:'reviewer@example.test'});assert.equal(request.status,202);
  const {requestId}=await request.json(),code=f.mail.at(-1).text.match(/\b(\d{6})\b/)[1];
  const verified=await f.post('/api/designer/verify-code',{requestId,code});assert.equal(verified.status,200);
  const cookie=verified.headers.getSetCookie().find(v=>v.startsWith('hob_designer_session=')).split(';')[0];
  assert.equal((await f.post('/api/reviewer/enroll',{role:'designer',password},cookie)).status,200);
  const login=await f.post('/api/reviewer/signin',{role:'designer',email:'reviewer@example.test',password});assert.equal(login.status,200);
  const reviewerCookie=login.headers.getSetCookie().find(v=>v.startsWith('hob_designer_session=')).split(';')[0];
  assert.equal((await fetch(f.url+'/api/my/designer-profile',{headers:{Cookie:reviewerCookie,Origin:f.url}})).status,200);
  assert.equal((await fetch(f.url+'/api/admin/customer-signups',{headers:{Cookie:reviewerCookie}})).status,401);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'designer',password},reviewerCookie)).status,403);
  assert.equal((await f.post('/api/reviewer/enroll',{role:'designer',password:password+'-rotated'},cookie)).status,200);
  assert.equal((await fetch(f.url+'/api/my/designer-profile',{headers:{Cookie:reviewerCookie,Origin:f.url}})).status,401);
 }finally{await f.close();}
});
