const {randomUUID}=require('node:crypto');
const OPEN_TO=['collaborations','paid-work','fashion-shows','commissions','mentorship','wedding-attire','repairs-alterations'];
const PROJECTS=['photo-shoot','fashion-show','collection','commission','mentorship','wedding-attire','repairs-alterations','other'];
function createCreativeNetworking({app,db,authBuyer,origin,rateLimit}){
 db.exec(`CREATE TABLE IF NOT EXISTS creative_network_preferences(owner_subject TEXT PRIMARY KEY,open_to TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS creative_inquiry_blocks(recipient_subject TEXT NOT NULL,designer_id TEXT NOT NULL,PRIMARY KEY(recipient_subject,designer_id));
 CREATE TABLE IF NOT EXISTS creative_inquiry_reports(inquiry_id TEXT PRIMARY KEY,recipient_subject TEXT NOT NULL,support_id TEXT NOT NULL);`);
 const preferences=subject=>JSON.parse(db.prepare('SELECT open_to FROM creative_network_preferences WHERE owner_subject=?').get(subject)?.open_to||'[]');
 const validPreferences=v=>v===undefined||(Array.isArray(v)&&v.length<=OPEN_TO.length&&v.every(x=>OPEN_TO.includes(x)));
 function savePreferences(subject,v){if(v!==undefined)db.prepare('INSERT INTO creative_network_preferences VALUES(?,?) ON CONFLICT(owner_subject) DO UPDATE SET open_to=excluded.open_to').run(subject,JSON.stringify([...new Set(v)]));}
 function decorate(profile,kind){if(!profile)return null;const table=kind==='talent'?'creative_profiles':'creative_event_profiles';const owner=db.prepare('SELECT owner_subject FROM '+table+' WHERE slug=?').get(profile.slug);return {...profile,openTo:owner?preferences(owner.owner_subject):[]};}
 const error=(res,status,message)=>res.status(status).json({error:message});
 const limit=rateLimit({windowMs:3600000,max:30,keyPrefix:'creative-safety'});
 app.use('/api/creative-house/my-inquiries',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.post('/api/creative-house/my-inquiries/:id/block',origin,authBuyer,limit,(req,res)=>{
  const row=db.prepare('SELECT designer_id FROM creative_inquiries WHERE id=? AND recipient_subject=?').get(req.params.id,req.buyerSubject);if(!row)return error(res,404,'Inquiry not found.');
  db.prepare('INSERT OR IGNORE INTO creative_inquiry_blocks VALUES(?,?)').run(req.buyerSubject,row.designer_id);
  db.prepare("UPDATE creative_inquiries SET status='declined' WHERE recipient_subject=? AND designer_id=? AND status='pending'").run(req.buyerSubject,row.designer_id);res.json({blocked:true});
 });
 app.post('/api/creative-house/my-inquiries/:id/unblock',origin,authBuyer,limit,(req,res)=>{
  const row=db.prepare('SELECT designer_id FROM creative_inquiries WHERE id=? AND recipient_subject=?').get(req.params.id,req.buyerSubject);if(!row)return error(res,404,'Inquiry not found.');
  db.prepare('DELETE FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').run(req.buyerSubject,row.designer_id);res.json({blocked:false});
 });
 app.post('/api/creative-house/my-inquiries/:id/report',origin,authBuyer,limit,(req,res)=>{
  const row=db.prepare('SELECT * FROM creative_inquiries WHERE id=? AND recipient_subject=?').get(req.params.id,req.buyerSubject);if(!row)return error(res,404,'Inquiry not found.');
  const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';if(reason.length<5||reason.length>500)return error(res,422,'Explain the concern in 5–500 characters.');
  const existing=db.prepare('SELECT support_id FROM creative_inquiry_reports WHERE inquiry_id=? AND recipient_subject=?').get(row.id,req.buyerSubject);if(existing)return res.json({reported:true});
  db.transaction(()=>{const id=randomUUID();db.prepare('INSERT INTO support_messages(id,buyer_subject,buyer_email,category,message,created_at) VALUES(?,?,?,?,?,?)').run(id,req.buyerSubject,req.buyerEmail||null,'creative_safety',`Creative inquiry ${row.id}; sender designer ${row.designer_id}. Concern: ${reason}\nSubject: ${row.subject}\nMessage: ${row.message}`.slice(0,2400),new Date().toISOString());db.prepare('INSERT INTO creative_inquiry_reports VALUES(?,?,?)').run(row.id,req.buyerSubject,id);}) ();res.json({reported:true});
 });
 return {validPreferences,savePreferences,decorate,blocked:(subject,designer)=>Boolean(db.prepare('SELECT 1 FROM creative_inquiry_blocks WHERE recipient_subject=? AND designer_id=?').get(subject,designer))};
}
function collaborationDetails(v){
 const fields=['projectType','compensation','budget','projectLocation','startDate','endDate'];
 if(!fields.some(k=>v[k]!==undefined))return {details:null};
 const clean=(key,max)=>typeof v[key]==='string'&&v[key].trim().length<=max?v[key].trim():'';
 const data={projectType:clean('projectType',40),compensation:clean('compensation',20),budget:clean('budget',160),projectLocation:clean('projectLocation',160),startDate:clean('startDate',10),endDate:clean('endDate',10)};
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!PROJECTS.includes(data.projectType)||!['paid','unpaid','negotiable'].includes(data.compensation)||!data.budget||!data.projectLocation||!date(data.startDate)||(data.endDate&&(!date(data.endDate)||data.endDate<data.startDate)))return {error:'Add project type, compensation, budget or exchange terms, city/remote location, and valid project dates.'};
 return {details:data};
}
module.exports={createCreativeNetworking,collaborationDetails,OPEN_TO,PROJECTS};
