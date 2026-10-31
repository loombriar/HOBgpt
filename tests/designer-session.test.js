const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp,SELLER_TERMS_VERSION}=require('../server');

test('designer bearer credential exchanges for an HttpOnly session and logout revokes it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-session-'));
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{'legacy-test-token':'maker'}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const exchange=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer legacy-test-token'}});
  assert.equal(exchange.status,200);
  const setCookie=exchange.headers.get('set-cookie')||'';
  assert.match(setCookie,/hob_designer_session=/);assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i);assert.match(setCookie,/Path=\//i);
  assert.match(setCookie,/Max-Age=604800/i);
  const cookie=setCookie.split(';')[0];
  const profile=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});
  assert.equal(profile.status,200);const designer=(await profile.json()).designer;assert.equal(designer.id,'maker');assert.equal(designer.sellerTermsVersion,SELLER_TERMS_VERSION);assert.equal(designer.sellerTermsAccepted,false);
  const crossSiteMutation=await fetch(origin+'/api/my/seller-terms',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({accepted:true,termsVersion:'2026-10-08-free-delivery'})});assert.equal(crossSiteMutation.status,403);
  const missingOriginMutation=await fetch(origin+'/api/my/seller-terms',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({accepted:true,termsVersion:'2026-10-08-free-delivery'})});assert.equal(missingOriginMutation.status,403);
  const staleVersion=await fetch(origin+'/api/my/seller-terms',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accepted:true,termsVersion:'2026-10-08-free-delivery'})});assert.equal(staleVersion.status,422);
  const sameOriginMutation=await fetch(origin+'/api/my/seller-terms',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accepted:true,termsVersion:SELLER_TERMS_VERSION})});assert.equal(sameOriginMutation.status,200);
  const updatedProfile=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal((await updatedProfile.json()).designer.sellerTermsAccepted,true);
  const crossSiteLogout=await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:'https://evil.example'}});assert.equal(crossSiteLogout.status,403);
  const stillSignedIn=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal(stillSignedIn.status,200);
  const logout=await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}});assert.equal(logout.status,200);
  const after=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal(after.status,401);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('payout authentication diagnostics distinguish missing, unknown, expired and invalid sessions without secrets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-session-diagnostics-'));
 let providerCalls=0;
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{'private-bootstrap-token':'maker'},stripeApi:async()=>{providerCalls++;throw Error('Unexpected provider call');}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const warn=console.warn,logs=[];console.warn=(...args)=>logs.push(args.join(' '));
 try{
  const rejected=async(cookie)=>{
   const response=await fetch(origin+'/api/my/stripe-onboarding',{method:'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})}});
   assert.equal(response.status,401);
  };
  await rejected();
  await rejected('hob_designer_session=private-unknown-cookie');
  const exchange=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer private-bootstrap-token'}});
  assert.equal(exchange.status,200);
  const cookie=exchange.headers.get('set-cookie').split(';')[0];
  ctx.db.prepare("UPDATE designer_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  await rejected(cookie);
  const second=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer private-bootstrap-token'}});
  ctx.db.prepare('UPDATE designer_sessions SET credential_hash=?').run('private-invalid-binding');
  await rejected(second.headers.get('set-cookie').split(';')[0]);
  const reasons=logs.filter(line=>line.startsWith('Designer payout authentication rejected:')).map(line=>JSON.parse(line.slice(line.indexOf('{'))));
  assert.deepEqual(reasons,[{reason:'missing_cookie'},{reason:'unknown_session'},{reason:'expired_session'},{reason:'invalid_session'}]);
  for(const value of ['private-bootstrap-token','private-unknown-cookie','private-invalid-binding',cookie,'maker'])assert.equal(logs.join('\n').includes(value),false);
  assert.equal(providerCalls,0);
 }finally{console.warn=warn;await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('designer cookie parsing fails closed and HTTPS origins produce Secure cookies',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-session-hardening-'));
 const ctx=createApp({dataDir:dir,appOrigin:'https://house.example',seedProducts:[],designerTokens:{'legacy-test-token':'maker'}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const malformed=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:'hob_designer_session=%E0%A4%A'}});
  assert.equal(malformed.status,401);
  const exchange=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer legacy-test-token'}});
  assert.equal(exchange.status,200);
  assert.match(exchange.headers.get('set-cookie')||'',/; Secure/i);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
