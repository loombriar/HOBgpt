const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('portfolio and studio photo uploads are rate-limited before Multer and Sharp work',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-photo-throttle-'));
  const ctx=createApp({dataDir:dir,seedProducts:[],adminToken:'test'});
  const server=ctx.app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const route of ['/api/creative-house/my-portfolio/images','/api/my/studio-photo']){
      // Authentication is still required; anonymous attempts must not consume upload quota.
      const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/octet-stream'},body:'invalid'});
      assert.equal(response.status,401);
    }
    // The configured limiter must precede multipart parsing, so once identity has
    // been established, over-limit requests are rejected without image decoding.
    const portfolio=require('node:fs').readFileSync(path.join(__dirname,'../portfolio-subscriptions.js'),'utf8');
    const studio=require('node:fs').readFileSync(path.join(__dirname,'../house-experiences.js'),'utf8');
    assert.match(portfolio,/authBuyer,portfolioImageLimiter,upload\.single\('image'\)/);
    assert.match(studio,/authDesigner,studioPhotoLimiter,upload\.single\('image'\)/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    ctx.analyticsIngest?.close?.();ctx.db.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
