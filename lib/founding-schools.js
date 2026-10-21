'use strict';
const crypto = require('node:crypto');
const express = require('express');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const id = ()=>crypto.randomUUID();
const now = ()=>new Date().toISOString();
function installFoundingSchools({app,db,authAdmin,requireAdminRequestOrigin,rateLimit}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS founding_school_applications (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('student','school')),
      name TEXT NOT NULL, email TEXT NOT NULL, school TEXT NOT NULL,
      discipline TEXT, academic_status TEXT, graduation_date TEXT, portfolio TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at TEXT NOT NULL, reviewed_at TEXT, reviewer TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_founding_school_applications_status ON founding_school_applications(status,created_at);
    CREATE TABLE IF NOT EXISTS founding_creator_assignments (creator_id TEXT PRIMARY KEY, founder_number INTEGER NOT NULL UNIQUE CHECK(founder_number BETWEEN 1 AND 50), assigned_at TEXT NOT NULL, assigned_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS founding_school_commissions (
      creator_id TEXT PRIMARY KEY, rate_basis_points INTEGER NOT NULL CHECK(rate_basis_points=500),
      application_id TEXT NOT NULL UNIQUE REFERENCES founding_school_applications(id),
      assigned_at TEXT NOT NULL, assigned_by TEXT NOT NULL
    );
  `);
  const router=express.Router();
  router.post('/applications',rateLimit({windowMs:60*60*1000,max:5,keyPrefix:'school-applications'}),(req,res)=>{
    const b=req.body||{},kind=clean(b.kind,10),name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),school=clean(b.school,160);
    if(!['student','school'].includes(kind)||name.length<2||!EMAIL.test(email)||school.length<2) return res.status(400).json({error:'invalid_application'});
    const academic=clean(b.academicStatus,20),graduation=clean(b.graduationDate,10);
    if(kind==='student'){
      if(!['enrolled','graduate'].includes(academic))return res.status(400).json({error:'invalid_academic_status'});
      if(academic==='graduate'){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(graduation))return res.status(400).json({error:'invalid_graduation_date'});
        const date=new Date(graduation+'T00:00:00Z'),today=new Date(),threshold=new Date();
        threshold.setUTCMonth(threshold.getUTCMonth()-24);
        if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==graduation||date>today||date<threshold)return res.status(400).json({error:'graduation_outside_window'});
      }
    }
    const portfolio=clean(b.portfolio,500);
    if(portfolio){try{const u=new URL(portfolio);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{return res.status(400).json({error:'invalid_portfolio'});}}
    const applicationId=id();
    db.prepare('INSERT INTO founding_school_applications(id,kind,name,email,school,discipline,academic_status,graduation_date,portfolio,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(applicationId,kind,name,email,school,kind==='student'?clean(b.discipline,60):null,kind==='student'?academic:null,academic==='graduate'?graduation:null,portfolio||null,now());
    return res.status(201).json({applicationId,status:'pending',message:'Application received for review; no commission is assigned yet.'});
  });
  router.get('/admin/applications',authAdmin,(req,res)=>{
    if(!['owner','operator'].includes(req.adminRole))return res.status(403).json({error:'forbidden'});
    const status=clean(req.query.status,20);
    const rows=db.prepare('SELECT * FROM founding_school_applications WHERE (? = \'\' OR status=?) ORDER BY created_at DESC LIMIT 200').all(status,status);
    return res.json({applications:rows});
  });
  router.post('/admin/applications/:id/review',authAdmin,requireAdminRequestOrigin,(req,res)=>{
    if(!['owner','operator'].includes(req.adminRole))return res.status(403).json({error:'forbidden'});
    const status=clean(req.body?.status,20);
    if(!['approved','rejected'].includes(status))return res.status(400).json({error:'invalid_status'});
    const row=db.prepare('SELECT id,status FROM founding_school_applications WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'not_found'});
    if(row.status!=='pending')return res.status(409).json({error:'already_reviewed'});
    db.prepare('UPDATE founding_school_applications SET status=?,reviewed_at=?,reviewer=? WHERE id=?').run(status,now(),req.adminActor||'admin',row.id);
    return res.json({ok:true,status,commissionAssigned:false});
  });
  router.post('/admin/applications/:id/assign-creator',authAdmin,requireAdminRequestOrigin,(req,res)=>{
    if(req.adminRole!=='owner')return res.status(403).json({error:'owner_required'});
    const creatorId=clean(req.body?.creatorId,100);
    if(!creatorId)return res.status(400).json({error:'creator_required'});
    if(req.body?.eligibilityVerified!==true)return res.status(400).json({error:'eligibility_verification_required'});
    try {
      const result=db.transaction(()=>{
        const application=db.prepare('SELECT * FROM founding_school_applications WHERE id=?').get(req.params.id);
        if(!application||application.kind!=='student'||application.status!=='approved')throw new Error('approved_student_application_required');
        if(application.academic_status==='graduate'){
          const graduation=application.graduation_date;
          const date=/^\d{4}-\d{2}-\d{2}$/.test(graduation||'')?new Date(graduation+'T00:00:00Z'):new Date(NaN);
          const today=new Date(),threshold=new Date(today);
          threshold.setUTCMonth(threshold.getUTCMonth()-24);
          if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==graduation||date>today||date<threshold)throw new Error('graduation_outside_window');
        }
        if(!db.prepare('SELECT id FROM designer_profiles WHERE id=?').get(creatorId))throw new Error('creator_not_found');
        const prior=db.prepare('SELECT creator_id FROM founding_school_commissions WHERE creator_id=? OR application_id=?').get(creatorId,application.id);
        if(prior)throw new Error('assignment_exists');
        // A school partnership is not required for independently verified student eligibility.
        // Manual approval must include out-of-band enrollment/graduation verification.
        db.prepare('INSERT INTO founding_school_commissions(creator_id,rate_basis_points,application_id,assigned_at,assigned_by) VALUES(?,?,?,?,?)')
          .run(creatorId,500,application.id,now(),req.adminActor||'owner');
        return {creatorId,rateBasisPoints:500};
      })();
      return res.status(201).json(result);
    } catch(err) {return res.status(409).json({error:err.message||'assignment_failed'});}
  });
  app.use('/api/founding-schools',router);
}
module.exports={installFoundingSchools};
