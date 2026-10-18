// Private, one-shot restore verification. Never starts the normal server worker.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {once}=require('node:events');
const Database=require('better-sqlite3');
const {request}=require('./backup-offsite');

function validateEnvironment(env){
 if(env.NODE_ENV!=='test'||env.RECOVERY_DRILL_ENABLED!=='true')throw Error('Explicit isolated test mode is required');
 if(env.RAILWAY_SERVICE_NAME==='house-of-briar')throw Error('Refusing to run on the live application service');
 if(env.BACKUP_S3_BUCKET!=='house-of-briar-backups')throw Error('Select the production backup bucket explicitly');
 if(!/^house-of-briar\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\/$/.test(env.RECOVERY_BACKUP_PREFIX||''))throw Error('Select one explicit dated backup');
 for(const key of Object.keys(env))if(/^(STRIPE_|SHIPPO_|SMTP_|SENDGRID_|RESEND_|PAYPAL_)/.test(key))throw Error('Payment, shipping and email configuration must be absent');
 for(const key of ['OPENAI_API_KEY','ADMIN_TOKEN','ADMIN_TOKENS','ADMIN_TOKENS_JSON','DESIGNER_TOKENS_JSON','DESIGNER_IDENTITY_MAP_JSON'])if(env[key])throw Error('Application credentials must be absent');
 if(env.OFFSITE_BACKUP_ENABLED==='true')throw Error('Backup writes must be disabled');
}
function validateManifest(manifest){
 if(manifest.version!==2||manifest.database!=='catalog.sqlite'||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>10000)throw Error('Invalid recovery manifest');
 const names=new Set();let total=0;
 for(const file of manifest.files){
  if(typeof file.path!=='string'||!/^(catalog\.sqlite|images\/[a-zA-Z0-9_-]+\.webp)$/.test(file.path)||names.has(file.path))throw Error('Unsafe or duplicate backup path');
  names.add(file.path);
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>250*1024*1024||!/^\w{64}$/.test(file.sha256)||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid backup file metadata');
  total+=file.size;
 }
 if(!names.has('catalog.sqlite')||total>500*1024*1024)throw Error('Missing database or oversized recovery');
 return total;
}
function runHelper(script,args){const result=spawnSync(process.execPath,[path.join(__dirname,script),...args],{encoding:'utf8'});if(result.status!==0)throw Error(script+' failed verification');}
async function main({download=key=>request('GET',key)}={}){
 validateEnvironment(process.env);
 const startedAt=new Date().toISOString(),prefix=process.env.RECOVERY_BACKUP_PREFIX;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hob-production-restore-'));
 const snapshot=path.join(root,'snapshot'),target=path.join(root,'restored');
 let ctx,server,externalCalls=0;const originalFetch=global.fetch;
 const stage=name=>console.log('RECOVERY_DRILL_STAGE '+name);
 try{
  stage('download-and-verify');
  const manifestBytes=Buffer.from(await(await download(prefix+'manifest.json')).arrayBuffer());
  const manifest=JSON.parse(manifestBytes);const totalBytes=validateManifest(manifest);
  fs.mkdirSync(path.join(snapshot,'data'),{recursive:true});fs.writeFileSync(path.join(snapshot,'manifest.json'),manifestBytes,{flag:'wx'});
  for(const file of manifest.files){
   const bytes=Buffer.from(await(await download(prefix+'data/'+file.path)).arrayBuffer());
   if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Downloaded backup checksum mismatch');
   const destination=path.join(snapshot,'data',file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
  }
  stage('restore');
  runHelper('verify-backup.js',[snapshot]);runHelper('restore-backup.js',[snapshot,target]);
  stage('database-and-media-integrity');
  const restored=new Database(path.join(target,'catalog.sqlite'),{readonly:true,fileMustExist:true});
  const counts={},tables=['listings','designer_profiles','customer_accounts','orders','order_items'];
  let listingIds,orderIds;
  try{
   for(const table of tables)counts[table]=restored.prepare('SELECT COUNT(*) n FROM '+table).get().n;
   listingIds=restored.prepare("SELECT id FROM listings WHERE status!='deleted' ORDER BY id LIMIT 300").all().map(r=>r.id);
   orderIds=restored.prepare('SELECT id FROM orders ORDER BY id').all().map(r=>r.id);
   const rows=restored.pragma('integrity_check');if(rows.length!==1||rows[0].integrity_check!=='ok')throw Error('Restored SQLite integrity failure');
  }finally{restored.close();}
  let decodedImages=0;const sharp=require('sharp');
  for(const file of manifest.files.filter(f=>f.path.startsWith('images/'))){await sharp(path.join(target,file.path)).metadata();decodedImages++;}
  global.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input.url||String(input));
   if(url.hostname!=='127.0.0.1'||!['GET','HEAD'].includes(options.method||'GET')){externalCalls++;throw Error('Recovery forbids external network calls and mutations');}
   return originalFetch(input,options);
  };
  const deny=async()=>{externalCalls++;throw Error('Recovery provider operation blocked');};
  const adminToken=crypto.randomBytes(32).toString('hex');
  stage('isolated-application-reads');
  const {createApp}=require('../server');validateEnvironment(process.env);
  ctx=createApp({dataDir:target,seedProducts:[],designerTokens:{},adminTokens:{},adminToken,sendEmail:deny,stripeApi:deny,houseAiFetch:deny});
  for(const table of tables)if(ctx.db.prepare('SELECT COUNT(*) n FROM '+table).get().n!==counts[table])throw Error('Application startup changed restored core record counts');
  server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+adminToken};
  const get=async(route,privateRoute=false)=>{const response=await fetch(origin+route,{headers:privateRoute?headers:{}});if(!response.ok)throw Error('Restored application read check failed');return response;};
  await get('/api/health');
  const catalog=await(await get('/api/admin/listings',true)).json();
  const actualIds=new Set(catalog.items.map(item=>item.id));if(listingIds.some(id=>!actualIds.has(id)))throw Error('Restored listings missing from application');
  let ordersRead=0;for(const id of orderIds){const data=await(await get('/api/admin/orders/'+encodeURIComponent(id),true)).json();if(data.order?.id!==id)throw Error('Restored order mismatch');ordersRead++;}
  const gallery=await(await get('/api/gallery')).json();let imageResponses=0;
  for(const item of gallery.items||[])for(const image of item.images||[]){if(!image.url?.startsWith('/media/'))continue;const response=await get(image.url);if(!response.headers.get('content-type')?.startsWith('image/'))throw Error('Restored image response is not an image');if(!(await response.arrayBuffer()).byteLength)throw Error('Empty restored image response');imageResponses++;}
  if(decodedImages&&gallery.items?.length&&!imageResponses)throw Error('No restored public photos were served');
  if(externalCalls)throw Error('Recovery attempted a prohibited provider call');
  const report={result:'PASS',startedAt,completedAt:new Date().toISOString(),backupPrefix:prefix,manifestSha256:crypto.createHash('sha256').update(manifestBytes).digest('hex'),verifiedFiles:manifest.files.length,totalBytes,sqliteIntegrity:'ok',counts,listingReads:listingIds.length,orderReads:ordersRead,decodedImages,imageResponses,providerCalls:externalCalls,backupBucketWrites:0,liveDataWrites:0};
  console.log('RECOVERY_DRILL_RESULT '+JSON.stringify(report));
  return report;
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  ctx?.analyticsIngest?.close();ctx?.db.close();global.fetch=originalFetch;
  fs.rmSync(root,{recursive:true,force:true});
 }
}
if(require.main===module)main().catch(()=>{console.error('RECOVERY_DRILL_FAILED: restore or isolated read checks did not pass; no production or bucket writes were attempted.');process.exitCode=1;});
module.exports={validateEnvironment,validateManifest,main};
