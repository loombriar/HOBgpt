const crypto=require('node:crypto');
function mountSewingServices({app,db,authBuyer,authDesigner,origin,limiter}){
 db.exec(`CREATE TABLE IF NOT EXISTS sewing_service_profiles(owner_subject TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,location TEXT NOT NULL,bio TEXT NOT NULL,services_json TEXT NOT NULL,modes_json TEXT NOT NULL,lead_time TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sewing_service_requests(id TEXT PRIMARY KEY,provider_id TEXT NOT NULL,requester_subject TEXT NOT NULL,requester_email TEXT NOT NULL,title TEXT NOT NULL,details TEXT NOT NULL,service TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS designer_services(designer_id TEXT PRIMARY KEY,services_json TEXT NOT NULL DEFAULT '[]',details TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);`);
 const taxonomy=require('./shared/taxonomy.json'),services=taxonomy.sewingServices.map(x=>x.value),modes=taxonomy.serviceModes.map(x=>x.value);
 const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 const selected=(v,allowed)=>Array.isArray(v)&&v.every(x=>allowed.includes(x))?[...new Set(v)]:null;
 const profile=r=>({id:r.id,displayName:r.display_name,location:r.location,bio:r.bio,services:JSON.parse(r.services_json),modes:JSON.parse(r.modes_json),leadTime:r.lead_time,published:!!r.published});
 app.get('/api/sewing-services',(_req,res)=>res.json({profiles:db.prepare('SELECT * FROM sewing_service_profiles WHERE published=1 ORDER BY updated_at DESC LIMIT 200').all().map(profile)}));
 app.get('/api/my/sewing-services',authBuyer,(req,res)=>{const row=db.prepare('SELECT * FROM sewing_service_profiles WHERE owner_subject=?').get(req.buyerSubject);res.json({profile:row?profile(row):null});});
 app.put('/api/my/sewing-services',origin,authBuyer,limiter,(req,res)=>{
  const v=req.body||{},name=clean(v.displayName,100),location=clean(v.location,160),bio=clean(v.bio,1600),lead=clean(v.leadTime,160),skills=selected(v.services,services),ways=selected(v.modes,modes);
  if(!name||!location||bio.length<30||!skills?.length||!ways?.length||typeof v.published!=='boolean')return res.status(422).json({error:{message:'Add your name, city or service area, at least 30 characters about your work, services, and how you work.'}});
  const old=db.prepare('SELECT id FROM sewing_service_profiles WHERE owner_subject=?').get(req.buyerSubject),id=old?.id||crypto.randomUUID();
  db.prepare(`INSERT INTO sewing_service_profiles VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_subject) DO UPDATE SET display_name=excluded.display_name,location=excluded.location,bio=excluded.bio,services_json=excluded.services_json,modes_json=excluded.modes_json,lead_time=excluded.lead_time,published=excluded.published,updated_at=excluded.updated_at`).run(req.buyerSubject,id,name,location,bio,JSON.stringify(skills),JSON.stringify(ways),lead,v.published?1:0,new Date().toISOString());
  res.json({profile:profile(db.prepare('SELECT * FROM sewing_service_profiles WHERE id=?').get(id))});
 });
 app.post('/api/sewing-services/:id/requests',origin,authBuyer,limiter,(req,res)=>{
  const provider=db.prepare('SELECT * FROM sewing_service_profiles WHERE id=? AND published=1').get(req.params.id),v=req.body||{};
  if(!provider)return res.status(404).json({error:{message:'Service profile not found.'}});
  if(provider.owner_subject===req.buyerSubject)return res.status(422).json({error:{message:'Choose another service provider.'}});
  const title=clean(v.title,120),details=clean(v.details,2000);
  if(title.length<5||details.length<30||!JSON.parse(provider.services_json).includes(v.service)||!JSON.parse(provider.modes_json).includes(v.mode))return res.status(422).json({error:{message:'Choose an offered service and working arrangement, a title, and at least 30 characters about the work.'}});
  const id=crypto.randomUUID();db.prepare('INSERT INTO sewing_service_requests(id,provider_id,requester_subject,requester_email,title,details,service,mode,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,provider.id,req.buyerSubject,req.buyerEmail||'',title,details,v.service,v.mode,new Date().toISOString());
  res.status(201).json({id,message:'Request sent privately. Agree the quote, turnaround, shipping costs, and return arrangements before sending clothing. This is not a booking or payment.'});
 });
 app.get('/api/my/sewing-service-requests',authBuyer,(req,res)=>{
  const profile=db.prepare('SELECT id FROM sewing_service_profiles WHERE owner_subject=?').get(req.buyerSubject);
  const incoming=profile?db.prepare('SELECT id,title,details,service,mode,status,requester_email AS contactEmail,created_at AS createdAt FROM sewing_service_requests WHERE provider_id=? ORDER BY created_at DESC LIMIT 100').all(profile.id):[];
  const outgoing=db.prepare('SELECT r.id,r.title,r.service,r.mode,r.status,r.created_at AS createdAt,p.display_name AS providerName FROM sewing_service_requests r JOIN sewing_service_profiles p ON p.id=r.provider_id WHERE requester_subject=? ORDER BY r.created_at DESC LIMIT 100').all(req.buyerSubject);
  res.json({incoming,outgoing});
 });
 app.patch('/api/my/sewing-service-requests/:id',origin,authBuyer,(req,res)=>{
  if(!['new','accepted','declined','completed'].includes(req.body?.status))return res.status(422).json({error:{message:'Choose a valid request status.'}});
  const change=db.prepare('UPDATE sewing_service_requests SET status=? WHERE id=? AND provider_id IN (SELECT id FROM sewing_service_profiles WHERE owner_subject=?)').run(req.body.status,req.params.id,req.buyerSubject);
  if(!change.changes)return res.status(404).json({error:{message:'Request not found.'}});res.json({ok:true});
 });
 app.get('/api/designers/:id/services',(req,res)=>{const designer=db.prepare("SELECT id FROM designer_profiles WHERE id=? AND status='active'").get(req.params.id);if(!designer)return res.status(404).json({error:{message:'Designer not found.'}});const r=db.prepare('SELECT * FROM designer_services WHERE designer_id=?').get(designer.id);res.json({services:r?JSON.parse(r.services_json):[],details:r?.details||''});});
 app.get('/api/my/designer-services',authDesigner,(req,res)=>{const r=db.prepare('SELECT * FROM designer_services WHERE designer_id=?').get(req.designerId);res.json({services:r?JSON.parse(r.services_json):[],details:r?.details||''});});
 app.put('/api/my/designer-services',origin,authDesigner,(req,res)=>{const list=selected(req.body?.services,taxonomy.designerServices.map(x=>x.value));if(!list)return res.status(422).json({error:{message:'Choose supported designer services.'}});db.prepare('INSERT INTO designer_services VALUES(?,?,?,?) ON CONFLICT(designer_id) DO UPDATE SET services_json=excluded.services_json,details=excluded.details,updated_at=excluded.updated_at').run(req.designerId,JSON.stringify(list),clean(req.body.details,1200),new Date().toISOString());res.json({ok:true});});
 return {designerServices:id=>{const r=db.prepare('SELECT * FROM designer_services WHERE designer_id=?').get(id);return {services:r?JSON.parse(r.services_json):[],serviceDetails:r?.details||''};}};
}
module.exports={mountSewingServices};
