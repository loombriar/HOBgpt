const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const readySeller=require('../tests/helpers/ready-seller');

for(const signedIn of [false,true])test(`${signedIn?'signed-in':'guest'} mobile order journey joins checkout, designer tracking and buyer support`,async({page,browser})=>{
 test.setTimeout(90000);
 const width=signedIn?390:320;
 await page.setViewportSize({width,height:844});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-mobile-journey-'));
 const oldKey=process.env.SHIPPO_API_KEY,oldSecret=process.env.SHIPPO_WEBHOOK_SECRET;
 process.env.SHIPPO_API_KEY='shippo_test_mobile_fixture';process.env.SHIPPO_WEBHOOK_SECRET='journey-webhook-secret';
 const mail=[],calls=[],sessions=new Map();let callback,designerContext;
 const ctx=createApp({dataDir:dir,seedProducts:[{id:'journey-piece',designerId:'journey-maker',title:'Mobile Journey Piece',price:60,category:'fashion',shippingCostCents:0}],designerTokens:{'journey-seller-token':'journey-maker'},sendEmail:async message=>{mail.push(message);return true;},
  stripeApi:async(endpoint,options={})=>{
   calls.push(endpoint);
   if(endpoint.startsWith('accounts/'))return{details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
   if(endpoint==='checkout/sessions'){
    const body=new URLSearchParams(options.body),id='cs_test_mobile_journey';
    sessions.set(id,{id,metadata:{order_id:body.get('metadata[order_id]')},currency:'usd',amount_total:6000,status:'complete',payment_status:'paid',payment_intent:'pi_test_journey',customer_details:{email:'journey@example.test'},shipping_details:{name:'Sample Buyer',address:{line1:'1 Test Lane',city:'Test City',state:'OH',postal_code:'44101',country:'US'}}});
    callback=body.get('success_url').replace('{CHECKOUT_SESSION_ID}',id);return{id,url:callback};
   }
   if(endpoint==='checkout/sessions/cs_test_mobile_journey')return sessions.get('cs_test_mobile_journey');
   throw new Error('Unexpected provider operation '+endpoint);
  },
  verifyShipmentTracking:async()=>({verified:false,id:'test-tracker',carrier:'USPS',status:'submitted'}),
  fetch:async url=>{if(!String(url).startsWith('https://api.goshippo.com/tracks/'))throw new Error('Unexpected shipping request');return new Response(JSON.stringify({tracking_number:'JOURNEY123456',tracking_status:{status:'TRANSIT'},test:true}),{status:200,headers:{'Content-Type':'application/json'}});}
 });
 readySeller(ctx.db,'journey-maker');
 ctx.db.prepare("UPDATE designer_profiles SET brand_name='Journey Atelier' WHERE id='journey-maker'").run();
 ctx.db.prepare("UPDATE listings SET handling_days_min=3,handling_days_max=7 WHERE id='journey-piece'").run();
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const noOverflow=async target=>expect(await target.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
 try{
  if(signedIn){
   const requested=await page.request.post(origin+'/api/customer/signin-code',{headers:{Origin:origin},data:{email:'journey@example.test',name:'Sample Buyer',acceptedRules:true}});expect(requested.status()).toBe(202);
   const {requestId}=await requested.json(),code=mail.findLast(m=>m.subject==='Your House of Briar sign-in code').text.match(/\b\d{6}\b/)[0];
   expect((await page.request.post(origin+'/api/customer/verify-code',{headers:{Origin:origin},data:{requestId,code}})).ok()).toBeTruthy();
  }
  await page.goto(origin+'/shop/journey-piece');await page.getByRole('button',{name:'Add to cart',exact:true}).click();await noOverflow(page);
  await page.getByRole('link',{name:'Added · View cart',exact:true}).click();await expect(page.getByText('Mobile Journey Piece',{exact:true})).toBeVisible();await page.getByRole('link',{name:'Continue to checkout',exact:true}).click();await noOverflow(page);
  await expect(page.getByText('3–7 business days of preparation before shipment.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Continue to secure checkout',exact:true}).click();await expect(page).toHaveURL(callback);
  await expect(page.getByRole('heading',{name:'Order confirmed',exact:true})).toHaveCount(1);await expect(page.getByText('Paid · Awaiting shipment',{exact:true})).toBeVisible();await noOverflow(page);
  const orderId=sessions.get('cs_test_mobile_journey').metadata.order_id;
  expect(ctx.db.prepare('SELECT buyer_subject FROM orders WHERE id=?').get(orderId).buyer_subject===null).toBe(!signedIn);
  designerContext=await browser.newContext({viewport:{width,height:844}});const designer=await designerContext.newPage();
  expect((await designer.request.post(origin+'/api/session',{headers:{Authorization:'Bearer journey-seller-token'}})).ok()).toBeTruthy();
  await designer.goto(origin+'/account#orders');await expect(designer.getByRole('heading',{name:'Mobile Journey Piece',exact:true})).toBeVisible();
  await designer.getByText('Practice shipping · 5 steps',{exact:true}).click();await expect(designer.getByText('Pack the piece',{exact:true})).toBeVisible();await noOverflow(designer);
  await designer.getByRole('textbox',{name:'Shipping carrier',exact:true}).fill('USPS');await designer.getByRole('textbox',{name:'Tracking number',exact:true}).fill('JOURNEY123456');await designer.getByRole('button',{name:'Add tracking',exact:true}).click();
  await expect.poll(()=>ctx.db.prepare('SELECT tracking_status FROM designer_transfers WHERE order_id=?').get(orderId)?.tracking_status).toBe('submitted');
  await page.goto(callback);await expect(page.getByText('Tracking added · Waiting for a carrier update',{exact:true})).toBeVisible();
  const webhook=await page.request.post(origin+'/api/shippo/webhook',{headers:{'x-shippo-webhook-secret':'journey-webhook-secret'},data:{event:'track_updated',data:{carrier:'usps',tracking_number:'JOURNEY123456',tracking_status:{status:'DELIVERED'}}}});expect(webhook.ok()).toBeTruthy();
  await page.reload();await expect(page.getByText('Sample tracking · No real shipment',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Track with USPS',exact:true})).toHaveCount(0);await noOverflow(page);
  expect(ctx.db.prepare('SELECT status,tracking_verified_at FROM designer_transfers WHERE order_id=?').get(orderId)).toEqual({status:'pending',tracking_verified_at:null});
  if(signedIn){
   await page.goto(origin+'/account#purchases');const receipt=page.getByRole('article',{name:'Order '+orderId.slice(-8).toUpperCase(),exact:true});await expect(receipt).toContainText('Journey Atelier');await expect(receipt).toContainText('3–7 business days');await receipt.getByRole('button',{name:'Get help with this order',exact:true}).click();
   await expect(page.getByRole('combobox',{name:'Order (optional)',exact:true})).toHaveValue(orderId);
   await page.getByRole('textbox',{name:'How can we help?',exact:true}).fill('Please review a return request for this sample order.');await page.getByRole('button',{name:'Send to customer service',exact:true}).click();
   await expect(page.getByText('Sent. Customer service will review your message.',{exact:true})).toBeVisible();expect(ctx.db.prepare('SELECT order_id FROM support_messages').get().order_id).toBe(orderId);await noOverflow(page);
  }else{
   await expect(page.getByRole('link',{name:'Get help with this order',exact:true})).toHaveAttribute('href',new RegExp('mailto:thee.house.of.briar@gmail.com.*'+orderId));
   expect((await page.request.get(origin+'/api/my/purchases')).status()).toBe(401);
   await expect(page.getByText('Keep this receipt page',{exact:false})).toBeVisible();
   const returningGuest=await browser.newContext({viewport:{width,height:844}});
   try{
    const receiptPage=await returningGuest.newPage();await receiptPage.goto(callback);
    await expect(receiptPage.getByRole('heading',{name:'Order confirmed',exact:true})).toBeVisible();
    await expect(receiptPage.getByText('Journey Atelier',{exact:true})).toBeVisible();
    await expect(receiptPage.getByText('Sample tracking · No real shipment',{exact:true})).toBeVisible();
    await expect(receiptPage.getByRole('link',{name:'Get help with this order',exact:true})).toHaveAttribute('href',new RegExp('mailto:thee.house.of.briar@gmail.com.*'+orderId));
    await noOverflow(receiptPage);
    expect((await receiptPage.request.get(origin+'/api/my/purchases')).status()).toBe(401);
   }finally{await returningGuest.close();}

  }
  expect(calls.filter(x=>x==='checkout/sessions')).toHaveLength(1);expect(calls.some(x=>x==='transfers'||x==='refunds')).toBe(false);
 }finally{
  await designerContext?.close();await page.goto('about:blank');await new Promise(resolve=>server.close(resolve));ctx.analyticsIngest.close();ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});
  if(oldKey===undefined)delete process.env.SHIPPO_API_KEY;else process.env.SHIPPO_API_KEY=oldKey;if(oldSecret===undefined)delete process.env.SHIPPO_WEBHOOK_SECRET;else process.env.SHIPPO_WEBHOOK_SECRET=oldSecret;
 }
});
