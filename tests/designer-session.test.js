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
  const logout=await fetch(origin+'/api/session',{method:'DELETE',headers:{Cookie:cookie}});assert.equal(logout.status,200);
  const after=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});assert.equal(after.status,401);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
