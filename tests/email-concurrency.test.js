const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');
test('overlapping email runs and shared database workers deliver one queued message once',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-email-lock-'));let release,calls=[];const gate=new Promise(r=>release=r);
 const opts={dataDir:dir,seedProducts:[],sendEmail:async message=>{calls.push(message);await gate;return true;}};
 const first=createApp(opts),second=createApp(opts);
 try{
  const now=new Date().toISOString();first.db.prepare("INSERT INTO email_outbox(id,recipient,subject,body_text,status,next_attempt_at,created_at) VALUES ('one','fake@example.test','Test','Body','pending',?,?)").run(now,now);
  const a=first.processEmailOutbox(),b=first.processEmailOutbox(),c=second.processEmailOutbox();
  await new Promise(r=>setTimeout(r,10));assert.equal(calls.length,1);release();await Promise.all([a,b,c]);
  assert.equal(calls[0].idempotencyKey,'hob-email-one');assert.equal(first.db.prepare("SELECT status FROM email_outbox WHERE id='one'").get().status,'sent');
  await second.processEmailOutbox();assert.equal(calls.length,1);
 }finally{release();first.db.close();second.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed delivery retries with the same provider key and expired claims recover',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-email-retry-'));const calls=[];
 const ctx=createApp({dataDir:dir,seedProducts:[],sendEmail:async message=>{calls.push(message);if(calls.length===1)throw Error('Temporary failure');return true;}});
 try{
  const now=new Date().toISOString();ctx.db.prepare("INSERT INTO email_outbox(id,recipient,subject,body_text,status,next_attempt_at,created_at) VALUES ('retry','fake@example.test','Test','Body','pending',?,?)").run(now,now);
  await ctx.processEmailOutbox();assert.equal(ctx.db.prepare("SELECT status FROM email_outbox WHERE id='retry'").get().status,'failed');
  await ctx.processEmailOutbox();assert.equal(calls.length,1);
  ctx.db.prepare("UPDATE email_outbox SET next_attempt_at=? WHERE id='retry'").run(new Date(0).toISOString());
  await ctx.processEmailOutbox();assert.equal(calls.length,2);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey);
  assert.equal(ctx.db.prepare("SELECT status FROM email_outbox WHERE id='retry'").get().status,'sent');
  ctx.db.prepare("INSERT INTO email_outbox(id,recipient,subject,body_text,status,next_attempt_at,created_at) VALUES ('abandoned','fake@example.test','Test','Body','pending',?,?)").run(new Date(Date.now()+60000).toISOString(),now);
  await ctx.processEmailOutbox();assert.equal(calls.length,2);
  ctx.db.prepare("UPDATE email_outbox SET next_attempt_at=? WHERE id='abandoned'").run(new Date(0).toISOString());
  await ctx.processEmailOutbox();assert.equal(calls.length,3);assert.equal(ctx.db.prepare("SELECT status FROM email_outbox WHERE id='abandoned'").get().status,'sent');
 }finally{ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
