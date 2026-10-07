const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp}=require('../server');

test('designer bearer credential exchanges for an HttpOnly session and logout revokes it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-session-'));
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{'legacy-test-token':'maker'}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const exchange=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer legacy-test-token'}});
  assert.equal(exchange.status,200);
  const setCookie=exchange.headers.get('set-cookie')||'';
  assert.match(setCookie,/hob_designer_session=/);assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i);assert.match(setCookie,/Path=\//i);
  const cookie=setCookie.split(';')[0];
  const profile=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});
  assert.equal(profile.status,200);assert.equal((await profile.json()).designer.id,'maker');
  const crossSiteLogout=await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:'https://evil.example'}});assert.equal(crossSiteLogout.status,403);
  const stillSignedIn=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal(stillSignedIn.status,200);
  const logout=await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}});assert.equal(logout.status,200);
  const after=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal(after.status,401);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
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
