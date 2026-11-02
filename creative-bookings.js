'use strict';
const {randomUUID}=require('node:crypto');
module.exports=function mountBookings({app,db,authBuyer,authDesigner,notify}){
 db.exec(`CREATE TABLE IF NOT EXISTS creative_bookings(
 id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL UNIQUE,proposed_by TEXT NOT NULL CHECK(proposed_by IN ('designer','creative')),
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,timezone TEXT NOT NULL,location TEXT NOT NULL,
 compensation TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','declined','canceled','completed')),
 designer_confirmed INTEGER NOT NULL DEFAULT 0,creative_confirmed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS creative_bookings_inquiry ON creative_bookings(inquiry_id);`);
 const error=(res,code,message)=>res.status(code).json({error:message});
 const allowed=q=>q&&q.status==='accepted'&&!db.prepare('SELECT 1 FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').get(q.recipient_subject,q.designer_id);
 function routes(role,auth){
  const column=role==='designer'?'designer_id':'recipient_subject',key=role==='designer'?'designerId':'buyerSubject';
  const base='/api/creative-house/'+role+'-bookings';
  const inquiry=req=>db.prepare('SELECT id,status,designer_id,recipient_subject FROM creative_inquiries WHERE id=? AND '+column+'=?').get(req.params.id,req[key]);
  const getBooking=id=>db.prepare('SELECT * FROM creative_bookings WHERE inquiry_id=?').get(id);
  const notifyOther=q=>notify({subject:role==='designer'?q.recipient_subject:null,designerId:role==='creative'?q.designer_id:null,inquiryId:q.id,kind:'booking_update'});
  app.get(base,auth,(req,res)=>{
   const rows=db.prepare('SELECT b.* FROM creative_bookings b JOIN creative_inquiries i ON i.id=b.inquiry_id WHERE i.'+column+'=? ORDER BY b.updated_at DESC LIMIT 100').all(req[key]);
   res.set('Cache-Control','no-store').json({bookings:rows});
  });
  app.get(base+'/:id',auth,(req,res)=>{
   const q=inquiry(req);if(!q)return error(res,404,'Inquiry not found.');
   if(!allowed(q))return error(res,403,'Booking unavailable.');
   res.set('Cache-Control','no-store').json({booking:getBooking(q.id)||null});
  });
  app.post(base+'/:id/propose',auth,(req,res)=>{
   const q=inquiry(req);if(!q)return error(res,404,'Inquiry not found.');
   if(!allowed(q))return error(res,403,'Booking unavailable.');
   const v=req.body||{},starts_at=typeof v.starts_at==='string'?v.starts_at.trim():'',ends_at=typeof v.ends_at==='string'?v.ends_at.trim():'',timezone=typeof v.timezone==='string'?v.timezone.trim():'',location=typeof v.location==='string'?v.location.trim():'',compensation=typeof v.compensation==='string'?v.compensation.trim():'',details=typeof v.details==='string'?v.details.trim():'';
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(starts_at)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(ends_at)||!Number.isFinite(Date.parse(starts_at))||!Number.isFinite(Date.parse(ends_at))||Date.parse(ends_at)<=Date.parse(starts_at)||Date.parse(starts_at)<=Date.now())return error(res,400,'Provide valid future start and end times with timezone offsets.');
   if(timezone.length<2||timezone.length>80||location.length<3||location.length>200||compensation.length<2||compensation.length>200||details.length>1000)return error(res,400,'Invalid booking details.');
   const old=getBooking(q.id);
   if(old&&!['proposed','declined','canceled'].includes(old.status))return error(res,409,'This booking cannot be revised.');
   if(old&&old.proposed_by!==role&&old.status==='proposed')return error(res,409,'Respond to the existing proposal before revising.');
   db.prepare(`INSERT INTO creative_bookings(id,inquiry_id,proposed_by,starts_at,ends_at,timezone,location,compensation,details,status,designer_confirmed,creative_confirmed) VALUES(?,?,?,?,?,?,?,?,?,'proposed',?,?)
    ON CONFLICT(inquiry_id) DO UPDATE SET proposed_by=excluded.proposed_by,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,location=excluded.location,compensation=excluded.compensation,details=excluded.details,status='proposed',designer_confirmed=excluded.designer_confirmed,creative_confirmed=excluded.creative_confirmed,updated_at=CURRENT_TIMESTAMP`).run(old?.id||randomUUID(),q.id,role,starts_at,ends_at,timezone,location,compensation,details,role==='designer'?1:0,role==='creative'?1:0);
   notifyOther(q);res.status(201).json({booking:getBooking(q.id)});
  });
  app.post(base+'/:id/decision',auth,(req,res)=>{
   const q=inquiry(req);if(!q)return error(res,404,'Inquiry not found.');
   if(!allowed(q))return error(res,403,'Booking unavailable.');
   const booking=getBooking(q.id),decision=req.body?.decision;
   if(!booking)return error(res,404,'Booking not found.');
   if(!['confirm','decline','cancel','complete'].includes(decision))return error(res,400,'Invalid booking decision.');
   if(decision==='confirm'&&(booking.status!=='proposed'||booking.proposed_by===role))return error(res,409,'Only the other participant can confirm a proposal.');
   if(decision==='decline'&&booking.status!=='proposed')return error(res,409,'Only proposed bookings can be declined.');
   if(decision==='cancel'&&!['proposed','confirmed'].includes(booking.status))return error(res,409,'Booking cannot be canceled.');
   if(decision==='complete'&&booking.status!=='confirmed')return error(res,409,'Only confirmed bookings can be completed.');
   const status=decision==='confirm'?'confirmed':decision==='decline'?'declined':decision==='cancel'?'canceled':'completed';
   db.prepare('UPDATE creative_bookings SET status=?,designer_confirmed=?,creative_confirmed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,decision==='confirm'||booking.designer_confirmed?1:0,decision==='confirm'||booking.creative_confirmed?1:0,booking.id);
   notifyOther(q);res.json({booking:getBooking(q.id)});
  });
 }
 routes('designer',authDesigner);routes('creative',authBuyer);
};