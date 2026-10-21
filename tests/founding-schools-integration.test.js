'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const express=require('express');
const {installFoundingSchools}=require('../lib/founding-schools');
const {installGeneralFounders}=require('../lib/general-founders');
const {commissionBasisPoints}=require('../lib/creator-commissions');

test('founder schema and 12-month student commission work with real SQLite',()=>{
 const db=new Database(':memory:');
 try{
   db.exec('CREATE TABLE designer_profiles (id TEXT PRIMARY KEY)');
   const app=express();
   const pass=(_req,_res,next)=>next();
   installFoundingSchools({app,db,authAdmin:pass,requireAdminRequestOrigin:pass,rateLimit:()=>pass});
   installGeneralFounders({app,db,authAdmin:pass,requireAdminRequestOrigin:pass});
   db.prepare('INSERT INTO designer_profiles(id) VALUES (?)').run('student');
   db.prepare('INSERT INTO designer_profiles(id) VALUES (?)').run('founder');
   db.prepare('INSERT INTO founding_school_applications(id,kind,name,email,school,status,created_at) VALUES (?,?,?,?,?,?,?)')
     .run('app1','student','Student','student@example.com','College','approved','2026-01-01T00:00:00Z');
   db.prepare('INSERT INTO founding_school_commissions(creator_id,rate_basis_points,application_id,assigned_at,assigned_by) VALUES (?,?,?,?,?)')
     .run('student',500,'app1','2026-01-01T00:00:00Z','owner');
   db.prepare('INSERT INTO founding_creator_assignments(creator_id,founder_number,assigned_at,assigned_by) VALUES (?,?,?,?)')
     .run('founder',1,'2026-01-01T00:00:00Z','owner');
   assert.equal(commissionBasisPoints(db,'student','2026-12-31T23:59:59Z'),500);
   assert.equal(commissionBasisPoints(db,'student','2027-01-01T00:00:00Z'),700);
   assert.equal(commissionBasisPoints(db,'founder','2030-01-01T00:00:00Z'),500);
   assert.equal(commissionBasisPoints(db,'other','2026-01-01T00:00:00Z'),700);
   assert.throws(()=>db.prepare('INSERT INTO founding_creator_assignments(creator_id,founder_number,assigned_at,assigned_by) VALUES (?,?,?,?)').run('duplicate',1,'2026-01-01','owner'));
 }finally{db.close();}
});
