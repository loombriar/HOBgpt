const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const {verifiedSignup}=require('./helpers/verified-designer');
async function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-designer-delete-'));
 const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{legacy:'protected-maker'},adminToken:'admin-test',sendEmail:async()=>true});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const signup=async email=>{const result=await verifiedSignup(origin,ctx.db,{email,displayName:'Maker',brandName:'Test Atelier',categories:['apparel'],sellerTermsAccepted:true,sellerTermsVersion:'2026-10-17-live-postage'});assert.equal(result.response.status,200);return{...result,id:result.profile.designer.id};};
 const remove=(cookie,body={confirmation:'DELETE'},extra={})=>fetch(origin+'/api/my/designer-account',{method:'DELETE',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 try{await run({ctx,origin,signup,remove});}finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('designer deletion removes an empty account, all sessions and public profile, without affecting another designer',()=>fixture(async({ctx,origin,signup,remove})=>{
 const a=await signup('delete@example.test'),b=await signup('keep@example.test');
 ctx.db.prepare('INSERT INTO designer_sessions(session_hash,designer_id,created_at,expires_at) VALUES (?,?,?,?)').run('other-session',a.id,new Date().toISOString(),new Date(Date.now()+60000).toISOString());
 assert.equal((await remove(a.cookie)).status,200);
 for(const table of ['designer_profiles','designer_sessions','designer_terms_acceptances','founding_designers']){
  const column=table==='designer_profiles'?'id':'designer_id';assert.equal(ctx.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(a.id).n,0);
 }
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_applications WHERE email=?').get('delete@example.test').n,0);
 assert.equal((await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:a.cookie}})).status,401);
 assert.equal((await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:b.cookie}})).status,200);
 assert.ok(!(await(await fetch(origin+'/api/designers')).json()).designers.some(d=>d.id===a.id));
 assert.equal((await remove(a.cookie)).status,401);
}));
test('deletion requires exact confirmation, trusted origin and a recent mailbox session',()=>fixture(async({ctx,signup,remove})=>{
 const a=await signup('recent@example.test');
 assert.equal((await remove(a.cookie,{confirmation:'no'})).status,422);
 assert.equal((await remove(a.cookie,undefined,{Origin:'https://evil.example'})).status,403);
 ctx.db.prepare('UPDATE designer_sessions SET created_at=? WHERE designer_id=?').run(new Date(Date.now()-16*60000).toISOString(),a.id);
 assert.equal((await remove(a.cookie)).status,403);
 assert.equal(ctx.db.prepare('SELECT status FROM designer_profiles WHERE id=?').get(a.id).status,'active');
}));
test('listings and connected payouts block deletion without partial cleanup',()=>fixture(async({ctx,signup,remove})=>{
 const a=await signup('stripe@example.test');ctx.db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run('acct_example',a.id);
 assert.equal((await remove(a.cookie)).status,409);
 ctx.db.prepare('UPDATE designer_profiles SET stripe_account_id=NULL WHERE id=?').run(a.id);
 const now=new Date().toISOString();ctx.db.prepare("INSERT INTO listings(id,designer_id,title,description,price,category,status,moderation_status,created_at,updated_at) VALUES (?,?,?,'',100,'apparel','draft','pending',?,?)").run('draft',a.id,'Private draft',now,now);
 assert.equal((await remove(a.cookie)).status,409);
 assert.ok(ctx.db.prepare('SELECT 1 FROM designer_terms_acceptances WHERE designer_id=?').get(a.id));
 assert.ok(ctx.db.prepare('SELECT 1 FROM designer_sessions WHERE designer_id=?').get(a.id));
}));
test('shared creative records and new feature account references fail closed',()=>fixture(async({ctx,signup,remove})=>{
 const a=await signup('shared@example.test');
 ctx.db.exec('CREATE TABLE future_feature (designer_id TEXT NOT NULL,payload TEXT)');ctx.db.prepare('INSERT INTO future_feature VALUES (?,?)').run(a.id,'retain');
 assert.equal((await remove(a.cookie)).status,409);assert.ok(ctx.db.prepare('SELECT 1 FROM designer_profiles WHERE id=?').get(a.id));
 ctx.db.prepare('DELETE FROM future_feature').run();
 ctx.db.exec('CREATE TABLE future_foreign_record (maker TEXT REFERENCES designer_profiles(id))');ctx.db.prepare('INSERT INTO future_foreign_record VALUES (?)').run(a.id);assert.equal((await remove(a.cookie)).status,409);ctx.db.prepare('DELETE FROM future_foreign_record').run();
 ctx.db.exec('CREATE TABLE future_correspondence (organizer_subject TEXT)');ctx.db.prepare('INSERT INTO future_correspondence VALUES (?)').run('designer:'+a.id);
 assert.equal((await remove(a.cookie)).status,409);
}));
test('admin deletion verifies exact email and confirmation and supports suspended empty accounts',()=>fixture(async({ctx,origin,signup})=>{
 const a=await signup('admin-delete@example.test');ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id=?").run(a.id);
 const del=(body,token='admin-test')=>fetch(origin+'/api/admin/designers/account',{method:'DELETE',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await del({email:'admin-delete@example.test',confirmation:'DELETE'},'bad')).status,403);
 assert.equal((await del({email:'admin-delete@example.test',confirmation:'no'})).status,422);
 assert.equal((await del({email:'other@example.test',confirmation:'DELETE'})).status,404);
 assert.equal((await del({email:' ADMIN-DELETE@EXAMPLE.TEST ',confirmation:'DELETE'})).status,200);
 assert.ok(!ctx.db.prepare('SELECT 1 FROM designer_profiles WHERE id=?').get(a.id));
}));
test('legacy configured accounts cannot be removed and recreated by startup seeding',()=>fixture(async({ctx,origin})=>{
 const email=ctx.db.prepare('SELECT email FROM designer_profiles WHERE id=?').get('protected-maker').email;
 const r=await fetch(origin+'/api/admin/designers/account',{method:'DELETE',headers:{Origin:origin,Authorization:'Bearer admin-test','Content-Type':'application/json'},body:JSON.stringify({email,confirmation:'DELETE'})});
 assert.equal(r.status,409);
 assert.ok(ctx.db.prepare('SELECT 1 FROM designer_profiles WHERE id=?').get('protected-maker'));
}));
