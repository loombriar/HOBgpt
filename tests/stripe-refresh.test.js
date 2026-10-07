const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');
test('Stripe browser refresh returns to the room without credentials; renewing still requires seller authentication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-refresh-'));let calls=0;
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},stripeApi:async()=>{calls++;throw new Error('Unexpected provider call');}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const refresh=await fetch(origin+'/api/my/stripe-onboarding/refresh',{redirect:'manual'});
  assert.equal(refresh.status,303);assert.equal(refresh.headers.get('location'),'/designers/room?stripe=refresh');assert.equal(refresh.headers.get('cache-control'),'no-store');
  const renewal=await fetch(origin+'/api/my/stripe-onboarding',{method:'POST'});assert.equal(renewal.status,401);assert.equal(calls,0);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('restricted Stripe key failures explain setup configuration without exposing provider details',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-permissions-'));
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:40,category:'fashion'}],designerTokens:{makerToken:'maker'},stripeApi:async()=>{throw Object.assign(new Error('secret provider detail'),{statusCode:502,providerCode:'more_permissions_required'});}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/my/stripe-onboarding',{method:'POST',headers:{Authorization:'Bearer makerToken'}});assert.equal(response.status,503);const body=await response.json();assert.equal(body.error.code,'stripe_configuration_required');assert.match(body.error.message,/Accounts Write/);assert.doesNotMatch(JSON.stringify(body),/secret provider detail/);}
 finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
