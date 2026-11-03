'use strict';
const {randomUUID}=require('node:crypto');
module.exports=function mountBookings({app,db,authBuyer,authDesigner,notify}){
 db.exec(`CREATE TABLE IF NOT EXISTS creative_bookings(
 id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL UNIQUE,proposed_by TEXT NOT NULL CHECK(proposed_by IN ('designer','creative')),
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,timezone TEXT NOT NULL,location TEXT NOT NULL,
 compensation TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','declined','canceled','completed')),
 designer_confirmed INTEGER NOT NULL DEFAULT 0,creative_confirmed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS creative_bookings_inquiry ON creative_bookings(inquiry_id);
 CREATE TABLE IF NOT EXISTS creative_booking_completion(inquiry_id TEXT PRIMARY KEY,designer_approved INTEGER NOT NULL DEFAULT 0,creative_approved INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS creative_booking_reminders(inquiry_id TEXT NOT NULL,reminder_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(inquiry_id,reminder_type));
 CREATE TABLE IF NOT EXISTS creative_booking_notifications(id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL,recipient_subject TEXT,designer_id TEXT,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 // Existing installations retain the legacy reminder table; use a new occurrence-scoped ledger.
 db.exec(`CREATE TABLE IF NOT EXISTS creative_booking_reminder_deliveries(inquiry_id TEXT NOT NULL,booking_version TEXT NOT NULL,reminder_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(inquiry_id,booking_version,reminder_type));`);
 const notificationColumns=db.prepare('PRAGMA table_info(creative_booking_notifications)').all().map(row=>row.name);
 if(!notificationColumns.includes('event_type'))db.exec("ALTER TABLE creative_booking_notifications ADD COLUMN event_type TEXT NOT NULL DEFAULT 'booking_update'");
 if(!db.prepare('PRAGMA table_info(creative_bookings)').all().some(row=>row.name==='booking_version'))db.exec("ALTER TABLE creative_bookings ADD COLUMN booking_version TEXT NOT NULL DEFAULT ''");
 const error=(res,code,message)=>res.status(code).json({error:message});
 const allowed=q=>q&&q.status==='accepted'&&!db.prepare('SELECT 1 FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').get(q.recipient_subject,q.designer_id);
 function routes(role,auth){
  const column=role==='designer'?'designer_id':'recipient_subject',key=role==='designer'?'designerId':'buyerSubject';
  const base='/api/creative-house/'+role+'-bookings';
  const inquiry=req=>db.prepare('SELECT id,status,designer_id,recipient_subject FROM creative_inquiries WHERE id=? AND '+column+'=?').get(req.params.id,req[key]);
  const getBooking=id=>db.prepare('SELECT * FROM creative_bookings WHERE inquiry_id=?').get(id);
  const notice=db.prepare('INSERT INTO creative_booking_notifications(id,inquiry_id,recipient_subject,designer_id,event_type) VALUES(?,?,?,?,?)');
  const notifyBoth=(q,type='booking_update')=>{notice.run(randomUUID(),q.id,q.recipient_subject,null,type);notice.run(randomUUID(),q.id,null,q.designer_id,type);};
  const notifyOther=(q,type='booking_update')=>notice.run(randomUUID(),q.id,role==='designer'?q.recipient_subject:null,role==='creative'?q.designer_id:null,type);
  app.post(base+'/:id/completion',auth,(req,res)=>{
   const q=inquiry(req);if(!q)return error(res,404,'Inquiry not found.');
   if(!allowed(q))return error(res,403,'Booking unavailable.');
   const result=db.transaction(()=>{
    const booking=getBooking(q.id);
    if(!booking||booking.status!=='confirmed')return {error:'Only confirmed bookings can be completed.'};
    if(!Number.isFinite(Date.parse(booking.ends_at))||Date.parse(booking.ends_at)>Date.now())return {error:'Wait until the booking ends.'};
    db.prepare('INSERT OR IGNORE INTO creative_booking_completion(inquiry_id) VALUES(?)').run(q.id);
    const field=role==='designer'?'designer_approved':'creative_approved';
    const changed=db.prepare('UPDATE creative_booking_completion SET '+field+'=1,updated_at=CURRENT_TIMESTAMP WHERE inquiry_id=? AND '+field+'=0').run(q.id).changes;
    const completion=db.prepare('SELECT * FROM creative_booking_completion WHERE inquiry_id=?').get(q.id);
    if(changed){
     if(completion.designer_approved&&completion.creative_approved){
      db.prepare("UPDATE creative_bookings SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE inquiry_id=? AND status='confirmed'").run(q.id);
      notifyBoth(q,'booking_completed');
     }else notifyOther(q,'completion_approved');
    }
    return {booking:getBooking(q.id),completion};
   })();
   if(result.error)return error(res,409,result.error);
   res.json(result);
  });
  app.get(base+'/notifications',auth,(req,res)=>{const rows=db.prepare('SELECT id,inquiry_id,event_type,read_at,created_at FROM creative_booking_notifications WHERE '+(role==='designer'?'designer_id':'recipient_subject')+'=? ORDER BY created_at DESC LIMIT 100').all(req[key]);res.set('Cache-Control','no-store').json({notifications:rows,unread:rows.filter(row=>!row.read_at).length});});
  app.post(base+'/notifications/:notificationId/read',auth,(req,res)=>{const updated=db.prepare('UPDATE creative_booking_notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND '+(role==='designer'?'designer_id':'recipient_subject')+'=?').run(req.params.notificationId,req[key]);res.json({updated:!!updated.changes});});
  app.get(base,auth,(req,res)=>{
   const rows=db.prepare('SELECT b.* FROM creative_bookings b JOIN creative_inquiries i ON i.id=b.inquiry_id WHERE i.'+column+`=? AND i.status='accepted' AND NOT EXISTS(SELECT 1 FROM creative_inquiry_blocks block WHERE block.recipient_subject=i.recipient_subject AND block.designer_id=i.designer_id) ORDER BY b.updated_at DESC LIMIT 100`).all(req[key]);
   res.set('Cache-Control','no-store').json({bookings:rows});
  });
  app.get(base+'/:id',auth,(req,res)=>{
   const q=inquiry(req);if(!q)return error(res,404,'Inquiry not found.');
   if(!allowed(q))return error(res,403,'Booking unavailable.');
   res.set('Cache-Control','no-store').json({booking:getBooking(q.id)||null,completion:db.prepare('SELECT * FROM creative_booking_completion WHERE inquiry_id=?').get(q.id)||null});
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
   db.transaction(()=>{
   db.prepare(`INSERT INTO creative_bookings(id,inquiry_id,proposed_by,starts_at,ends_at,timezone,location,compensation,details,status,designer_confirmed,creative_confirmed,booking_version) VALUES(?,?,?,?,?,?,?,?,?,'proposed',?,?,?)
    ON CONFLICT(inquiry_id) DO UPDATE SET proposed_by=excluded.proposed_by,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,location=excluded.location,compensation=excluded.compensation,details=excluded.details,status='proposed',designer_confirmed=excluded.designer_confirmed,creative_confirmed=excluded.creative_confirmed,updated_at=CURRENT_TIMESTAMP,booking_version=excluded.booking_version`).run(old?.id||randomUUID(),q.id,role,starts_at,ends_at,timezone,location,compensation,details,role==='designer'?1:0,role==='creative'?1:0,randomUUID());
   db.prepare('DELETE FROM creative_booking_completion WHERE inquiry_id=?').run(q.id);
   notifyOther(q,'booking_proposed');
   })();res.status(201).json({booking:getBooking(q.id)});
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
   if(decision==='complete')return error(res,400,'Use mutual completion confirmation.');
   const status=decision==='confirm'?'confirmed':decision==='decline'?'declined':decision==='cancel'?'canceled':'completed';
   const result=db.transaction(()=>{
    const current=getBooking(q.id);
    if(current.status!==booking.status)return false;
    const changed=db.prepare('UPDATE creative_bookings SET status=?,designer_confirmed=?,creative_confirmed=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').run(status,decision==='confirm'||booking.designer_confirmed?1:0,decision==='confirm'||booking.creative_confirmed?1:0,booking.id,booking.status).changes;
    if(!changed)return false;
    if(decision==='cancel')notifyBoth(q,'booking_canceled');else notifyOther(q,'booking_'+status);
    return true;
   })();
   if(!result)return error(res,409,'Booking status changed. Refresh and try again.');
   res.json({booking:getBooking(q.id)});
  });
 }
 routes('designer',authDesigner);routes('creative',authBuyer);
 function dispatchReminders(now=new Date()){
  const nowMs=now.getTime(),windowEnd=nowMs+24*60*60*1000;
  const rows=db.prepare("SELECT b.inquiry_id,b.starts_at,b.booking_version,i.recipient_subject,i.designer_id FROM creative_bookings b JOIN creative_inquiries i ON i.id=b.inquiry_id WHERE b.status='confirmed' AND i.status='accepted' AND NOT EXISTS(SELECT 1 FROM creative_inquiry_blocks block WHERE block.recipient_subject=i.recipient_subject AND block.designer_id=i.designer_id)").all();
  const insert=db.prepare("INSERT OR IGNORE INTO creative_booking_reminder_deliveries(inquiry_id,booking_version,reminder_type) VALUES(?,?,'24h')");
  const notice=db.prepare('INSERT INTO creative_booking_notifications(id,inquiry_id,recipient_subject,designer_id,event_type) VALUES(?,?,?,?,?)');
  const dispatch=db.transaction(q=>{
   const current=db.prepare("SELECT starts_at,booking_version,status FROM creative_bookings WHERE inquiry_id=?").get(q.inquiry_id);
   if(!current||current.status!=='confirmed'||current.starts_at!==q.starts_at||current.booking_version!==q.booking_version)return;
   if(!insert.run(q.inquiry_id,q.booking_version).changes)return;
   notice.run(randomUUID(),q.inquiry_id,q.recipient_subject,null,'booking_reminder_24h');
   notice.run(randomUUID(),q.inquiry_id,null,q.designer_id,'booking_reminder_24h');
  });
  for(const q of rows){
   const start=Date.parse(q.starts_at);
   if(!Number.isFinite(start)||start<=nowMs||start>windowEnd)continue;
   dispatch(q);
  }
 }
 dispatchReminders();
 const reminderTimer=setInterval(()=>{try{dispatchReminders();}catch(err){console.error('Booking reminder dispatch failed',err);}},15*60*1000);
 reminderTimer.unref?.();
 return {dispatchReminders};
};
