const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {isoCBOR}=require('@simplewebauthn/server/helpers');
const {createApp}=require('../server');
const digest=b=>crypto.createHash('sha256').update(b).digest();
const b64=b=>Buffer.from(b).toString('base64url');
function authenticator(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=crypto.randomBytes(32);
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
 const authData=(rp,flags,counter)=>{const count=Buffer.alloc(4);count.writeUInt32BE(counter);return Buffer.concat([digest(rp),Buffer.from([flags]),count]);};
 return {id:b64(id),register(options,{origin,rp=options.rp.id,uv=true}={}){
  const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}));
  const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
  const data=Buffer.concat([authData(rp,uv?0x45:0x41,0),Buffer.alloc(16),length,id,Buffer.from(cose)]);
  const att=isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',data]]));
  return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(att),transports:['internal']}};
 },sign(options,{origin,handle,counter=1,uv=true,wrongKey=false}={}){
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false})),data=authData(options.rpId,uv?5:1,counter);
  const key=wrongKey?crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey:privateKey;
  return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(data),signature:b64(crypto.sign('sha256',Buffer.concat([data,digest(client)]),key)),userHandle:handle}};
 }};
}
async function fixture(run,settings={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-passkeys-'));let ctx,server;
 try{
  ctx=createApp({dataDir:dir,seedProducts:[],adminToken:'fixture-admin',designerTokens:{'fixture-maker':'maker'},...settings});server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const httpOrigin='http://127.0.0.1:'+server.address().port,origin=settings.appOrigin||httpOrigin;
  const now=new Date().toISOString();
  ctx.db.prepare("UPDATE designer_profiles SET email_verified_at=?,email='maker@example.test' WHERE id='maker'").run(now);
  const expires=new Date(Date.now()+3600000).toISOString();
  ctx.db.prepare('INSERT INTO customer_accounts VALUES (?,?,?,?,?)').run('buyer-a','buyer@example.test','Buyer',now,now);
  ctx.db.prepare('INSERT INTO customer_accounts VALUES (?,?,?,?,?)').run('buyer-b','other@example.test','Other',now,now);
  ctx.db.prepare('INSERT INTO designer_sessions VALUES (?,?,?,?,?)').run(digest('maker-session').toString('hex'),'maker',now,expires,null);
  for(const id of ['buyer-a','buyer-b'])ctx.db.prepare('INSERT INTO customer_sessions VALUES (?,?,?,?)').run(digest(id).toString('hex'),id,now,expires);
  const call=async(endpoint,{cookie='hob_customer_session=buyer-a',body,method='POST',requestOrigin=origin}={})=>{
   const response=await fetch(httpOrigin+endpoint,{method,headers:{Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
   return {status:response.status,body:await response.json(),cookies:response.headers.getSetCookie().map(c=>c.split(';')[0])};
  };
  await run({ctx,call,origin,auth:authenticator(),prefix:'/api/passkeys/customer'});
 }finally{if(server)await new Promise(r=>server.close(r));if(ctx)ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
async function enroll(f,overrides={}){
 const options=await f.call(f.prefix+'/register/options',{body:{}});assert.equal(options.status,200);
 const result=await f.call(f.prefix+'/register/verify',{cookie:(f.cookie||'hob_customer_session=buyer-a')+'; '+options.cookies[0],body:{response:f.auth.register(options.body.options,{origin:f.origin,...overrides}),name:'Fixture device'}});
 return {options,result};
}
async function signin(f,overrides={},kind='customer'){
 const prefix='/api/passkeys/'+kind,options=await f.call(prefix+'/signin/options',{cookie:'',body:{}});
 const handle=f.ctx.db.prepare('SELECT user_handle FROM account_passkeys WHERE id=?').get(f.auth.id)?.user_handle;
 const result=await f.call(prefix+'/signin/verify',{cookie:options.cookies[0],body:{response:f.auth.sign(options.body.options,{origin:f.origin,handle,...overrides})}});
 return {options,result};
}
test('real WebAuthn registration and signatures create revocable customer sessions without designer/admin access',()=>fixture(async f=>{
 const {options,result}=await enroll(f);assert.equal(result.status,201);
 assert.equal(options.body.options.authenticatorSelection.userVerification,'required');assert.equal(options.body.options.authenticatorSelection.residentKey,'required');
 const login=await signin(f);assert.equal(login.result.status,200);
 const cookie=login.result.cookies.find(c=>c.startsWith('hob_customer_session='));assert.ok(cookie);
 assert.equal((await f.call('/api/customer/session',{method:'GET',cookie})).status,200);
 assert.equal((await f.call('/api/my/designer-profile',{method:'GET',cookie})).status,401);
 assert.equal((await f.call('/api/admin/operations',{method:'GET',cookie})).status,401);
 const listed=await f.call(f.prefix,{method:'GET'});assert.equal(listed.body.items[0].name,'Fixture device');assert.equal(listed.body.items[0].public_key,undefined);
 assert.equal((await f.call(f.prefix+'/'+f.auth.id,{method:'DELETE',cookie:'hob_customer_session=buyer-b'})).status,404);
 assert.equal((await f.call(f.prefix+'/'+f.auth.id,{method:'DELETE'})).status,200);
 assert.equal((await f.call('/api/customer/session',{method:'GET',cookie})).status,401);
 assert.equal((await signin(f)).result.status,400);
}));
test('registration requires recent verified ownership and rejects cross-origin, wrong origin, missing UV and challenge reuse',()=>fixture(async f=>{
 assert.equal((await f.call(f.prefix+'/register/options',{cookie:'',body:{}})).status,401);
 assert.equal((await f.call(f.prefix+'/register/options',{requestOrigin:'https://evil.example',body:{}})).status,403);
 f.ctx.db.prepare("UPDATE customer_sessions SET created_at=? WHERE customer_id='buyer-a'").run(new Date(Date.now()-20*60000).toISOString());
 assert.equal((await f.call(f.prefix+'/register/options',{body:{}})).status,403);
 f.ctx.db.prepare("UPDATE customer_sessions SET created_at=? WHERE customer_id='buyer-a'").run(new Date().toISOString());
 assert.equal((await enroll(f,{origin:'https://evil.example'})).result.status,400);
 assert.equal((await enroll(f,{uv:false})).result.status,400);
 const {options,result}=await enroll(f);assert.equal(result.status,201);
 assert.equal((await f.call(f.prefix+'/register/verify',{cookie:'hob_customer_session=buyer-a; '+options.cookies[0],body:{response:f.auth.register(options.body.options,{origin:f.origin})}})).status,400);
}));
test('authentication rejects wrong signatures, account type, user handle, UV, expired and replayed challenges and counters',()=>fixture(async f=>{
 assert.equal((await enroll(f)).result.status,201);
 for(const override of [{wrongKey:true},{uv:false},{handle:'someone-else'},{origin:'https://evil.example'}])assert.equal((await signin(f,override)).result.status,400);
 assert.equal((await signin(f,{},'designer')).result.status,400);
 const pending=await f.call(f.prefix+'/signin/options',{cookie:'',body:{}});
 f.ctx.db.prepare('UPDATE passkey_challenges SET expires_at=0').run();
 const handle=f.ctx.db.prepare('SELECT user_handle FROM account_passkeys WHERE id=?').get(f.auth.id).user_handle;
 const response=f.auth.sign(pending.body.options,{origin:f.origin,handle});
 assert.equal((await f.call(f.prefix+'/signin/verify',{cookie:pending.cookies[0],body:{response}})).status,400);
 const success=await signin(f);assert.equal(success.result.status,200);
 const replay=f.auth.sign(success.options.body.options,{origin:f.origin,handle});
 assert.equal((await f.call(f.prefix+'/signin/verify',{cookie:success.options.cookies[0],body:{response:replay}})).status,400);
 assert.equal((await signin(f)).result.status,400);
}));

test('verified designers can enroll and sign in without customer or admin access; suspended designers fail closed',()=>fixture(async f=>{
 f.cookie='hob_designer_session=maker-session';f.prefix='/api/passkeys/designer';
 const original=f.call;f.call=(path,options={})=>original(path,{cookie:f.cookie,...options});
 assert.equal((await enroll(f)).result.status,201);
 const login=await signin(f,{},'designer');assert.equal(login.result.status,200);
 const cookie=login.result.cookies.find(c=>c.startsWith('hob_designer_session='));assert.ok(cookie);
 assert.equal((await f.call('/api/my/designer-profile',{method:'GET',cookie})).status,200);
 assert.equal((await f.call('/api/customer/session',{method:'GET',cookie})).status,401);
 assert.equal((await f.call('/api/admin/operations',{method:'GET',cookie})).status,401);
 f.ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();
 assert.equal((await signin(f,{counter:2},'designer')).result.status,400);
 assert.equal((await f.call('/api/my/designer-profile',{method:'GET',cookie})).status,403);
}));

test('only the configured Play signing certificate can use an Android app origin on the production RP',async()=>{
 const prior=process.env.ANDROID_APP_SIGNING_SHA256;const cert=Array(32).fill('AB').join(':');process.env.ANDROID_APP_SIGNING_SHA256=cert;
 try{await fixture(async f=>{
  const appOrigin='android:apk-key-hash:'+Buffer.from(cert.replaceAll(':',''),'hex').toString('base64url');
  assert.equal((await enroll(f,{origin:appOrigin})).result.status,201);
  assert.equal((await signin(f,{origin:appOrigin})).result.status,200);
  assert.equal((await signin(f,{origin:'android:apk-key-hash:untrusted',counter:2})).result.status,400);
  const association=await f.call('/.well-known/assetlinks.json',{method:'GET',cookie:''});assert.equal(association.status,200);assert.equal(association.body[0].target.package_name,'com.houseofbriar.market');
  assert.deepEqual(association.body[0].relation,['delegate_permission/common.get_login_creds']);
 },{appOrigin:'https://houseofbriar.shop'});}finally{if(prior===undefined)delete process.env.ANDROID_APP_SIGNING_SHA256;else process.env.ANDROID_APP_SIGNING_SHA256=prior;}
});
