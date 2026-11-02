'use strict';
const {randomUUID}=require('node:crypto');
module.exports=function mountMessages({app,db,authBuyer,authDesigner,notify}){
 db.exec(`CREATE TABLE IF NOT EXISTS creative_messages(id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL,sender_role TEXT NOT NULL CHECK(sender_role IN ('creative','designer')),body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS creative_messages_thread ON creative_messages(inquiry_id,created_at);
 CREATE TABLE IF NOT EXISTS creative_message_reads(inquiry_id TEXT NOT NULL,reader_role TEXT NOT NULL,last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(inquiry_id,reader_role));
 CREATE TABLE IF NOT EXISTS creative_message_reports(id TEXT PRIMARY KEY,message_id TEXT NOT NULL,inquiry_id TEXT NOT NULL,reporter_role TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const error=(res,status,message)=>res.status(status).json({error:message});
 function endpoints(role,auth){
  const owner=role==='creative'?'recipient_subject':'designer_id',identity=role==='creative'?'buyerSubject':'designerId';
  function find(req){return db.prepare('SELECT id,status,designer_id,recipient_subject FROM creative_inquiries WHERE id=? AND '+owner+'=?').get(req.params.id,req[identity]);}
  function allowed(q){return q&&q.status==='accepted'&&!db.prepare('SELECT 1 FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').get(q.recipient_subject,q.designer_id);}
  const base='/api/creative-house/'+(role==='creative'?'creative':'designer')+'-messages';
  app.get(base+'/unread',auth,(req,res)=>{
   const rows=db.prepare(`SELECT i.id inquiry_id,COUNT(m.id) unread FROM creative_inquiries i JOIN creative_messages m ON m.inquiry_id=i.id AND m.sender_role!=? LEFT JOIN creative_message_reads r ON r.inquiry_id=i.id AND r.reader_role=? WHERE i.`+owner+`=? AND i.status='accepted' AND NOT EXISTS(SELECT 1 FROM creative_inquiry_blocks b WHERE b.recipient_subject=i.recipient_subject AND b.designer_id=i.designer_id) AND (r.last_read_at IS NULL OR m.created_at>r.last_read_at) GROUP BY i.id`).all(role,role,req[identity]);
   res.set('Cache-Control','no-store').json({threads:rows,unread:rows.reduce((sum,row)=>sum+row.unread,0)});
  });
  app.get(base+'/:id',auth,(req,res)=>{
   const q=find(req);if(!q)return error(res,404,'Conversation not found.');
   if(!allowed(q))return error(res,403,'Conversation unavailable.');
   const messages=db.prepare('SELECT id,sender_role,body,created_at FROM creative_messages WHERE inquiry_id=? ORDER BY created_at ASC,id ASC LIMIT 200').all(q.id);
   res.set('Cache-Control','no-store').json({messages});
  });
  app.post(base+'/:id/read',auth,(req,res)=>{
   const q=find(req);if(!q)return error(res,404,'Conversation not found.');
   if(!allowed(q))return error(res,403,'Conversation unavailable.');
   db.prepare('INSERT INTO creative_message_reads(inquiry_id,reader_role,last_read_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(inquiry_id,reader_role) DO UPDATE SET last_read_at=CURRENT_TIMESTAMP').run(q.id,role);
   res.json({updated:true});
  });
  app.post(base+'/:id',auth,(req,res)=>{
   const q=find(req);if(!q)return error(res,404,'Conversation not found.');
   if(!allowed(q))return error(res,403,'Conversation unavailable.');
   const body=typeof req.body?.body==='string'?req.body.body.trim():'';
   if(body.length<1||body.length>2000)return error(res,400,'Message must be between 1 and 2000 characters.');
   const count=db.prepare("SELECT COUNT(*) n FROM creative_messages WHERE inquiry_id=? AND sender_role=? AND created_at>datetime('now','-1 hour')").get(q.id,role).n;
   if(count>=30)return error(res,429,'Message limit reached. Try again later.');
   const id=randomUUID();db.prepare('INSERT INTO creative_messages(id,inquiry_id,sender_role,body) VALUES(?,?,?,?)').run(id,q.id,role,body);
   notify({subject:role==='designer'?q.recipient_subject:null,designerId:role==='creative'?q.designer_id:null,inquiryId:q.id,kind:'new_message'});
   res.status(201).json({id,sent:true});
  });
  app.post(base+'/:id/report',auth,(req,res)=>{
   const q=find(req);if(!q)return error(res,404,'Conversation not found.');
   const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
   if(reason.length<5||reason.length>500)return error(res,400,'Provide a reason between 5 and 500 characters.');
   const message=db.prepare('SELECT id,sender_role FROM creative_messages WHERE id=? AND inquiry_id=?').get(req.body?.message_id,q.id);
   if(!message||message.sender_role===role)return error(res,404,'Message not found.');
   db.prepare('INSERT INTO creative_message_reports(id,message_id,inquiry_id,reporter_role,reason) VALUES(?,?,?,?,?)').run(randomUUID(),message.id,q.id,role,reason);
   res.status(201).json({reported:true});
  });
 }
 endpoints('creative',authBuyer);endpoints('designer',authDesigner);
};
