'use strict';
const {randomUUID}=require('node:crypto');
module.exports=function mountHistory({app,db,authBuyer,authDesigner}){
 db.exec(`CREATE TABLE IF NOT EXISTS backstage_history_preferences(owner_role TEXT NOT NULL,owner_id TEXT NOT NULL,public_history INTEGER NOT NULL DEFAULT 0,allow_endorsements INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner_role,owner_id));
 CREATE TABLE IF NOT EXISTS backstage_endorsements(id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL,author_role TEXT NOT NULL,recipient_role TEXT NOT NULL,skill TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(inquiry_id,author_role,recipient_role,skill));
 CREATE TABLE IF NOT EXISTS backstage_endorsement_reports(id TEXT PRIMARY KEY,endorsement_id TEXT NOT NULL,reporter_role TEXT NOT NULL,reporter_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(endorsement_id,reporter_role,reporter_id));`);
 const skills=new Set(['Communication','Creative direction','Editorial styling','Runway production','Reliability','Teamwork','Makeup artistry','Hair styling','Photography','Design execution']);
 const err=(res,code,message)=>res.status(code).json({error:message});
 const owner=(role,req)=>role==='designer'?req.designerId:req.buyerSubject;
 const pref=(role,id)=>db.prepare('SELECT public_history,allow_endorsements FROM backstage_history_preferences WHERE owner_role=? AND owner_id=?').get(role,id)||{public_history:0,allow_endorsements:0};
 const completed=(q)=>q&&q.status==='accepted'&&q.booking_status==='completed'&&q.designer_approved===1&&q.creative_approved===1;
 const query=`SELECT i.id,i.status,b.status booking_status,c.designer_approved,c.creative_approved,i.designer_id,i.recipient_subject FROM creative_inquiries i JOIN creative_bookings b ON b.inquiry_id=i.id JOIN creative_booking_completion c ON c.inquiry_id=i.id WHERE i.id=?`;
 function routes(role,auth){
  const base='/api/creative-house/'+role+'-history',column=role==='designer'?'designer_id':'recipient_subject',other=role==='designer'?'creative':'designer';
  app.get(base,auth,(req,res)=>{
   const id=owner(role,req),p=pref(role,id);
   const rows=db.prepare(`SELECT i.id FROM creative_inquiries i JOIN creative_bookings b ON b.inquiry_id=i.id JOIN creative_booking_completion c ON c.inquiry_id=i.id WHERE i.${column}=? AND i.status='accepted' AND b.status='completed' AND c.designer_approved=1 AND c.creative_approved=1`).all(id);
   const endorsements=db.prepare(`SELECT e.skill,COUNT(*) count FROM backstage_endorsements e JOIN creative_inquiries i ON i.id=e.inquiry_id WHERE e.recipient_role=? AND i.${column}=? AND NOT EXISTS(SELECT 1 FROM backstage_endorsement_reports r WHERE r.endorsement_id=e.id) GROUP BY e.skill ORDER BY count DESC`).all(role,id);
   res.set('Cache-Control','no-store').json({preferences:p,completed_collaborations:rows.length,endorsements:p.allow_endorsements?endorsements:[]});
  });
  app.post(base+'/preferences',auth,(req,res)=>{
   if(typeof req.body?.public_history!=='boolean'||typeof req.body?.allow_endorsements!=='boolean')return err(res,400,'Boolean preferences required.');
   db.prepare('INSERT INTO backstage_history_preferences(owner_role,owner_id,public_history,allow_endorsements) VALUES(?,?,?,?) ON CONFLICT(owner_role,owner_id) DO UPDATE SET public_history=excluded.public_history,allow_endorsements=excluded.allow_endorsements').run(role,owner(role,req),Number(req.body.public_history),Number(req.body.allow_endorsements));
   res.json({preferences:pref(role,owner(role,req))});
  });
  app.post(base+'/:id/endorse',auth,(req,res)=>{
   const q=db.prepare(query).get(req.params.id);
   if(!completed(q)||q[column]!==owner(role,req))return err(res,404,'Completed collaboration not found.');
   const target=other,targetId=role==='designer'?q.recipient_subject:q.designer_id;
   if(!pref(target,targetId).allow_endorsements)return err(res,403,'Endorsements are disabled for this professional.');
   if(db.prepare('SELECT 1 FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').get(q.recipient_subject,q.designer_id))return err(res,403,'Collaboration unavailable.');
   const skill=req.body?.skill;if(!skills.has(skill))return err(res,400,'Choose a supported professional skill.');
   const exists=db.prepare('SELECT 1 FROM backstage_endorsements WHERE inquiry_id=? AND author_role=? AND recipient_role=? AND skill=?').get(q.id,role,target,skill);
   if(exists)return err(res,409,'Skill already endorsed for this collaboration.');
   db.prepare('INSERT INTO backstage_endorsements(id,inquiry_id,author_role,recipient_role,skill) VALUES(?,?,?,?,?)').run(randomUUID(),q.id,role,target,skill);
   res.status(201).json({endorsed:true});
  });
  app.post(base+'/endorsements/:id/report',auth,(req,res)=>{
   const e=db.prepare('SELECT e.id,i.designer_id,i.recipient_subject FROM backstage_endorsements e JOIN creative_inquiries i ON i.id=e.inquiry_id WHERE e.id=?').get(req.params.id);
   if(!e||e[column]!==owner(role,req))return err(res,404,'Endorsement not found.');
   const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
   if(reason.length<10||reason.length>500)return err(res,400,'Reason must be 10–500 characters.');
   db.prepare('INSERT OR IGNORE INTO backstage_endorsement_reports(id,endorsement_id,reporter_role,reporter_id,reason) VALUES(?,?,?,?,?)').run(randomUUID(),e.id,role,owner(role,req),reason);
   res.json({reported:true});
  });
 }
 routes('designer',authDesigner);routes('creative',authBuyer);
 app.get('/api/creative-house/professional-history/:role/:id',(req,res)=>{
  const {role,id}=req.params;if(!['creative','designer'].includes(role))return err(res,404,'Not found.');
  const p=pref(role,id);if(!p.public_history)return err(res,404,'History is private.');
  const column=role==='designer'?'designer_id':'recipient_subject';
  const completed=db.prepare(`SELECT COUNT(*) count,COUNT(DISTINCT ${role==='designer'?'i.recipient_subject':'i.designer_id'}) partners FROM creative_inquiries i JOIN creative_bookings b ON b.inquiry_id=i.id JOIN creative_booking_completion c ON c.inquiry_id=i.id WHERE i.${column}=? AND i.status='accepted' AND b.status='completed' AND c.designer_approved=1 AND c.creative_approved=1`).get(id);
  const endorsements=p.allow_endorsements?db.prepare(`SELECT e.skill,COUNT(*) count FROM backstage_endorsements e JOIN creative_inquiries i ON i.id=e.inquiry_id WHERE e.recipient_role=? AND i.${column}=? AND NOT EXISTS(SELECT 1 FROM backstage_endorsement_reports r WHERE r.endorsement_id=e.id) GROUP BY e.skill ORDER BY count DESC`).all(role,id):[];
  res.set('Cache-Control','no-store').json({completed_collaborations:completed.count,verified_partners:completed.partners,endorsements});
 });
};