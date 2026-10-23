'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const express=require('express');
const {installFoundingSchools}=require('../lib/founding-schools');
const {commissionBasisPoints}=require('../lib/creator-commissions');

test('student schema and permanent student commission work with real SQLite',()=>{
 const db=new Database(':memory:');
 try{
   db.exec('CREATE TABLE designer_profiles (id TEXT PRIMARY KEY,email TEXT,status TEXT)');
   const app=express();
   const pass=(_req,_res,next)=>next();
   installFoundingSchools({app,db,authAdmin:pass,requireAdminRequestOrigin:pass,rateLimit:()=>pass});
   db.prepare('INSERT INTO designer_profiles(id) VALUES (?)').run('student');
   db.prepare('INSERT INTO founding_school_applications(id,kind,name,email,school,status,created_at) VALUES (?,?,?,?,?,?,?)')
     .run('app1','student','Student','student@example.com','College','approved','2026-01-01T00:00:00Z');
   db.prepare('INSERT INTO founding_school_commissions(creator_id,rate_basis_points,application_id,assigned_at,assigned_by) VALUES (?,?,?,?,?)')
     .run('student',500,'app1','2026-01-01T00:00:00Z','owner');
   assert.equal(commissionBasisPoints(db,'student','2026-12-31T23:59:59Z'),500);
   assert.equal(commissionBasisPoints(db,'student','2027-01-01T00:00:00Z'),500);
   assert.equal(commissionBasisPoints(db,'other','2026-01-01T00:00:00Z'),700);
 }finally{db.close();}
});

test('application review and assignment enforce roles and recheck graduation window over HTTP',async()=>{
 const db=new Database(':memory:');
 db.exec('CREATE TABLE designer_profiles (id TEXT PRIMARY KEY,email TEXT,status TEXT)');
 db.prepare("INSERT INTO designer_profiles(id,email,status) VALUES (?,'grad@example.com','active')").run('creator-1');
 const app=express();
 app.use(express.json());
 const authAdmin=(req,res,next)=>{if(!req.headers['x-test-role'])return res.status(401).json({error:'unauthorized'});req.adminRole=req.headers['x-test-role'];req.adminActor='test';next();};
 const requireAdminRequestOrigin=(req,res,next)=>req.headers['x-test-origin']==='allowed'?next():res.status(403).json({error:'invalid_origin'});
 installFoundingSchools({app,db,authAdmin,requireAdminRequestOrigin,rateLimit:()=>((_req,_res,next)=>next())});
 const server=app.listen(0);
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/founding-schools';
  const request=async(path,role,body,origin='allowed')=>{
   const headers={'content-type':'application/json'};
   if(role)headers['x-test-role']=role;
   if(origin)headers['x-test-origin']=origin;
   const response=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
   return {status:response.status,data:await response.json()};
  };
  const listApplications=async(role)=>{const response=await fetch(base+'/admin/applications',{headers:role?{'x-test-role':role}:{}});return response.status;};
  assert.equal(await listApplications(null),401);
  assert.equal(await listApplications('viewer'),403);
  assert.equal(await listApplications('operator'),200);
  assert.equal(await listApplications('owner'),200);
  // Public endpoints must never reveal application totals or private applicant records.
  const publicPaths=['/','/stats','/applications','/applications/count','/admin/stats'];
  for(const path of publicPaths){
   const response=await fetch(base+path);
   const body=await response.text();
   assert.notEqual(response.status,200,'unexpected public listing at '+path);
   assert.doesNotMatch(body,/student@example.com|grad@example.com|applicationCount|totalApplications|waitlistCount/i);
  }
  const privateList=await fetch(base+'/admin/applications',{headers:{'x-test-role':'owner'}});
  assert.equal(privateList.status,200);
  assert.ok(Array.isArray((await privateList.json()).applications));
  assert.equal((await request('/admin/applications/not-found/review','operator',{status:'approved'})).status,404);
  assert.equal((await request('/admin/applications/not-found/review','viewer',{status:'approved'})).status,403);
  assert.equal((await request('/admin/applications/not-found/assign-creator','viewer',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).status,403);
  assert.equal((await request('/admin/applications/not-found/assign-creator','operator',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).status,403);
  assert.equal((await request('/admin/applications/not-found/assign-creator','owner',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'},'blocked')).status,403);
  const applied=await request('/applications',null,{kind:'student',name:'Recent Graduate',email:'grad@example.com',school:'Art College',academicStatus:'graduate',graduationDate:new Date().toISOString().slice(0,10)});
  assert.equal(applied.status,201);
  const id=applied.data.applicationId;
  assert.equal((await request('/admin/applications/'+id+'/review',null,{status:'approved'})).status,401);
  assert.equal((await request('/admin/applications/'+id+'/review','viewer',{status:'approved'})).status,403);
  assert.equal((await request('/admin/applications/'+id+'/review','owner',{status:'approved'},'blocked')).status,403);
  assert.equal((await request('/admin/applications/'+id+'/review','operator',{status:'approved'})).status,200);
  assert.equal((await request('/admin/applications/'+id+'/review','owner',{status:'approved'})).status,409);
  const assign='/admin/applications/'+id+'/assign-creator';
  assert.equal((await request(assign,'operator',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).status,403);
  assert.equal((await request(assign,'owner',{creatorId:'creator-1'})).status,400);
  db.prepare('UPDATE founding_school_applications SET graduation_date=? WHERE id=?').run('2020-01-01',id);
  const expired=await request(assign,'owner',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'});
  assert.equal(expired.status,409);
  assert.equal(expired.data.error,'graduation_outside_window');
  assert.equal(db.prepare('SELECT count(*) AS n FROM founding_school_commissions').get().n,0);
  db.prepare('UPDATE founding_school_applications SET graduation_date=? WHERE id=?').run(new Date().toISOString().slice(0,10),id);
  db.prepare("UPDATE designer_profiles SET email='other@example.com' WHERE id='creator-1'").run();
  assert.equal((await request(assign,'owner',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).data.error,'creator_email_mismatch');
  db.prepare("UPDATE designer_profiles SET email='grad@example.com' WHERE id='creator-1'").run();
  assert.equal((await request(assign,'owner',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).status,201);
  assert.equal(db.prepare("SELECT count(*) AS n FROM founding_school_audit WHERE action='commission_assigned'").get().n,1);
  assert.equal((await request(assign,'owner',{creatorId:'creator-1',eligibilityVerified:true,verificationNote:'Enrollment independently checked'})).status,409);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('graduation cutoff includes the exact 24-month calendar boundary and clamps leap days',()=>{const {graduationCutoff}=require('../lib/founding-schools');assert.equal(graduationCutoff(new Date('2026-10-23T15:00:00Z')).toISOString(),'2024-10-23T00:00:00.000Z');assert.equal(graduationCutoff(new Date('2024-02-29T15:00:00Z')).toISOString(),'2022-02-28T00:00:00.000Z');});
