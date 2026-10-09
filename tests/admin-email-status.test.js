const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {once}=require('node:events');const {createApp}=require('../server');
test('email operations are admin-only and omit recipients bodies and raw provider errors',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-admin-email-'));const ctx=createApp({dataDir:dir,seedProducts:[],adminToken:'admin',sendEmail:async()=>true});
 const now=new Date().toISOString();for(const [status,attempts] of [['pending',0],['failed',2],['sent',1]])ctx.db.prepare('INSERT INTO email_outbox(id,recipient,subject,body_text,status,attempts,next_attempt_at,created_at,last_error) VALUES (?,?,?,?,?,?,?,?,?)').run(status,'private@example.test','Test notification','PRIVATE_BODY',status,attempts,now,now,'PRIVATE_PROVIDER_ERROR');
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/admin/operations';
 try{
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{headers:{Authorization:'Bearer admin'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.deepEqual(body.emails.counts,{pending:1,failed:1,sent:1});assert.equal(body.emails.configured,true);assert.equal(body.emails.messages.find(x=>x.status==='failed').attempts,2);
  assert.doesNotMatch(JSON.stringify(body),/private@example|PRIVATE_BODY|PRIVATE_PROVIDER_ERROR/);
 }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
