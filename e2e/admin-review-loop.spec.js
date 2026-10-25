const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');
let ctx,server,dataDir,origin;
test.beforeAll(async()=>{
 dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-review-loop-'));
 ctx=createApp({dataDir,seedProducts:[],designerTokens:{'review-loop-designer-token':'review-maker'},adminToken:'review-loop-admin-token',stripeApi:async endpoint=>{
  if(endpoint==='accounts/acct_fixture_review-maker')return {details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
  throw new Error('Unexpected Stripe fixture operation '+endpoint);
 }});
 ctx.db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('review-maker',SELLER_TERMS_VERSION,new Date().toISOString(),'e2e-fixture');
 server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 origin='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(ctx)ctx.db.close();
 if(dataDir)fs.rmSync(dataDir,{recursive:true,force:true});
});

test('mobile review loop delivers feedback, resubmission and approval alerts',async({page,browser})=>{
 test.setTimeout(90000);page.setDefaultTimeout(10000);await page.setViewportSize({width:390,height:844});
 const creatorContext=await browser.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin},viewport:{width:390,height:844}}),creator=await creatorContext.newPage();
 creator.setDefaultTimeout(10000);
 let id;
 try{
  expect((await creator.request.post('/api/session',{headers:{Authorization:'Bearer review-loop-designer-token'}})).ok()).toBeTruthy();
  const created=await creator.request.post('/api/listings',{data:{title:'Review Loop Dress',price:75,category:'apparel',description:'A sample handmade dress',productionType:'One of a Kind'}});
  expect(created.ok(),await created.text()).toBeTruthy();id=(await created.json()).item.id;
  const image=await require('sharp')({create:{width:32,height:32,channels:3,background:'#af4763'}}).png().toBuffer();
  const previousKey=process.env.OPENAI_API_KEY,realFetch=global.fetch;
  process.env.OPENAI_API_KEY='review-loop-image-fixture';
  global.fetch=(url,options)=>String(url)==='https://api.openai.com/v1/responses'
   ? Promise.resolve(new Response(JSON.stringify({output_text:JSON.stringify({allow:true,needsHumanReview:false,reason:'Fixture product photo'})}),{status:200,headers:{'Content-Type':'application/json'}}))
   : realFetch(url,options);
  let uploaded;
  try{uploaded=await creator.request.post(`/api/listings/${id}/images`,{multipart:{clientImageKey:'review-loop-'+id,image:{name:'sample.png',mimeType:'image/png',buffer:image}}});}finally{global.fetch=realFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
  expect(uploaded.ok(),await uploaded.text()).toBeTruthy();
  expect((await creator.request.post(`/api/listings/${id}/submit`,{data:{marketplaceRulesAccepted:true}})).ok()).toBeTruthy();
  await page.goto(origin+'/admin');await page.getByLabel('Admin access token').fill('review-loop-admin-token');await page.getByRole('button',{name:'Open dashboard',exact:true}).click();
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review Loop Dress',exact:true})});
  await expect(card).toBeVisible();
  await expect.poll(()=>card.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await card.getByLabel('Change category',{exact:true}).selectOption({label:'Needs clearer product details'});
  await card.getByRole('button',{name:'Request changes',exact:true}).click();
  await expect(page.getByText('Explain what the designer needs to change.',{exact:true})).toBeVisible();await expect(card).toBeVisible();
  await card.getByLabel('Additional details',{exact:true}).fill('Please add waist and length measurements.');
  await card.getByRole('button',{name:'Request changes',exact:true}).click();await expect(card).toHaveCount(0);
  const alerts=await(await creator.request.get('/api/my/designer-notifications')).json();
  const feedback=alerts.items.find(n=>n.listingId===id&&n.title==='Changes requested');expect(feedback.readAt).toBeNull();expect(feedback.body).toContain('waist and length');
  await creator.goto(feedback.actionPath);
  let piece=creator.locator('#listing-'+id);await expect(piece).toContainText('Please add waist and length measurements.');
  await piece.getByRole('button',{name:'Edit & resubmit',exact:true}).click();
  await creator.getByRole('button',{name:'3. Measurements',exact:true}).click();
  await creator.getByLabel('Garment measurements',{exact:true}).fill('Waist 30 in; length 40 in');
  await creator.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(creator.getByText('Draft saved. Submit it for review when it is ready.',{exact:true})).toBeVisible();
  await creator.getByRole('navigation',{name:'Designer studio sections'}).getByRole('link',{name:'My listings',exact:true}).click();
  piece=creator.locator('#listing-'+id);await piece.getByRole('checkbox').last().check();
  await piece.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(piece).toContainText('Pending review');
  expect((await(await creator.request.get('/api/gallery')).json()).items.some(x=>x.id===id)).toBe(false);
  await page.reload();await expect(card).toContainText('Waist 30 in');
  const approvalResponse=()=>page.waitForResponse(response=>response.url()===origin+'/api/admin/listings/'+id+'/approve'&&response.request().method()==='POST');
  let responsePromise=approvalResponse();
  await card.getByRole('button',{name:'Approve',exact:true}).click();
  const blocked=await responsePromise;expect(blocked.status()).toBe(409);
  expect((await blocked.json()).error.code).toBe('payout_setup_required');
  await expect(page.getByText('Designer must finish Stripe payout setup before this piece can go on sale.',{exact:true})).toBeVisible();
  await expect(card).toBeVisible();
  require('../tests/helpers/ready-seller')(ctx.db,'review-maker');
  responsePromise=approvalResponse();
  await card.getByRole('button',{name:'Approve',exact:true}).click();
  const accepted=await responsePromise;expect(accepted.ok(),await accepted.text()).toBeTruthy();
  await expect(card).toHaveCount(0);
  const approved=await(await creator.request.get('/api/my/designer-notifications')).json();expect(approved.items.some(n=>n.listingId===id&&n.title==='Listing approved'&&!n.readAt)).toBe(true);
  expect((await(await creator.request.get('/api/gallery')).json()).items.some(x=>x.id===id)).toBe(true);
  await creator.reload();await expect(creator.locator('#listing-'+id)).toContainText('Live');
  for(const tab of [page,creator])expect(await tab.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 }finally{await creatorContext.close();}
});
