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
