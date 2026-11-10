const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const multer=require('multer');

const DEFAULT_STALE_STAGING_MAX_AGE_MS=24*60*60*1000;
const GENERATED_UPLOAD_NAME=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;
async function cleanupStaleIncomingFiles(directory,{maxAgeMs=DEFAULT_STALE_STAGING_MAX_AGE_MS,nowMs=Date.now()}={}){
  if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<60*60*1000)throw new TypeError('Staging cleanup age must be at least one hour.');
  if(!Number.isFinite(nowMs))throw new TypeError('Staging cleanup time must be finite.');
  let stat;
  try{stat=await fs.promises.lstat(directory);}catch(e){if(e.code==='ENOENT')return 0;throw e;}
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Object.assign(new Error('Upload staging path must be a real directory.'),{code:'unsafe_staging_directory'});
  let removed=0;
  const handle=await fs.promises.opendir(directory);
  try{
    for await(const entry of handle){
      if(!entry.isFile()||!GENERATED_UPLOAD_NAME.test(entry.name))continue;
      const file=path.join(directory,entry.name);
      let info;
      try{info=await fs.promises.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if(!info.isFile()||info.isSymbolicLink()||!Number.isFinite(info.mtimeMs)||info.mtimeMs>=nowMs-maxAgeMs)continue;
      try{await fs.promises.unlink(file);removed++;}catch(e){if(e.code!=='ENOENT')throw e;}
    }
  }finally{await handle.close().catch(()=>{});}
  return removed;
}

function createImageWorkControls({db,imagesDir,fail,log=()=>{},options={}}){
  const maxActive=options.maxActive||4,maxWorkers=options.maxWorkers||2,maxWaiting=options.maxWaiting||4;
  const parseTimeoutMs=options.parseTimeoutMs||30000;
  const windowMs=15*60*1000;
  const maxPerAccount=options.maxPerAccount||12,maxGlobal=options.maxGlobal||120;
  const active=new Map();let activeTotal=0,running=0;
  const waiting=[];
  const dir=path.join(imagesDir,'.incoming');
  fs.mkdirSync(dir,{recursive:true});
  const stagingStat=fs.lstatSync(dir);
  if(!stagingStat.isDirectory()||stagingStat.isSymbolicLink())throw Object.assign(new Error('Upload staging path must be a real directory.'),{code:'unsafe_staging_directory'});
  const stagingCleanup=cleanupStaleIncomingFiles(dir).then(removed=>{if(removed)log('info','stale_image_uploads_cleaned',{removed});return removed;}).catch(error=>{log('error','stale_image_upload_cleanup_failed',{code:error.code||'cleanup_failed'});return 0;});
  db.exec('CREATE TABLE IF NOT EXISTS image_work_quotas (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
  const reserve=db.transaction((subject,kind)=>{
    const now=Date.now();
    const keys=[['global',maxGlobal],['account:'+kind+':'+crypto.createHash('sha256').update(subject).digest('hex'),maxPerAccount]];
    for(const [key,limit] of keys){
      const row=db.prepare('SELECT hits,reset_at FROM image_work_quotas WHERE bucket=?').get(key);
      if(row&&row.reset_at>now&&row.hits>=limit)return Math.ceil((row.reset_at-now)/1000);
    }
    for(const [key] of keys){
      db.prepare('INSERT INTO image_work_quotas(bucket,hits,reset_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').run(key,now+windowMs,now,now);
    }
    return 0;
  });
  function gate(kind){
    return (req,res,next)=>{
      const subject=kind==='designer'?req.designerId:req.buyerSubject;
      if(typeof subject!=='string'||!subject)return fail(res,401,'unauthorized','Sign in before uploading.');
      const identity=kind+':'+subject;
      if(activeTotal>=maxActive||(active.get(identity)||0)>=1){
        res.set('Retry-After','5');return fail(res,429,'upload_busy','An image upload is already in progress. Try again shortly.');
      }
      const retry=reserve.immediate(subject,kind);
      if(retry){res.set('Retry-After',String(Math.max(1,retry)));return fail(res,429,'rate_limited','Image upload allowance reached. Try again later.');}
      activeTotal++;active.set(identity,(active.get(identity)||0)+1);
      let released=false;
      const release=()=>{
        if(released)return;released=true;activeTotal--;
        const n=active.get(identity)||0;if(n<=1)active.delete(identity);else active.set(identity,n-1);
        if(req.file?.path)fs.promises.unlink(req.file.path).catch(()=>{});
      };
      res.once('finish',release);res.once('close',release);
      req.imageWorkDeadline=Date.now()+parseTimeoutMs;
      next();
    };
  }
  const upload=multer({
    storage:multer.diskStorage({
      destination:(_req,_file,cb)=>cb(null,dir),
      filename:(_req,_file,cb)=>cb(null,crypto.randomUUID()+'.tmp')
    }),
    limits:{fileSize:10*1024*1024,files:1,fields:2,parts:3,fieldSize:1024,fieldNameSize:80}
  });
  function parse(req,res,next){
    if(Date.now()>=req.imageWorkDeadline)return fail(res,408,'upload_timeout','Image upload took too long.');
    const timeout=setTimeout(()=>{
      if(res.headersSent||res.writableEnded)return;
      fail(res,408,'upload_timeout','Image upload took too long.');
      req.unpipe?.();
      req.resume?.();
    },Math.max(1,req.imageWorkDeadline-Date.now()));
    upload.single('image')(req,res,error=>{
      clearTimeout(timeout);
      if(res.writableEnded){if(req.file?.path)fs.promises.unlink(req.file.path).catch(()=>{});return;}
      if(error)return next(error);
      next();
    });
  }
  function run(task){
    return new Promise((resolve,reject)=>{
      if(waiting.length>=maxWaiting)return reject(Object.assign(new Error('Image processing is busy.'),{statusCode:503}));
      waiting.push({task,resolve,reject});
      pump();
    });
  }
  function pump(){
    while(running<maxWorkers&&waiting.length){
      const job=waiting.shift();running++;
      Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{running--;pump();});
    }
  }
  return {gate,parse,run,stagingCleanup};
}
module.exports={createImageWorkControls,cleanupStaleIncomingFiles,DEFAULT_STALE_STAGING_MAX_AGE_MS};
