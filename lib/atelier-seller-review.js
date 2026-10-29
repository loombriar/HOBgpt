'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const {DESIGNER_ID}=require('./atelier-staging-drafts');
const API='/api/supplier-review/atelier-emine';
const COOKIE='hob_atelier_review';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const newToken=()=>crypto.randomBytes(32).toString('base64url');
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
function setupSellerReview(db,{environment,initialInvite}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_review_links (
   id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, supplier TEXT NOT NULL,
   created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
 );
 CREATE TABLE IF NOT EXISTS supplier_review_sessions (
   session_hash TEXT PRIMARY KEY, link_id TEXT NOT NULL REFERENCES supplier_review_links(id),
   created_at TEXT NOT NULL, expires_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS supplier_review_responses (
   id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id TEXT NOT NULL REFERENCES listings(id),
   link_id TEXT NOT NULL REFERENCES supplier_review_links(id),
   decision TEXT NOT NULL CHECK(decision IN ('confirmed','changes_requested')),
   reviewer_name TEXT NOT NULL, reviewer_email TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
   review_version TEXT NOT NULL, reviewed_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS supplier_review_latest ON supplier_review_responses(listing_id,id DESC);`);
 if(environment==='staging'&&initialInvite){
   if(!/^[a-f0-9]{64}$/.test(initialInvite.tokenHash)||!Number.isFinite(Date.parse(initialInvite.expiresAt)))throw Error('Invalid supplier invitation');
   db.prepare("INSERT OR IGNORE INTO supplier_review_links (id,token_hash,supplier,created_at,expires_at) VALUES (?,?,'atelier-emine',?,?)").run(initialInvite.id,initialInvite.tokenHash,new Date().toISOString(),new Date(initialInvite.expiresAt).toISOString());
 }
}
function draftVersion(row,source){return hash(JSON.stringify({title:row.title,description:row.description,price:row.price,source}));}
function reviewFor(db,row,source){
 const review=db.prepare('SELECT decision,reviewer_name,reviewer_email,notes,review_version,reviewed_at FROM supplier_review_responses WHERE listing_id=? ORDER BY id DESC LIMIT 1').get(row.id);
 if(!review)return {status:'pending_seller_review'};
 return {...review,status:review.review_version===draftVersion(row,source)?review.decision:'needs_rereview'};
}
function currentLink(db){
 return db.prepare("SELECT id,created_at,expires_at,revoked_at FROM supplier_review_links WHERE supplier='atelier-emine' ORDER BY created_at DESC,rowid DESC LIMIT 1").get()||null;
}
function registerSellerReview({app,db,authAdmin,fail,environment,catalog,trustedAppOrigin,rateLimit}){
 const privateHeaders=(_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer'});next();};
 const staging=(_req,res,next)=>environment==='staging'?next():fail(res,404,'not_found','Review page not found.');
 const sameOrigin=(req,res,next)=>{
   if(req.get('origin')!==trustedAppOrigin(req))return fail(res,403,'invalid_origin','Open the private review page to submit your response.');
   return next();
 };
 const authenticate=(req,res,next)=>{
   const value=String(req.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
   if(!validToken(value))return fail(res,401,'review_link_required','Open your private review link to continue.');
   const now=new Date().toISOString();
   const session=db.prepare(`SELECT s.link_id FROM supplier_review_sessions s JOIN supplier_review_links l ON l.id=s.link_id WHERE s.session_hash=? AND s.expires_at>? AND l.expires_at>? AND l.revoked_at IS NULL AND l.supplier='atelier-emine'`).get(hash(value),now,now);
   if(!session)return fail(res,401,'review_link_expired','This review session expired or was revoked. Ask House of Briar for a fresh link.');
   req.supplierReviewLinkId=session.link_id;return next();
 };
 const exchangeLimiter=rateLimit({windowMs:15*60*1000,max:20,keyPrefix:'atelier-review-link'});
 const responseLimiter=rateLimit({windowMs:10*60*1000,max:180,keyPrefix:'atelier-review-response'});
 app.use(API,staging,privateHeaders);
 app.use('/supplier-review/atelier-emine',staging,privateHeaders);
 app.get('/supplier-review/atelier-emine',(_req,res)=>res.sendFile(path.join(__dirname,'../supplier-review/atelier-emine.html')));
 for(const ext of ['js','css'])app.get('/supplier-review/atelier-emine.'+ext,staging,privateHeaders,(_req,res)=>res.sendFile(path.join(__dirname,'../supplier-review/atelier-emine.'+ext)));
 app.post(API+'/session',sameOrigin,exchangeLimiter,(req,res)=>{
   if(!validToken(req.body?.token))return fail(res,401,'invalid_review_link','This review link is invalid or expired.');
   const now=new Date().toISOString();
   const link=db.prepare("SELECT id,expires_at FROM supplier_review_links WHERE token_hash=? AND supplier='atelier-emine' AND revoked_at IS NULL AND expires_at>?").get(hash(req.body.token),now);
   if(!link)return fail(res,401,'invalid_review_link','This review link is invalid or expired.');
   const session=newToken();const expires=new Date(Math.min(Date.now()+8*60*60*1000,Date.parse(link.expires_at))).toISOString();
   db.transaction(()=>{db.prepare('DELETE FROM supplier_review_sessions WHERE expires_at<=?').run(now);db.prepare('INSERT INTO supplier_review_sessions (session_hash,link_id,created_at,expires_at) VALUES (?,?,?,?)').run(hash(session),link.id,now,expires)})();
   res.cookie(COOKIE,session,{httpOnly:true,secure:trustedAppOrigin(req).startsWith('https://'),sameSite:'strict',path:API,maxAge:Math.max(0,Date.parse(expires)-Date.now())});
   return res.json({expiresAt:expires});
 });
 app.get(API,authenticate,(_req,res)=>{
   const rows=db.prepare(`SELECT l.id,l.title,l.description,l.price,s.source_json FROM listings l JOIN supplier_catalog_drafts s ON s.listing_id=l.id WHERE s.supplier='atelier-emine' AND l.designer_id=? AND l.status='draft' ORDER BY l.title`).all(DESIGNER_ID);
   const items=rows.map(row=>{const source=JSON.parse(row.source_json);return {id:row.id,title:row.title,description:row.description,price:row.price,version:draftVersion(row,source),source,review:reviewFor(db,row,source)}});
   return res.json({profile:{brandName:catalog.profile.brand_name,bio:catalog.profile.bio,location:catalog.profile.location},logoDataUrl:catalog.logoDataUrl,pricing:catalog.pricing_policy,items,salesEnabled:false});
 });
 app.post(API+'/items/:listingId',sameOrigin,authenticate,responseLimiter,(req,res)=>{
   const {decision,version,authorized,detailsConfirmed}=req.body||{};
   const name=typeof req.body?.name==='string'?req.body.name.trim():'';
   const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
   const notes=typeof req.body?.notes==='string'?req.body.notes.trim():'';
   if(!['confirmed','changes_requested'].includes(decision)||!name||name.length>120||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||authorized!==true||notes.length>4000||decision==='confirmed'&&detailsConfirmed!==true||decision==='changes_requested'&&!notes)return fail(res,422,'review_details_required','Add your name, email and review confirmation. Changes requested need a note.');
   const outcome=db.transaction(()=>{
     const row=db.prepare(`SELECT l.id,l.title,l.description,l.price,s.source_json FROM listings l JOIN supplier_catalog_drafts s ON s.listing_id=l.id WHERE l.id=? AND l.designer_id=? AND l.status='draft' AND s.supplier='atelier-emine'`).get(req.params.listingId,DESIGNER_ID);
     if(!row)return {error:[404,'not_found','Draft listing not found.']};
     const source=JSON.parse(row.source_json);
     if(version!==draftVersion(row,source))return {error:[409,'draft_changed','This listing changed. Reload the collection and review the updated details.']};
     db.prepare('INSERT INTO supplier_review_responses (listing_id,link_id,decision,reviewer_name,reviewer_email,notes,review_version,reviewed_at) VALUES (?,?,?,?,?,?,?,?)').run(row.id,req.supplierReviewLinkId,decision,name,email,notes,version,new Date().toISOString());
     return {review:reviewFor(db,row,source)};
   }).immediate();
   if(outcome.error)return fail(res,...outcome.error);
   return res.json({...outcome,salesEnabled:false});
 });
 const admin='/api/admin/atelier-emine/review-links';
 app.get(admin,authAdmin,staging,privateHeaders,(_req,res)=>res.json({link:currentLink(db)}));
 app.post(admin,authAdmin,staging,privateHeaders,(req,res)=>{
   const token=newToken(),id=crypto.randomUUID(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
   db.transaction(()=>{
     db.prepare("UPDATE supplier_review_links SET revoked_at=? WHERE supplier='atelier-emine' AND revoked_at IS NULL").run(now);
     db.prepare("INSERT INTO supplier_review_links (id,token_hash,supplier,created_at,expires_at) VALUES (?,?,'atelier-emine',?,?)").run(id,hash(token),now,expiresAt);
   }).immediate();
   return res.status(201).json({id,expiresAt,url:trustedAppOrigin(req)+'/supplier-review/atelier-emine#token='+token});
 });
 app.delete(admin,authAdmin,staging,privateHeaders,(_req,res)=>{
   db.prepare("UPDATE supplier_review_links SET revoked_at=? WHERE supplier='atelier-emine' AND revoked_at IS NULL").run(new Date().toISOString());
   return res.json({revoked:true});
 });
}
module.exports={setupSellerReview,registerSellerReview,reviewFor,draftVersion,currentLink};
