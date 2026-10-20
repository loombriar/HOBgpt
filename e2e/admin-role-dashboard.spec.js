const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
let appContext,server,dataDir,origin;
test.beforeAll(async()=>{
  // Separate app and limiter state: these logins must not consume the shared
  // browser suite's real administrator login budget.
  const previous=process.env.ADMIN_TOKENS_JSON;
  process.env.ADMIN_TOKENS_JSON=JSON.stringify({
    reviewFixture:{token:'e2e-reviewer-fixture-token',role:'reviewer'},
    supportFixture:{token:'e2e-support-fixture-token',role:'support'}
  });
  dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-role-dashboard-'));
  try{appContext=createApp({dataDir,seedProducts:[]});}
  finally{if(previous===undefined)delete process.env.ADMIN_TOKENS_JSON;else process.env.ADMIN_TOKENS_JSON=previous;}
  server=appContext.app.listen(0,'127.0.0.1');
  await once(server,'listening');
  origin='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(appContext)appContext.db.close();
  if(dataDir)fs.rmSync(dataDir,{recursive:true,force:true});
});

for(const role of ['reviewer','support']){
  test(`${role} opens only its work queue, restores the session and signs out`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const requests=[];
    page.on('request',request=>{if(request.url().includes('/api/admin/'))requests.push(new URL(request.url()).pathname);});
    await page.goto(origin+'/admin');
    await page.getByRole('textbox',{name:'Admin access token',exact:true}).fill(`e2e-${role}-fixture-token`);
    await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
    const heading=role==='reviewer'?'Product Review Queue':'Customer support inbox';
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Sign out of admin',exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'Admin access token',exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Message a designer',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Save response',exact:true})).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    const forbidden=role==='reviewer'?'/api/admin/support':'/api/admin/listings/review-queue';
    expect(requests).not.toContain('/api/admin/operations');
    expect(requests).not.toContain(forbidden);
    expect((await page.request.get(origin+forbidden)).status()).toBe(403);
    const allowed=role==='reviewer'?'/api/admin/listings/review-queue':'/api/admin/support';
    expect((await page.request.get(origin+allowed)).status()).toBe(200);
    await page.getByRole('button',{name:'Sign out of admin',exact:true}).click();
    await expect(page.getByRole('button',{name:'Open dashboard',exact:true})).toBeVisible();
    expect((await page.request.get(origin+allowed)).status()).toBe(401);
    expect((await page.request.get(origin+'/api/admin/session')).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toHaveCount(0);
  });
}
