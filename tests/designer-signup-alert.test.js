const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp}=require('../server');

test('designer signup queues one admin email alert',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-signup-alert-')),sent=[];
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},signupAlertEmail:'owner@example.test',sendEmail:async email=>{sent.push(email);return true;}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const body={email:'maker@example.test',displayName:'Maker Name',brandName:'Moon Moss',categories:['apparel'],sellerTermsAccepted:true,sellerTermsVersion:'2026-10-06'};
  const response=await fetch(origin+'/api/designer-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,201);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(sent.length,1);assert.equal(sent[0].to,'owner@example.test');assert.match(sent[0].subject,/Moon Moss/);assert.match(sent[0].text,/maker@example\.test/);
  const duplicate=await fetch(origin+'/api/designer-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(duplicate.status,409);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(sent.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
