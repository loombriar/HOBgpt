const {verifiedSignup}=require('./helpers/verified-designer');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp}=require('../server');

test('designer signup queues one admin email alert',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-signup-alert-')),sent=[];
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},signupAlertEmail:'owner@example.test',sendEmail:async email=>{sent.push(email);return true;}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const body={email:'maker@example.test',displayName:'Maker Name',brandName:'Moon Moss',categories:['apparel'],sellerTermsAccepted:true,sellerTermsVersion:'2026-10-17-live-postage'};
  const result=await verifiedSignup(origin,ctx.db,body);assert.equal(result.response.status,200);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(sent.filter(m=>m.to==='owner@example.test').length,1);
  assert.match(sent.find(m=>m.to==='owner@example.test').subject,/Moon Moss/);
  assert.match(sent.find(m=>m.to==='owner@example.test').text,/maker@example\.test/);
  ctx.db.prepare('DELETE FROM designer_email_auth_limits').run();
  const duplicate=await verifiedSignup(origin,ctx.db,body);assert.equal(duplicate.response.status,200);
  assert.equal(sent.filter(m=>m.to==='owner@example.test').length,1);

 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
