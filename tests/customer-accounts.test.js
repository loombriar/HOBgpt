const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');const {createApp}=require('../server');
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-customers-')),mail=[];let sequence=0;
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:20}],adminToken:'admin-test',designerTokens:{seller:'maker'},stripeApi:async()=>({id:'cs_customer_'+(++sequence),url:'https://checkout.stripe.test/fixture'}),sendEmail:async message=>{mail.push(message);return true;}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 const post=(route,body,cookie='',origin=url)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const signup=async(email='guest@example.test')=>{const request=await post('/api/customer/signin-code',{email,name:'Guest',acceptedRules:true});assert.equal(request.status,202);const {requestId}=await request.json();const code=mail.at(-1).text.match(/\b(\d{6})\b/)[1];return{requestId,code};};
 const verify=async(email)=>{const challenge=await signup(email),response=await post('/api/customer/verify-code',challenge);assert.equal(response.status,200);return{response,data:await response.json(),cookie:response.headers.get('set-cookie').split(';')[0],challenge};};
 return{ctx,url,mail,post,signup,verify,close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('only completed verification counts; codes are one-use and repeat sign-in is not a new signup',async()=>{
 const f=await setup();try{
  const challenge=await f.signup();assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,0);
  assert.equal((await f.post('/api/customer/verify-code',{...challenge,code:challenge.code==='000000'?'111111':'000000'})).status,401);
  const response=await f.post('/api/customer/verify-code',challenge);assert.equal(response.status,200);assert.equal((await response.json()).created,true);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
  assert.equal((await f.post('/api/customer/verify-code',challenge)).status,401);
  const repeat=await f.verify();assert.equal(repeat.data.created,false);assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,1);
  const report=await fetch(f.url+'/api/admin/customer-signups',{headers:{Authorization:'Bearer admin-test'}});assert.equal(report.headers.get('cache-control'),'no-store');const data=await report.json();assert.equal(data.customers.total,1);assert.equal(data.customers.today,1);assert.equal(data.customers.daily.length,1);
  assert.ok(!JSON.stringify(data).includes('guest@example.test'));
  const sessionHash=f.ctx.db.prepare('SELECT session_hash FROM customer_sessions LIMIT 1').get().session_hash;assert.match(sessionHash,/^[a-f0-9]{64}$/);assert.ok(!repeat.cookie.includes(sessionHash));
 }finally{await f.close();}
});
test('customer sessions isolate favorites and cannot access designer or admin records; mutations require same origin',async()=>{
 const f=await setup();try{
  const a=await f.verify('a@example.test'),b=await f.verify('b@example.test');
  assert.equal((await f.post('/api/my/favorites/piece',{},a.cookie)).status,201);
  const own=await fetch(f.url+'/api/my/favorites',{headers:{Cookie:a.cookie}});assert.deepEqual((await own.json()).ids,['piece']);
  const other=await fetch(f.url+'/api/my/favorites',{headers:{Cookie:b.cookie}});assert.deepEqual((await other.json()).ids,[]);
  assert.equal((await fetch(f.url+'/api/my/designer-profile',{headers:{Cookie:a.cookie}})).status,401);
  assert.equal((await fetch(f.url+'/api/admin/customer-signups',{headers:{Cookie:a.cookie}})).status,401);
  assert.equal((await f.post('/api/my/favorites/piece',{},b.cookie,'https://evil.example')).status,403);
  assert.equal((await f.post('/api/customer/signin-code',{email:'other@example.test'},'','https://evil.example')).status,403);
  const out=await fetch(f.url+'/api/customer/session',{method:'DELETE',headers:{Cookie:a.cookie,Origin:f.url}});assert.equal(out.status,200);
  assert.equal((await fetch(f.url+'/api/my/favorites',{headers:{Cookie:a.cookie}})).status,401);
 }finally{await f.close();}
});
test('expired codes and five failed guesses cannot create accounts, and requesting codes is limited',async()=>{
 const f=await setup();try{
  const challenge=await f.signup();for(let i=0;i<5;i++)assert.equal((await f.post('/api/customer/verify-code',{...challenge,code:'abcdef'})).status,401);
  assert.equal((await f.post('/api/customer/verify-code',challenge)).status,401);
  const expired=await f.signup('expired@example.test');f.ctx.db.prepare('UPDATE customer_login_challenges SET expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),expired.requestId);
  assert.equal((await f.post('/api/customer/verify-code',expired)).status,401);
  assert.equal((await f.post('/api/customer/signin-code',{email:'expired@example.test',acceptedRules:true})).status,429);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,0);
 }finally{await f.close();}
});

test('cookie-authenticated donations attach to the customer and switching to designer mode revokes the customer session',async()=>{
 const f=await setup();try{
  const buyer=await f.verify();
  const donated=await f.post('/api/donations/session',{amount:5},buyer.cookie);assert.equal(donated.status,201);
  const donation=await donated.json();assert.equal(f.ctx.db.prepare('SELECT buyer_subject FROM donations ').get().buyer_subject,'customer:'+buyer.data.customer.id);
  assert.equal((await f.post('/api/donations/session',{amount:5},buyer.cookie,'https://evil.example')).status,403);
  const exchange=await fetch(f.url+'/api/session',{method:'POST',headers:{Authorization:'Bearer seller',Cookie:buyer.cookie,Origin:f.url}});assert.equal(exchange.status,200);
  assert.equal((await fetch(f.url+'/api/customer/session',{headers:{Cookie:buyer.cookie}})).status,401);
  const designerCookie=exchange.headers.get('set-cookie').match(/hob_designer_session=[^;,]+/)[0];
  assert.equal((await fetch(f.url+'/api/my/favorites',{headers:{Cookie:designerCookie}})).status,200);
 }finally{await f.close();}
});

test('customer deletion requires confirmation, revokes sessions, and clears favorites',async()=>{
 const f=await setup();try{
  const buyer=await f.verify('delete@example.test');
  assert.equal((await f.post('/api/my/favorites/piece',{},buyer.cookie)).status,201);
  const del=(confirmation,origin=f.url)=>fetch(f.url+'/api/customer/account',{method:'DELETE',headers:{Cookie:buyer.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({confirmation})});
  assert.equal((await del('DELETE','https://evil.example')).status,403);
  assert.equal((await del('no')).status,422);
  assert.equal((await del('DELETE')).status,200);
  assert.equal((await fetch(f.url+'/api/customer/session',{headers:{Cookie:buyer.cookie}})).status,401);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,0);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM buyer_favorites').get().n,0);
 }finally{await f.close();}
});
test('customer deletion blocks accounts with financial records',async()=>{
 const f=await setup();try{
  const buyer=await f.verify('paid@example.test');
  assert.equal((await f.post('/api/donations/session',{amount:5},buyer.cookie)).status,201);
  const response=await fetch(f.url+'/api/customer/account',{method:'DELETE',headers:{Cookie:buyer.cookie,Origin:f.url,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});
  assert.equal(response.status,409);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,1);
 }finally{await f.close();}
});

test('customer deletion requires a recent verified sign-in',async()=>{
 const f=await setup();try{
  const buyer=await f.verify('old-session@example.test');
  f.ctx.db.prepare('UPDATE customer_sessions SET created_at=? WHERE customer_id=?').run(new Date(Date.now()-16*60000).toISOString(),buyer.data.customer.id);
  const response=await fetch(f.url+'/api/customer/account',{method:'DELETE',headers:{Cookie:buyer.cookie,Origin:f.url,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});
  assert.equal(response.status,403);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,1);
 }finally{await f.close();}
});
