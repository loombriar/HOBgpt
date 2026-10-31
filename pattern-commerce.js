const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),multer=require('multer');
function mountPatternCommerce({app,db,dataDir,authDesigner,authBuyer,authAdmin,origin,limiter,releaseTransfer}){
 const directory=path.join(dataDir,'private-patterns');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 db.exec(`CREATE TABLE IF NOT EXISTS pattern_files(listing_id TEXT PRIMARY KEY,storage_key TEXT NOT NULL,file_name TEXT NOT NULL,uploaded_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS order_pattern_files(order_id TEXT NOT NULL,listing_id TEXT NOT NULL,designer_id TEXT NOT NULL,storage_key TEXT NOT NULL,file_name TEXT NOT NULL,PRIMARY KEY(order_id,listing_id));`);
 const digital=row=>row?.category==='patterns'&&row.style==='PDF pattern';
 const describe=row=>row.category==='patterns'?{patternFormat:digital(row)?'pdf':'paper',patternFileReady:!digital(row)||!!db.prepare('SELECT 1 FROM pattern_files WHERE listing_id=?').get(row.id)}:{};
 const ready=row=>!digital(row);
 app.get('/api/admin/listings/:id/pattern-file',authAdmin,(req,res)=>{const file=db.prepare('SELECT * FROM pattern_files WHERE listing_id=?').get(req.params.id);if(!file)return res.status(404).end();res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.download(path.join(directory,file.storage_key),file.file_name);});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:2}});
 app.put('/api/my/pattern-files/:id',origin,authDesigner,limiter,(_req,res)=>res.status(410).json({error:{message:'PDF pattern uploads are not available yet.'}}),upload.single('file'),(req,res,next)=>{try{
  const row=db.prepare("SELECT * FROM listings WHERE id=? AND designer_id=? AND status IN ('draft','rejected','published')").get(req.params.id,req.designerId);
  if(!digital(row))return res.status(422).json({error:{message:'Choose a draft PDF pattern listing first.'}});
  if(req.body.rightsConfirmed!=='true')return res.status(422).json({error:{message:'Confirm you own or have permission to sell this pattern.'}});
  if(!req.file||req.file.buffer.subarray(0,5).toString()!=='%PDF-'||!req.file.originalname.toLowerCase().endsWith('.pdf'))return res.status(422).json({error:{message:'Upload a PDF pattern file up to 20 MB.'}});
  const key=crypto.randomUUID()+'.pdf',name=path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)||'pattern.pdf';fs.writeFileSync(path.join(directory,key),req.file.buffer,{mode:0o600,flag:'wx'});
  db.transaction(()=>{db.prepare('INSERT INTO pattern_files VALUES(?,?,?,?) ON CONFLICT(listing_id) DO UPDATE SET storage_key=excluded.storage_key,file_name=excluded.file_name,uploaded_at=excluded.uploaded_at').run(row.id,key,name,new Date().toISOString());if(row.status==='published')db.prepare("UPDATE listings SET status='draft',moderation_status='pending',updated_at=?,version=version+1 WHERE id=?").run(new Date().toISOString(),row.id);}).immediate();
  res.json({ok:true,message:'PDF saved privately. Submit the listing for review before it can be purchased.'});
 }catch(e){next(e);}});
 function snapshot(orderId,items){for(const item of items){const row=db.prepare('SELECT * FROM listings WHERE id=?').get(item.id);if(!digital(row))continue;const file=db.prepare('SELECT * FROM pattern_files WHERE listing_id=?').get(row.id);if(!file||!fs.existsSync(path.join(directory,file.storage_key)))throw Object.assign(Error('This PDF pattern is not ready to download.'),{statusCode:409});db.prepare('INSERT INTO order_pattern_files VALUES(?,?,?,?,?)').run(orderId,row.id,row.designer_id,file.storage_key,file.file_name);}}
 function groupReady(orderId,designerId){const rows=db.prepare('SELECT oi.listing_id,p.storage_key FROM order_items oi LEFT JOIN order_pattern_files p ON p.order_id=oi.order_id AND p.listing_id=oi.listing_id WHERE oi.order_id=? AND oi.designer_id=?').all(orderId,designerId);return rows.length>0&&rows.every(r=>r.storage_key&&fs.existsSync(path.join(directory,r.storage_key)));}
 async function releaseDigital(orderId){const rows=db.prepare('SELECT DISTINCT designer_id FROM order_pattern_files WHERE order_id=?').all(orderId);for(const row of rows)if(groupReady(orderId,row.designer_id))await releaseTransfer(orderId,row.designer_id,'digital_pattern_delivered');}
 function download(req,res,order){const file=order&&db.prepare('SELECT * FROM order_pattern_files WHERE order_id=? AND listing_id=?').get(order.id,req.params.listingId);const refund=file&&db.prepare("SELECT 1 FROM order_refunds WHERE order_id=? AND scope IN ('full',?) AND status NOT IN ('failed','canceled')").get(order.id,file.designer_id);
  if(!file||order.status!=='paid'||refund||order.refund_status&&!db.prepare('SELECT 1 FROM order_refunds WHERE order_id=?').get(order.id))return res.status(404).json({error:{message:'Paid pattern download not available.'}});
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.download(path.join(directory,file.storage_key),file.file_name);
 }
 app.get('/api/my/purchases/:orderId/download/:listingId',authBuyer,(req,res)=>download(req,res,db.prepare('SELECT * FROM orders WHERE id=? AND buyer_subject=?').get(req.params.orderId,req.buyerSubject)));
 app.get('/api/checkout/session/:sessionId/download/:listingId',limiter,(req,res)=>{if(!/^cs_[A-Za-z0-9_]{16,}$/.test(req.params.sessionId))return res.status(404).end();download(req,res,db.prepare("SELECT * FROM orders WHERE stripe_session_id=? AND status='paid'").get(req.params.sessionId));});
 return {digital,describe,snapshot,groupReady,releaseDigital,ready,downloadUrl:(order,id,guest=false)=>db.prepare('SELECT 1 FROM order_pattern_files WHERE order_id=? AND listing_id=?').get(order.id,id)?guest?`/api/checkout/session/${encodeURIComponent(order.stripe_session_id)}/download/${encodeURIComponent(id)}`:`/api/my/purchases/${encodeURIComponent(order.id)}/download/${encodeURIComponent(id)}`:null};
}
module.exports={mountPatternCommerce};
