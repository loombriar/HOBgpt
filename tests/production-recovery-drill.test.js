const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {validateEnvironment,validateManifest,main}=require('../scripts/production-recovery-drill');
const env={NODE_ENV:'test',RECOVERY_DRILL_ENABLED:'true',BACKUP_S3_BUCKET:'house-of-briar-backups',RECOVERY_BACKUP_PREFIX:'house-of-briar/2026-10-17T23-55-05-397Z/'};
test('recovery refuses live mode, credentials, live service and unselected backups',()=>{
 assert.doesNotThrow(()=>validateEnvironment(env));
 for(const patch of [{NODE_ENV:'production'},{RECOVERY_DRILL_ENABLED:'false'},{RAILWAY_SERVICE_NAME:'house-of-briar'},{STRIPE_SECRET_KEY:'test'},{RESEND_API_KEY:'test'},{ADMIN_TOKEN:'test'},{BACKUP_S3_BUCKET:'other'},{RECOVERY_BACKUP_PREFIX:'../'},{OFFSITE_BACKUP_ENABLED:'true'}])assert.throws(()=>validateEnvironment({...env,...patch}));
});
test('recovery rejects traversal, duplicate paths and invalid metadata before writing data',()=>{
 const file={path:'catalog.sqlite',size:10,sha256:'a'.repeat(64)};
 const manifest={version:2,database:'catalog.sqlite',files:[file]};assert.equal(validateManifest(manifest),10);
 assert.equal(validateManifest({...manifest,files:[file,{...file,path:'metadata/state.json'}]}),20);
 for(const files of [[{...file,path:'/catalog.sqlite'}],[{...file,path:'images/./photo.webp'}],[{...file,path:'images//photo.webp'}],[{...file,path:'../catalog.sqlite'}],[file,file],[{...file,size:-1}],[{...file,sha256:'bad'}],[{...file,path:'images/other.webp'}]])assert.throws(()=>validateManifest({...manifest,files}));
});
test('downloaded snapshot restores records and serves real images through an isolated app',async()=>{
 const {createApp}=require('../server');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hob-recovery-fixture-')),data=path.join(root,'data'),snapshot=path.join(root,'backup');
 const ctx=createApp({dataDir:data,seedProducts:[{id:'piece',designerId:'maker',title:'Fixture piece',price:20}],designerTokens:{},adminToken:'fixture'});
 require('./helpers/ready-seller')(ctx.db,'maker');
 const image=await require('sharp')({create:{width:10,height:10,channels:3,background:'#ffffff'}}).webp().toBuffer();
 fs.writeFileSync(path.join(ctx.imagesDir,'photo.webp'),image);
 ctx.db.prepare("INSERT INTO listing_images(id,listing_id,client_image_key,storage_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at) VALUES ('photo','piece','client','photo.webp',0,'image/webp',?,10,10,'fixture','ready',?)").run(image.length,new Date().toISOString());
 ctx.db.prepare("INSERT INTO orders(id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('order','canceled',2000,180,1820,?)").run(new Date().toISOString());
 fs.writeFileSync(path.join(data,'recovery-state.json'),'{}');
 ctx.analyticsIngest.close();ctx.db.close();
 const backup=spawnSync(process.execPath,['scripts/backup-data.js','--output',snapshot],{env:{...process.env,DATA_DIR:data},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);
 const old={};const keys=new Set([...Object.keys(env),...Object.keys(process.env).filter(k=>/^(STRIPE_|SHIPPO_|SMTP_|SENDGRID_|RESEND_|PAYPAL_)/.test(k)), 'OPENAI_API_KEY','ADMIN_TOKEN','ADMIN_TOKENS','ADMIN_TOKENS_JSON','DESIGNER_TOKENS_JSON','DESIGNER_IDENTITY_MAP_JSON','RAILWAY_SERVICE_NAME','OFFSITE_BACKUP_ENABLED']);
 for(const key of keys){old[key]=process.env[key];delete process.env[key];}Object.assign(process.env,env);
 try{
  const reads=[];const report=await main({download:async key=>{reads.push(key);assert.ok(key.startsWith(env.RECOVERY_BACKUP_PREFIX));const relative=key.slice(env.RECOVERY_BACKUP_PREFIX.length);return new Response(fs.readFileSync(path.join(snapshot,relative)));}});
  assert.equal(report.result,'PASS');assert.equal(report.counts.listings,1);assert.equal(report.orderReads,1);assert.equal(report.decodedImages,1);assert.equal(report.imageResponses,1);assert.equal(report.providerCalls,0);assert.equal(report.liveDataWrites,0);assert.equal(reads.length,report.verifiedFiles+1);
 }finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}fs.rmSync(root,{recursive:true,force:true});}
});
