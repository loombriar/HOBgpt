const crypto=require('node:crypto');
const sharp=require('sharp');

function mountDesignProjects({app,db,authBuyer,origin,rateLimit,imageWork,moderateDesignerImage,fail}) {
 db.exec(`CREATE TABLE IF NOT EXISTS design_projects(
  id TEXT PRIMARY KEY,owner_subject TEXT NOT NULL,owner_email TEXT NOT NULL,display_name TEXT NOT NULL,
  title TEXT NOT NULL,details TEXT NOT NULL,budget TEXT NOT NULL DEFAULT '',size_notes TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL DEFAULT 'private',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS design_projects_owner ON design_projects(owner_subject);
 CREATE TABLE IF NOT EXISTS design_project_images(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,image BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS design_project_offers(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
 maker_subject TEXT NOT NULL,maker_email TEXT NOT NULL,maker_name TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,
 UNIQUE(project_id,maker_subject));
 CREATE UNIQUE INDEX IF NOT EXISTS design_project_one_maker ON design_project_offers(project_id) WHERE status='accepted';`);
 const read=rateLimit({windowMs:60*1000,max:120,keyPrefix:'design-project-reads'});
 const mutate=rateLimit({windowMs:60*60*1000,max:60,keyPrefix:'design-projects'});
 const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 const own=(req)=>db.prepare('SELECT * FROM design_projects WHERE id=? AND owner_subject=?').get(req.params.id,req.buyerSubject);
 function maker(req) {
  const id=db.prepare('SELECT designer_id FROM designer_identities WHERE subject=?').get(req.buyerSubject)?.designer_id || (req.buyerSubject.startsWith('designer:')?req.buyerSubject.slice(9):'');
  const designer=id&&db.prepare("SELECT brand_name,display_name FROM designer_profiles WHERE id=? AND status='active'").get(id);
  if(designer)return designer.brand_name||designer.display_name||'House designer';
  const service=db.prepare('SELECT display_name,services_json FROM sewing_service_profiles WHERE owner_subject=? AND published=1').get(req.buyerSubject);
  return service&&JSON.parse(service.services_json).includes('custom-construction')?service.display_name:null;
 }
 const serialize=row=>({id:row.id,displayName:row.display_name,title:row.title,details:row.details,budget:row.budget,sizeNotes:row.size_notes,deadline:row.deadline,visibility:row.visibility,createdAt:row.created_at,
 images:db.prepare('SELECT id FROM design_project_images WHERE project_id=? ORDER BY rowid').all(row.id).map(image=>({id:image.id,url:`/api/design-projects/${row.id}/images/${image.id}`}))});
 app.use('/api/design-projects',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api/my/design-projects',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/api/my/design-projects',authBuyer,read,(req,res)=>{
  const projects=db.prepare('SELECT * FROM design_projects WHERE owner_subject=? ORDER BY updated_at DESC LIMIT 10').all(req.buyerSubject).map(row=>({...serialize(row),offers:db.prepare('SELECT id,maker_name AS makerName,note,status,maker_email FROM design_project_offers WHERE project_id=? ORDER BY created_at DESC').all(row.id).map(({maker_email,...offer})=>({...offer,contactEmail:offer.status==='accepted'?maker_email:undefined}))}));
  const offers=db.prepare('SELECT o.id,o.note,o.status,p.title,p.owner_email,p.id AS projectId FROM design_project_offers o JOIN design_projects p ON p.id=o.project_id WHERE o.maker_subject=? ORDER BY o.created_at DESC LIMIT 100').all(req.buyerSubject).map(({owner_email,...offer})=>({...offer,contactEmail:offer.status==='accepted'?owner_email:undefined,project:offer.status==='accepted'?serialize(db.prepare('SELECT * FROM design_projects WHERE id=?').get(offer.projectId)):undefined}));
  res.json({projects,offers,canBrowse:Boolean(maker(req))});
 });
 app.post('/api/my/design-projects',origin,authBuyer,mutate,(req,res)=>{
  if(db.prepare('SELECT COUNT(*) n FROM design_projects WHERE owner_subject=?').get(req.buyerSubject).n>=10)return fail(res,422,'project_limit','Keep up to 10 projects. Remove an old project before adding another.');
  const v=req.body||{},title=clean(v.title,120),details=clean(v.details,2000),name=clean(v.displayName,100),budget=clean(v.budget,160),size=clean(v.sizeNotes,500),deadline=clean(v.deadline,10);
  if(title.length<3||details.length<30||!name||!['private','makers'].includes(v.visibility||'private')||(deadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline)))return fail(res,422,'invalid_project','Add a display name, a title, and at least 30 characters about your design.');
  // New projects always start private, including clients that ask to share before uploading.
  const id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO design_projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,req.buyerSubject,req.buyerEmail,name,title,details,budget,size,deadline,'private',now,now);
  res.status(201).json({project:serialize(own({...req,params:{id}}))});
 });
 app.patch('/api/my/design-projects/:id',origin,authBuyer,mutate,(req,res)=>{
  const row=own(req);if(!row)return fail(res,404,'not_found','Project not found.');
  const visibility=req.body?.visibility;
  if(!['private','makers'].includes(visibility))return fail(res,422,'invalid_visibility','Choose private or share with makers.');
  if(visibility==='makers'&&db.prepare("SELECT 1 FROM design_project_offers WHERE project_id=? AND status='accepted'").get(row.id))return fail(res,409,'already_matched','This project already has a chosen maker.');
  if(visibility==='makers'&&!db.prepare('SELECT 1 FROM design_project_images WHERE project_id=?').get(row.id))return fail(res,422,'image_required','Upload a drawing before sharing your project.');
  db.prepare('UPDATE design_projects SET visibility=?,updated_at=? WHERE id=?').run(visibility,new Date().toISOString(),row.id);
  res.json({project:serialize(own(req))});
 });
 app.post('/api/my/design-projects/:id/images',origin,authBuyer,mutate,(req,res,next)=>{
  if(!own(req))return fail(res,404,'not_found','Project not found.');
  if(db.prepare('SELECT COUNT(*) n FROM design_project_images WHERE project_id=?').get(req.params.id).n>=3)return fail(res,422,'image_limit','Use up to three drawings per project.');next();
 },imageWork.gate('buyer'),imageWork.parse,async(req,res,next)=>{
  try {
   if(req.body?.consent!=='true')return fail(res,422,'consent_required','Confirm you may share the drawing and agree to the image safety check.');
   if(!req.file)return fail(res,422,'missing_image','Choose a JPEG, PNG or WebP drawing.');
   const image=await imageWork.run(async()=>{
    const source=sharp(req.file.path,{limitInputPixels:40_000_000});const meta=await source.metadata().catch(()=>{throw Object.assign(new Error('Choose a valid JPEG, PNG or WebP image.'),{statusCode:422});});
    if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Object.assign(new Error('Choose a still JPEG, PNG or WebP image.'),{statusCode:422});
    const image=await source.rotate().resize(1800,1800,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer().catch(()=>{throw Object.assign(new Error('This drawing could not be read. Try exporting it as a JPEG or PNG.'),{statusCode:422});});
    if(image.length>2*1024*1024)throw Object.assign(new Error('This drawing is too detailed to save. Try a smaller image.'),{statusCode:422});
    const review=await moderateDesignerImage(image,'image/webp','original clothing design sketch');
    if(!review.allow||review.needsHumanReview)throw Object.assign(new Error('This drawing needs review before it can be uploaded.'),{statusCode:422});
    return image;
   });
   // Recheck ownership and capacity after asynchronous processing.
   if(!own(req))return fail(res,404,'not_found','Project not found.');
   if(db.prepare('SELECT COUNT(*) n FROM design_project_images WHERE project_id=?').get(req.params.id).n>=3)return fail(res,422,'image_limit','Use up to three drawings per project.');
   const id=crypto.randomUUID();db.prepare('INSERT INTO design_project_images VALUES(?,?,?)').run(id,req.params.id,image);
   res.status(201).json({image:{id,url:`/api/design-projects/${req.params.id}/images/${id}`}});
  }catch(error){if(error.statusCode===422)return fail(res,422,'invalid_image',error.message);next(error);}
 });
 app.delete('/api/my/design-projects/:id/images/:imageId',origin,authBuyer,mutate,(req,res)=>{
  if(!own(req))return fail(res,404,'not_found','Project not found.');
  db.prepare('DELETE FROM design_project_images WHERE project_id=? AND id=?').run(req.params.id,req.params.imageId);
  if(!db.prepare('SELECT 1 FROM design_project_images WHERE project_id=?').get(req.params.id))db.prepare("UPDATE design_projects SET visibility='private' WHERE id=?").run(req.params.id);
  res.json({ok:true});
 });
 app.delete('/api/my/design-projects/:id',origin,authBuyer,mutate,(req,res)=>{
  if(!own(req))return fail(res,404,'not_found','Project not found.');
  db.transaction(()=>{db.prepare('DELETE FROM design_project_offers WHERE project_id=?').run(req.params.id);db.prepare('DELETE FROM design_project_images WHERE project_id=?').run(req.params.id);db.prepare('DELETE FROM design_projects WHERE id=?').run(req.params.id);})();res.json({ok:true});
 });
 app.get('/api/design-projects',authBuyer,read,(req,res)=>{
  if(!maker(req))return fail(res,403,'maker_required','Designers and published seamstresses offering custom construction can browse shared projects.');
  const projects=db.prepare("SELECT * FROM design_projects WHERE visibility='makers' AND owner_subject!=? AND NOT EXISTS(SELECT 1 FROM design_project_offers WHERE project_id=design_projects.id AND status='accepted') AND EXISTS(SELECT 1 FROM design_project_images WHERE project_id=design_projects.id) ORDER BY updated_at DESC LIMIT 100").all(req.buyerSubject);
  res.json({projects:projects.map(serialize)});
 });
 app.get('/api/design-projects/:id/images/:imageId',authBuyer,read,(req,res)=>{
  const row=db.prepare('SELECT p.* FROM design_projects p JOIN design_project_images i ON i.project_id=p.id WHERE p.id=? AND i.id=?').get(req.params.id,req.params.imageId);
  if(!row||(row.owner_subject!==req.buyerSubject&&!((row.visibility==='makers'&&maker(req))||db.prepare("SELECT 1 FROM design_project_offers WHERE project_id=? AND maker_subject=? AND status='accepted'").get(row.id,req.buyerSubject))))return fail(res,404,'not_found','Drawing not found.');
  res.type('image/webp').send(db.prepare('SELECT image FROM design_project_images WHERE id=? AND project_id=?').get(req.params.imageId,row.id).image);
 });
 app.post('/api/design-projects/:id/offers',origin,authBuyer,mutate,(req,res)=>{
  const makerName=maker(req);if(!makerName)return fail(res,403,'maker_required','Set up your designer or custom-construction service profile first.');
  const project=db.prepare("SELECT * FROM design_projects WHERE id=? AND visibility='makers'").get(req.params.id);
  if(!project||project.owner_subject===req.buyerSubject)return fail(res,404,'not_found','Shared project not found.');
  if(!req.buyerEmail)return fail(res,422,'email_required','Add a verified contact email before offering help.');
  if(db.prepare("SELECT 1 FROM design_project_offers WHERE project_id=? AND status='accepted'").get(project.id))return fail(res,409,'already_matched','This project already has an accepted maker.');
  const note=clean(req.body?.note,1200);if(note.length<30)return fail(res,422,'invalid_offer','Describe your experience, availability and suggested next step in at least 30 characters.');
  if(db.prepare('SELECT 1 FROM design_project_offers WHERE project_id=? AND maker_subject=?').get(project.id,req.buyerSubject))return fail(res,409,'already_offered','You already offered help with this project.');
  if(db.prepare('SELECT COUNT(*) n FROM design_project_offers WHERE project_id=?').get(project.id).n>=50)return fail(res,422,'offer_limit','This project has enough offers to review for now.');
  const id=crypto.randomUUID();db.prepare('INSERT INTO design_project_offers VALUES(?,?,?,?,?,?,?,?)').run(id,project.id,req.buyerSubject,req.buyerEmail,makerName,note,'pending',new Date().toISOString());
  res.status(201).json({id,message:'Your offer is saved. Contact emails are shared only if the project owner accepts.'});
 });
 app.patch('/api/my/design-projects/:id/offers/:offerId',origin,authBuyer,mutate,(req,res)=>{
  const project=own(req);if(!project)return fail(res,404,'not_found','Project not found.');
  const offer=db.prepare('SELECT * FROM design_project_offers WHERE id=? AND project_id=?').get(req.params.offerId,project.id);
  if(!offer)return fail(res,404,'not_found','Offer not found.');
  if(!['accepted','declined'].includes(req.body?.status))return fail(res,422,'invalid_status','Accept or decline this offer.');
  if(offer.status!=='pending')return fail(res,409,'already_decided','This offer already has a response.');
  if(req.body.status==='accepted'&&(!req.buyerEmail||db.prepare("SELECT 1 FROM design_project_offers WHERE project_id=? AND status='accepted'").get(project.id)))return fail(res,409,'cannot_accept','A contact email is required and only one maker can be accepted per project.');
  db.transaction(()=>{
   db.prepare('UPDATE design_project_offers SET status=? WHERE id=?').run(req.body.status,offer.id);
   if(req.body.status==='accepted'){
    db.prepare("UPDATE design_projects SET visibility='private',owner_email=? WHERE id=?").run(req.buyerEmail,project.id);
    db.prepare("UPDATE design_project_offers SET status='declined' WHERE project_id=? AND id!=? AND status='pending'").run(project.id,offer.id);
   }
  }).immediate();
  res.json({ok:true});
 });
}
module.exports={mountDesignProjects};
