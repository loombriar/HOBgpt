const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');

for(const admin of [false,true])test(`${admin?'admin':'designer'} onboarding validates URLs before provider calls and recovers inaccessible accounts`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-onboarding-'));
 const calls=[];
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:40,category:'fashion'}],designerTokens:{makerToken:'maker'},adminToken:'admin-test-onboarding-token',stripeApi:async(endpoint,options={})=>{
  calls.push({endpoint,options});
  if(endpoint==='accounts/acct_deleted')throw Object.assign(new Error('No such account'),{providerCode:'account_invalid'});
  if(endpoint==='v2/core/accounts')return {id:'acct_replacement'};
  if(endpoint==='accounts/acct_replacement')return {id:'acct_replacement'};
  if(endpoint==='account_links')return {url:'https://connect.stripe.test/onboard'};
  throw new Error('Unexpected provider call '+endpoint);
 }});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const route=admin?'/api/admin/designers/maker/stripe-onboarding':'/api/my/stripe-onboarding';
 const post=body=>fetch(origin+route,{method:'POST',headers:{Authorization:'Bearer '+(admin?'admin-test-onboarding-token':'makerToken'),'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  ctx.db.prepare('UPDATE designer_profiles SET stripe_account_id=?,stripe_payouts_enabled=1,stripe_details_submitted=1 WHERE id=?').run('acct_deleted','maker');
  const invalid=await post({returnUrl:'https://other.example/return'});
  assert.equal(invalid.status,422);assert.equal(calls.length,0);
  assert.equal(ctx.db.prepare('SELECT stripe_account_id FROM designer_profiles WHERE id=?').get('maker').stripe_account_id,'acct_deleted');
  const response=await post({});assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.stripeAccountId,'acct_replacement');
  const designer=ctx.db.prepare('SELECT * FROM designer_profiles WHERE id=?').get('maker');
  assert.equal(designer.stripe_account_id,'acct_replacement');assert.equal(designer.stripe_payouts_enabled,0);assert.equal(designer.stripe_details_submitted,0);
  const urls=new URLSearchParams(calls.find(call=>call.endpoint==='account_links').options.body);
  assert.equal(urls.get('return_url'),origin+(admin?'/account':'/designers/room')+'?stripe=return');
  assert.equal((await post({})).status,200);
  assert.equal(calls.filter(call=>call.endpoint==='v2/core/accounts').length,1);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
