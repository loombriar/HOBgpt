const {test}=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const crypto=require('node:crypto');
const {createApp}=require('../server');const {setupSellerReview,reviewFor}=require('../lib/atelier-seller-review');
const API='/api/supplier-review/atelier-emine';
async function fixture(environment='staging'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-seller-review-'));const old=process.env.RAILWAY_ENVIRONMENT_NAME;let ctx;
 process.env.RAILWAY_ENVIRONMENT_NAME=environment;
 try{ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{},adminToken:'review-admin-test',stripeApi:async()=>{throw Error('Seller review cannot call Stripe')}})}finally{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT_NAME;else process.env.RAILWAY_ENVIRONMENT_NAME=old;}
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const call=(route,{admin=false,cookie,body,method='GET',originHeader=origin}={})=>fetch(origin+route,{method,headers:{...(admin?{Authorization:'Bearer review-admin-test'}:{}),...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:originHeader,'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {ctx,origin,call,close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true})}};
}
async function invite(f){const r=await f.call('/api/admin/atelier-emine/review-links',{admin:true,method:'POST'});assert.equal(r.status,201);const data=await r.json();return {...data,token:new URLSearchParams(new URL(data.url).hash.slice(1)).get('token')}}
async function exchange(f,token){const r=await f.call(API+'/session',{method:'POST',body:{token}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
const responseBody=(item,extra={})=>({name:'Atelier reviewer',email:'reviewer@example.test',authorized:true,detailsConfirmed:true,decision:'confirmed',notes:'Checked supplied details',version:item.version,...extra});

test('private-link seller review is scoped, authenticated, recorded and separate from sales',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/api/admin/atelier-emine/review-links')).status,401);
  const page=await f.call('/supplier-review/atelier-emine');assert.equal(page.status,200);assert.match(page.headers.get('x-robots-tag'),/noindex/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('cache-control'),'no-store');const html=await page.text();assert.ok(!html.includes('ATELIEREMINE766'));assert.ok(!html.includes('analytics'));assert.match(html,/atelier-emine.js/);
  assert.equal((await f.call(API)).status,401);
  const link=await invite(f);assert.equal(new URL(link.url).pathname,'/supplier-review/atelier-emine');assert.equal(new URL(link.url).search,'');assert.equal(link.token.length,43);
  const stored=f.ctx.db.prepare('SELECT * FROM supplier_review_links WHERE id=?').get(link.id);assert.equal(stored.token_hash,crypto.createHash('sha256').update(link.token).digest('hex'));assert.ok(!JSON.stringify(stored).includes(link.token));
  assert.equal((await f.call(API+'/session',{method:'POST',originHeader:'https://other.example',body:{token:link.token}})).status,403);
  assert.equal((await f.call(API+'/session',{method:'POST',body:{token:'X'.repeat(43)}})).status,401);
  const session=await f.call(API+'/session',{method:'POST',body:{token:link.token}});assert.equal(session.status,200);const setCookie=session.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/i);assert.match(setCookie,/Path=\/api\/supplier-review\/atelier-emine/);const cookie=setCookie.split(';')[0];
  const rawSession=cookie.split('=')[1];assert.ok(!JSON.stringify(f.ctx.db.prepare('SELECT * FROM supplier_review_sessions').all()).includes(rawSession));
  const data=await (await f.call(API,{cookie})).json();assert.equal(data.items.length,89);assert.equal(data.salesEnabled,false);assert.ok(!JSON.stringify(data).includes('review_notes'));assert.ok(!JSON.stringify(data).includes('draft.houseofbriar.invalid'));assert.equal(data.items.reduce((n,x)=>n+x.source.image_urls.length,0),529);
  const item=data.items[0];
  const submitted=await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item)});assert.equal(submitted.status,200);assert.equal((await submitted.json()).review.status,'confirmed');
  const row=f.ctx.db.prepare('SELECT * FROM listings WHERE id=?').get(item.id);assert.equal(row.status,'draft');assert.equal(row.moderation_status,'pending');assert.equal(row.published_at,null);
  const profile=f.ctx.db.prepare('SELECT * FROM designer_profiles WHERE id=?').get('atelier-emine-draft');assert.equal(profile.status,'suspended');assert.equal(profile.stripe_account_id,null);
  const adminData=await (await f.call('/api/admin/atelier-emine/drafts',{admin:true})).json();const reviewed=adminData.items.find(x=>x.id===item.id);assert.equal(reviewed.sellerReview.status,'confirmed');assert.equal(reviewed.sellerReview.reviewer_email,'reviewer@example.test');
  assert.equal((await f.call('/api/admin/listings',{cookie})).status,401);assert.equal((await f.call('/api/my/listings',{cookie})).status,401);
  const changed=await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item,{decision:'changes_requested',detailsConfirmed:false,notes:'Please correct model colour.'})});assert.equal(changed.status,200);assert.equal((await changed.json()).review.status,'changes_requested');assert.equal(f.ctx.db.prepare('SELECT COUNT(*) AS n FROM supplier_review_responses').get().n,2);
  assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,originHeader:'https://other.example',body:responseBody(item)})).status,403);
  assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item,{authorized:false})})).status,422);
  assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item,{detailsConfirmed:false})})).status,422);
  assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item,{decision:'changes_requested',notes:''})})).status,422);
  assert.equal((await f.call(API+'/items/not-their-listing',{method:'POST',cookie,body:responseBody(item)})).status,404);
  const gallery=await (await f.call('/api/gallery')).json();assert.equal(gallery.items.length,0);
  const quote=await f.call('/api/checkout/quote',{method:'POST',body:{items:[{listingId:item.id,quantity:1}]}});assert.ok(quote.status>=400);
 }finally{await f.close()}
});

test('expiry, replacement and revocation invalidate sessions without deleting seller responses',async()=>{
 const f=await fixture();try{
  const link=await invite(f);const cookie=await exchange(f,link.token);const data=await (await f.call(API,{cookie})).json();const item=data.items[0];
  assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item)})).status,200);
  const replacement=await invite(f);assert.equal((await f.call(API,{cookie})).status,401);assert.equal((await f.call(API+'/session',{method:'POST',body:{token:link.token}})).status,401);
  const nextCookie=await exchange(f,replacement.token);assert.equal((await f.call(API,{cookie:nextCookie})).status,200);
  f.ctx.db.prepare('UPDATE supplier_review_links SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',replacement.id);
  assert.equal((await f.call(API,{cookie:nextCookie})).status,401);assert.equal((await f.call(API+'/session',{method:'POST',body:{token:replacement.token}})).status,401);
  const fresh=await invite(f);const freshCookie=await exchange(f,fresh.token);
  assert.equal((await f.call('/api/admin/atelier-emine/review-links',{method:'DELETE',admin:true})).status,200);assert.equal((await f.call(API,{cookie:freshCookie})).status,401);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) AS n FROM supplier_review_responses').get().n,1);
 }finally{await f.close()}
});

test('confirmations are tied to the reviewed content and stale submissions are refused',async()=>{
 const f=await fixture();try{
  const link=await invite(f),cookie=await exchange(f,link.token);const data=await (await f.call(API,{cookie})).json(),item=data.items[0];
  await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item)});
  f.ctx.db.prepare('UPDATE listings SET price=price+1 WHERE id=?').run(item.id);
  const response=await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item)});assert.equal(response.status,409);
  const current=await (await f.call(API,{cookie})).json();assert.equal(current.items.find(x=>x.id===item.id).review.status,'needs_rereview');assert.equal(f.ctx.db.prepare('SELECT COUNT(*) AS n FROM supplier_review_responses').get().n,1);
  f.ctx.db.prepare("UPDATE listings SET status='archived' WHERE id=?").run(item.id);assert.equal((await f.call(API+'/items/'+item.id,{method:'POST',cookie,body:responseBody(item)})).status,404);
 }finally{await f.close()}
});

test('public production excludes review page, assets and all seller-access endpoints',async()=>{
 const f=await fixture('production');try{
  for(const route of ['/supplier-review/atelier-emine','/supplier-review/atelier-emine.js','/supplier-review/atelier-emine.css',API])assert.equal((await f.call(route)).status,404,route);
  assert.equal((await f.call('/api/admin/atelier-emine/review-links',{admin:true})).status,404);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) AS n FROM supplier_review_links').get().n,0);
 }finally{await f.close()}
});

test('seed invitation remains revoked across restarts and stores only a normalized hash and expiry',async()=>{
 const f=await fixture();try{
  const raw='S'.repeat(43),id='seed-test',initialInvite={id,tokenHash:crypto.createHash('sha256').update(raw).digest('hex'),expiresAt:'2030-01-01T00:00:00Z'};
  setupSellerReview(f.ctx.db,{environment:'staging',initialInvite});assert.equal(f.ctx.db.prepare('SELECT expires_at FROM supplier_review_links WHERE id=?').get(id).expires_at,'2030-01-01T00:00:00.000Z');
  f.ctx.db.prepare('UPDATE supplier_review_links SET revoked_at=? WHERE id=?').run(new Date().toISOString(),id);setupSellerReview(f.ctx.db,{environment:'staging',initialInvite});
  assert.equal((await f.call(API+'/session',{method:'POST',body:{token:raw}})).status,401);
 }finally{await f.close()}
});
