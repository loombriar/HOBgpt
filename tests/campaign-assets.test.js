const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('homepage campaign and rose gold logos are served as image bytes',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-campaign-assets-'));
  const root=path.join(dir,'site');fs.mkdirSync(path.join(root,'public'),{recursive:true});
  const assets=['atelier-emine-campaign-v1.webp','house-logo-rosegold-v4.webp','house-monogram-rosegold-v4.webp'];
  for(const asset of assets)fs.copyFileSync(path.join(__dirname,'..','public',asset),path.join(root,'public',asset));
  const ctx=createApp({rootDir:root,dataDir:path.join(dir,'data'),seedProducts:[],designerTokens:{}});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    for(const asset of assets){
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/'+asset);
      assert.equal(response.status,200,asset);
      assert.match(response.headers.get('content-type'),/^image\/webp/,asset);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),fs.readFileSync(path.join(root,'public',asset)),asset);
    }
  }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
