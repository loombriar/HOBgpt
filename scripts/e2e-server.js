const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const { createApp }=require('../server');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-e2e-'));
const { app,db }=createApp({dataDir,designerTokens:{'e2e-designer-token':'maker'},adminToken:'e2e-admin-token',seedProducts:[]});
const port=Number(process.env.PORT||4173);
const server=app.listen(port,'127.0.0.1',()=>console.log('E2E server listening on '+port));
const close=()=>server.close(()=>{db.close();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0)});
process.on('SIGINT',close);process.on('SIGTERM',close);
