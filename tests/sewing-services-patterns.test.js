const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');const {once}=require('node:events');
const {createApp}=require('../server'),ready=require('./helpers/ready-seller');
async function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-services-')),emails=[],calls=[];let session;
 const ctx=createApp({dataDir:dir,designerTokens:{seller:'maker',other:'other'},seedProducts:[{id:'seed',designerId:'maker',title:'Seed',price:20}],sendEmail:async m=>{emails.push(m);return true;},stripeApi:async(endpoint,options)=>{calls.push({endpoint,options});if(endpoint.startsWith('accounts/'))return {details_submitted:true,payouts_enabled:true,requirements:{currently_due:[]}};if(endpoint==='checkout/sessions'){session={id:'cs_patterns_abcdefghijklmnop',url:'https://checkout.stripe.test/test',status:'open',payment_status:'unpaid',currency:'usd',amount_total:2000,metadata:{order_id:new URLSearchParams(options.body).get('metadata[order_id]')}};return session;}if(endpoint.startsWith('checkout/sessions/'))return session;if(endpoint==='transfers')return {id:'tr_digital_test'};throw Error('Unexpected provider operation '+endpoint);}});ready(ctx.db,'maker');
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const call=(url,body,token,method=body?'POST':'GET')=>fetch(base+url,{method,headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 try{await run({ctx,base,call,calls,setSession:v=>Object.assign(session,v)});}finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('sewing profiles publish only opted-in fields and isolate private requests',()=>fixture(async f=>{
 const profile={displayName:'Ohio Sewing Studio',location:'Columbus, Ohio',bio:'Repairs, fittings and sample making for independent designers.',services:['repairs','sample-making'],modes:['local','mail-in','designer-work'],published:false};
 let r=await f.call('/api/my/sewing-services',profile,'seller','PUT');assert.equal(r.status,200,await r.clone().text());const id=(await r.json()).profile.id;
 assert.deepEqual((await(await f.call('/api/sewing-services')).json()).profiles,[]);
 r=await f.call('/api/my/sewing-services',{...profile,published:true},'seller','PUT');assert.equal(r.status,200);
 const publicData=await(await f.call('/api/sewing-services')).json();assert.equal(publicData.profiles.length,1);assert.ok(!JSON.stringify(publicData).includes('owner_subject'));assert.ok(!JSON.stringify(publicData).includes('email'));
 const request={title:'Repair a torn coat',details:'The coat has a torn lining and needs the seam repaired carefully.',service:'repairs',mode:'mail-in'};
 assert.equal((await f.call('/api/sewing-services/'+id+'/requests',request)).status,401);
 r=await f.call('/api/sewing-services/'+id+'/requests',request,'other');assert.equal(r.status,201,await r.clone().text());const requestId=(await r.json()).id;
 const own=await(await f.call('/api/my/sewing-service-requests',null,'seller')).json(),other=await(await f.call('/api/my/sewing-service-requests',null,'other')).json();assert.equal(own.incoming.length,1);assert.equal(other.incoming.length,0);assert.equal(other.outgoing.length,1);
 assert.equal((await f.call('/api/my/sewing-service-requests/'+requestId,{status:'accepted'},'other','PATCH')).status,404);
 assert.equal((await f.call('/api/my/sewing-service-requests/'+requestId,{status:'accepted'},'seller','PATCH')).status,200);
 assert.equal((await f.call('/api/sewing-services/'+id+'/requests',{...request,service:'not-offered'},'other')).status,422);
}));
test('custom wedding service settings appear on storefront and designer search data',()=>fixture(async f=>{
 assert.equal((await f.call('/api/my/designer-services',{services:['custom-wedding-dresses'],details:'Consultation and fitting by appointment.'},'seller','PUT')).status,200);
 const profile=await(await f.call('/api/designers/maker')).json();assert.deepEqual(profile.designer.services,['custom-wedding-dresses']);
 const list=await(await f.call('/api/designers')).json();assert.ok(list.designers.find(d=>d.id==='maker').services.includes('custom-wedding-dresses'));
 assert.equal((await f.call('/api/my/designer-services',{services:['invented']},'seller','PUT')).status,422);
}));
test('PDF checkout snapshots a private file, omits shipping, and blocks unpaid, foreign and refunded downloads',()=>fixture(async f=>{
 let r=await f.call('/api/listings',{title:'Original dress PDF pattern',description:'Printable dress pattern sizes XS–XL with sewing instructions.',price:20,category:'patterns',style:'PDF pattern',productionType:'Made in Multiple'},'seller');assert.equal(r.status,201,await r.clone().text());const item=(await r.json()).item;assert.equal(item.productionType,'Made to Order');
 f.ctx.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(item.id);
 assert.equal((await f.call('/api/checkout/quote',{items:[{id:item.id,quantity:1}]})).status,409);
 async function upload(content='%PDF-1.7\nOriginal pattern file'){const form=new FormData();form.set('file',new Blob([content],{type:'application/pdf'}),'pattern.pdf');form.set('rightsConfirmed','true');return fetch(f.base+'/api/my/pattern-files/'+item.id,{method:'PUT',headers:{Authorization:'Bearer seller',Origin:f.base},body:form});}
 assert.equal((await upload('<html>not a PDF</html>')).status,422);r=await upload();assert.equal(r.status,200,await r.clone().text());assert.equal(f.ctx.db.prepare('SELECT status FROM listings WHERE id=?').get(item.id).status,'draft');
 f.ctx.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(item.id);
 r=await f.call('/api/checkout/session',{items:[{id:item.id,quantity:1}]},'other');assert.equal(r.status,201,await r.clone().text());const checkout=await r.json();const request=f.calls.find(c=>c.endpoint==='checkout/sessions');assert.equal(new URLSearchParams(request.options.body).has('shipping_address_collection[allowed_countries][0]'),false);
 const guest='/api/checkout/session/'+checkout.sessionId+'/download/'+item.id,owner='/api/my/purchases/'+checkout.orderId+'/download/'+item.id;
 assert.equal((await f.call(guest)).status,404);assert.equal((await f.call(owner,null,'seller')).status,404);
 const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='whsec_pattern_test';try{const event={id:'evt_pattern_paid',type:'checkout.session.async_payment_succeeded',data:{object:{id:checkout.sessionId,metadata:{order_id:checkout.orderId},payment_status:'paid',currency:'usd',amount_total:2000,payment_intent:'pi_pattern_test'}}},raw=JSON.stringify(event),t=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
 r=await fetch(f.base+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${t},v1=${sig}`},body:raw});assert.equal(r.status,200,await r.clone().text());
 }finally{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;}
 r=await f.call(guest);assert.equal(r.status,200);assert.match(await r.text(),/Original pattern file/);assert.equal((await f.call(owner,null,'seller')).status,404);assert.equal((await f.call(owner,null,'other')).status,200);
 assert.equal(f.calls.filter(c=>c.endpoint==='transfers').length,1,'verified digital fulfillment releases exactly one seller transfer');
 await upload('%PDF-1.7\nReplacement file');r=await f.call(guest);assert.match(await r.text(),/Original pattern file/,'buyers retain the purchased version');
 f.ctx.db.prepare("UPDATE orders SET refund_status='succeeded' WHERE id=?").run(checkout.orderId);assert.equal((await f.call(guest)).status,404);
}));

test('paper patterns use stock and collect a delivery address',()=>fixture(async f=>{
 const r=await f.call('/api/listings',{title:'Printed dress pattern',description:'Paper sewing templates and instructions.',price:20,category:'patterns',style:'Paper pattern',productionType:'Made in Multiple',stockQuantity:5},'seller');assert.equal(r.status,201,await r.clone().text());const {item}=await r.json();assert.equal(item.availableQuantity,5);f.ctx.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(item.id);
 const checkout=await f.call('/api/checkout/session',{items:[{id:item.id,quantity:1}]});assert.equal(checkout.status,201,await checkout.clone().text());assert.equal(new URLSearchParams(f.calls.find(c=>c.endpoint==='checkout/sessions').options.body).get('shipping_address_collection[allowed_countries][0]'),'US');
 assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM order_pattern_files').get().n,0);
}));
