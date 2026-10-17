const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const readySeller=require('../tests/helpers/ready-seller');

for(const outcome of ['paid','unpaid','canceled'])test('server-generated '+outcome+' callback runs checkout verification and cart recovery',async({page})=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-callback-browser-'));
 const sessions=new Map();let callback;
 const ctx=createApp({dataDir,seedProducts:[{id:'callback-piece',designerId:'maker',title:'Callback Piece',price:50,shippingCostCents:0}],sendEmail:async()=>true,stripeApi:async(endpoint,request={})=>{
  if(endpoint.startsWith('accounts/'))return {details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
  if(endpoint==='checkout/sessions'){
   const body=new URLSearchParams(request.body),id='cs_callback_mock';
   const session={id,metadata:{order_id:body.get('metadata[order_id]')},currency:'usd',amount_total:5000,status:outcome==='canceled'?'open':'complete',payment_status:outcome==='paid'?'paid':'unpaid',payment_intent:'pi_callback_mock',shipping_details:{name:'Mock Buyer',address:{line1:'1 Test Lane',city:'Test City',postal_code:'44101',country:'US'}}};
   sessions.set(id,session);callback=(outcome==='canceled'?body.get('cancel_url'):body.get('success_url').replace('{CHECKOUT_SESSION_ID}',id));
   return {id,url:callback};
  }
  if(endpoint==='checkout/sessions/cs_callback_mock/expire'){const session=sessions.get('cs_callback_mock');session.status='expired';return session;}
  if(endpoint==='checkout/sessions/cs_callback_mock')return sessions.get('cs_callback_mock');
  throw new Error('Unexpected mock endpoint '+endpoint);
 }});
 readySeller(ctx.db,'maker');
 ctx.db.prepare("UPDATE listings SET handling_days_min=2,handling_days_max=5 WHERE id='callback-piece'").run();
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  await page.goto(origin+'/shop');
  await page.evaluate(()=>localStorage.setItem('house-of-briar:cart',JSON.stringify(['callback-piece'])));
  await page.goto(origin+'/checkout');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/checkout/session')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Continue to secure checkout',exact:true}).click();
  const response=await responsePromise;expect(response.status()).toBe(201);const orderId=sessions.get('cs_callback_mock').metadata.order_id;
  await expect(page).toHaveURL(callback);expect(new URL(callback).pathname).toBe('/checkout');
  if(outcome==='paid'){
   await expect(page.getByRole('heading',{name:'Order confirmed',exact:true})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Order confirmed',exact:true})).toHaveCount(1);
   await expect(page.getByText('2–5 business days of preparation before shipment.',{exact:false})).toBeVisible();
   await expect(page.getByText('Paid · Awaiting shipment',{exact:true})).toBeVisible();
   expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('house-of-briar:cart')))).toEqual([]);
   expect(await page.evaluate(()=>localStorage.getItem('house-of-briar:checkout-pending'))).toBeNull();
   expect(ctx.db.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status).toBe('paid');
   expect(ctx.db.prepare('SELECT status FROM inventory_reservations WHERE order_id=?').get(orderId).status).toBe('sold');
  }else{
   if(outcome==='unpaid')await expect(page.getByText('Stripe has not marked this payment as paid. Your cart is unchanged.',{exact:true})).toBeVisible();
   else{
    await expect.poll(()=>ctx.db.prepare('SELECT status FROM orders WHERE id=?').get(orderId).status).toBe('canceled');
    expect(ctx.db.prepare('SELECT status FROM inventory_reservations WHERE order_id=?').get(orderId).status).toBe('released');
    expect(await page.evaluate(()=>localStorage.getItem('house-of-briar:checkout-pending'))).toBeNull();
   }
   expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('house-of-briar:cart')))).toEqual(['callback-piece']);
  }
 }finally{await page.goto('about:blank');await new Promise(resolve=>server.close(resolve));ctx.analyticsIngest.close();ctx.db.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
