'use strict';
const crypto=require('node:crypto');
module.exports=function mountCreativeNotifications({app,db,authBuyer,authDesigner}){
 db.exec(`CREATE TABLE IF NOT EXISTS creative_notifications (
 id TEXT PRIMARY KEY, recipient_subject TEXT, designer_id TEXT, inquiry_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('new_inquiry','inquiry_response')),
 read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS creative_notifications_recipient ON creative_notifications(recipient_subject,created_at);
 CREATE INDEX IF NOT EXISTS creative_notifications_designer ON creative_notifications(designer_id,created_at);`);
 function notify({subject,designerId,inquiryId,kind}){
  db.prepare('INSERT INTO creative_notifications(id,recipient_subject,designer_id,inquiry_id,kind) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),subject||null,designerId||null,inquiryId,kind);
 }
 function endpoints(prefix,auth,ownerColumn,ownerKey){
  app.get('/api/creative-house/'+prefix,auth,(req,res)=>{
   const rows=db.prepare('SELECT id,inquiry_id,kind,read_at,created_at FROM creative_notifications WHERE '+ownerColumn+'=? ORDER BY created_at DESC LIMIT 100').all(req[ownerKey]);
   res.set('Cache-Control','no-store').json({notifications:rows,unread:rows.filter(x=>!x.read_at).length});
  });
  app.post('/api/creative-house/'+prefix+'/:id/read',auth,(req,res)=>{
   const updated=db.prepare('UPDATE creative_notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND '+ownerColumn+'=? AND read_at IS NULL').run(req.params.id,req[ownerKey]);
   res.json({updated:Boolean(updated.changes)});
  });
 }
 endpoints('notifications',authBuyer,'recipient_subject','buyerSubject');
 endpoints('designer-notifications',authDesigner,'designer_id','designerId');
 return {notify};
};
