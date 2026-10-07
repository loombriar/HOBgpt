const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');const {createApp,SELLER_TERMS_VERSION}=require('../server');const {listingStatus}=require('../studio-options');
async function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-studio-options-'));let calls=0;const ctx=createApp({dataDir:dir,seedProducts:[{id:'a1',designerId:'a',title:'Piece A',price:50,shippingCostCents:0},{id:'b1',designerId:'b',title:'Piece B',price:20,shippingCostCents:0}],designerTokens:{tokenA:'a',tokenB:'b',tokenC:'c'},adminToken:'admin',stripeApi:async(endpoint)=>{if(endpoint.startsWith('accounts/'))return{details_submitted:true,payouts_enabled:true,charges_enabled:true};if(endpoint==='checkout/sessions'){calls++;return{id:'cs_studio_'+calls,url:'https://checkout.stripe.test/studio'};}throw Error(endpoint);}});
for(const id of ['a','b','c'])ctx.db.prepare('UPDATE designer_profiles SET email=?,stripe_account_id=? WHERE id=?').run(id+'@example.test','acct_'+id,id);
ctx.db.prepare('INSERT INTO designer_identities(subject,designer_id,email,linked_at) VALUES (?,?,?,?)').run('b-sub','b','b@example.test',new Date().toISOString());
for(const id of ['a','b'])ctx.db.prepare('INSERT INTO designer_terms_acceptances(designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run(id,SELLER_TERMS_VERSION,new Date().toISOString(),'test');
const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
const call=async(route,method='GET',body,token='tokenA')=>{const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
try{await run({ctx,call,getCalls:()=>calls});}finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('listing categories are exclusive and reserved stock is not sold out',()=>{
 const active={status:'published',moderationStatus:'approved',availableQuantity:1,productionType:'One of a Kind'};
 assert.equal(listingStatus(active),'Active');assert.equal(listingStatus({...active,status:'draft'}),'Draft');assert.equal(listingStatus({...active,status:'archived',expiredAt:'now'}),'Expired');assert.equal(listingStatus({...active,status:'archived'}),'Inactive');assert.equal(listingStatus({...active,pausedByDesigner:true}),'Inactive');assert.equal(listingStatus({...active,availableQuantity:0}),'Sold Out');assert.equal(listingStatus({...active,availableQuantity:0,reservedQuantity:1}),'Active');assert.equal(listingStatus({...active,availableQuantity:0,productionType:'Made to Order'}),'Active');
});
test('studio counts and views use owned listings; expiry respects reservations and renewal requires moderation',async()=>fixture(async({ctx,call})=>{
 await call('/api/analytics/events','POST',{event:'view_product',listingId:'a1',sessionId:'session-1'},'');await call('/api/analytics/events','POST',{event:'view_product',listingId:'b1',sessionId:'session-2'},'');
 let result=await call('/api/my/studio');assert.equal(result.status,200);assert.equal(result.body.counts.Active,1);assert.equal(result.body.items.length,1);assert.equal(result.body.views.events,1);assert.equal(result.body.views.sessions,1);
 assert.equal((await call('/api/listings/a1/expire','POST',undefined,'tokenB')).status,404);
 const checkout=await call('/api/checkout/session','POST',{items:[{id:'a1',quantity:1}]});assert.equal(checkout.status,201);assert.equal((await call('/api/listings/a1/expire','POST')).status,409);
 ctx.db.prepare("UPDATE inventory_reservations SET status='released' WHERE listing_id='a1'").run();assert.equal((await call('/api/listings/a1/expire','POST')).status,200);
 result=await call('/api/my/studio');assert.equal(result.body.counts.Expired,1);assert.equal(result.body.counts.Active,0);assert.equal((await call('/api/checkout/session','POST',{items:[{id:'a1',quantity:1}]})).status,409);
 assert.equal((await call('/api/listings/a1/renew','POST')).status,200);assert.equal((await call('/api/my/studio')).body.counts.Draft,1);assert.equal((await call('/api/checkout/session','POST',{items:[{id:'a1',quantity:1}]})).status,409);assert.equal((await call('/api/listings/b1/renew','POST')).status,404);
}));
test('gift notes require listing opt-in, validate length and persist only to the correct seller order item',async()=>fixture(async({ctx,call,getCalls})=>{
 const cart={items:[{id:'a1',quantity:1,giftNote:'  Happy birthday <3  '},{id:'b1',quantity:1}]};assert.equal((await call('/api/checkout/session','POST',cart)).status,422);assert.equal(getCalls(),0);
 assert.equal((await call('/api/listings/a1/studio-options','PUT',{giftNoteAvailable:true},'tokenB')).status,404);assert.equal((await call('/api/listings/a1/studio-options','PUT',{giftNoteAvailable:'yes'})).status,422);assert.equal((await call('/api/listings/a1/studio-options','PUT',{giftNoteAvailable:true})).status,200);
 assert.equal((await call('/api/checkout/session','POST',{items:[{id:'a1',quantity:1,giftNote:'x'.repeat(501)}]})).status,422);assert.equal((await call('/api/checkout/session','POST',{items:[{id:'a1',quantity:1,giftNote:{text:'no'}}]})).status,422);
 const result=await call('/api/checkout/session','POST',cart);assert.equal(result.status,201);const items=ctx.db.prepare('SELECT listing_id,gift_note FROM order_items WHERE order_id=? ORDER BY listing_id').all(result.body.orderId);assert.equal(items[0].gift_note,'Happy birthday <3');assert.equal(items[1].gift_note,null);
 assert.equal((await call('/api/my/orders')).body.orders[0].items[0].giftNote,'Happy birthday <3');assert.equal((await call('/api/my/orders','GET',undefined,'tokenB')).body.orders[0].items[0].giftNote,null);
 const gallery=await call('/api/gallery','GET',undefined,'');assert.equal(JSON.stringify(gallery.body).includes('Happy birthday'),false);
}));
test('shared access is independently authenticated, sanitized, immediately revocable and cannot grant edits or payments',async()=>fixture(async({ctx,call})=>{
 assert.equal((await call('/api/my/studio/shared/a','GET',undefined,'tokenB')).status,404);assert.equal((await call('/api/my/studio/shared-access','POST',{email:'c@example.test'})).status,422);
 assert.equal((await call('/api/my/studio/shared-access','POST',{email:'b@example.test'})).status,201);assert.equal((await call('/api/my/studio/shared-access','POST',{email:'b@example.test'})).status,201);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM studio_access_audit').get().n,1);
 const result=await call('/api/my/studio/shared/a','GET',undefined,'tokenB');assert.equal(result.status,200);assert.equal(result.body.permission,'read_only');assert.deepEqual(Object.keys(result.body.items[0]).sort(),['giftNoteAvailable','id','studioStatus','title']);
 assert.equal((await call('/api/my/studio/shared-access','GET',undefined,'tokenB')).body.studios[0].id,'a');assert.equal((await call('/api/my/studio/shared/a','GET',undefined,'')).status,401);
 assert.equal((await call('/api/listings/a1/studio-options','PUT',{giftNoteAvailable:true},'tokenB')).status,404);assert.equal((await call('/api/listings/a1/expire','POST',undefined,'tokenB')).status,404);
 assert.equal((await call('/api/my/studio/shared-access/b','DELETE',undefined,'tokenC')).status,200);assert.equal((await call('/api/my/studio/shared/a','GET',undefined,'tokenB')).status,200);
 assert.equal((await call('/api/my/studio/shared-access/b','DELETE')).status,200);assert.equal((await call('/api/my/studio/shared/a','GET',undefined,'tokenB')).status,404);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM studio_access_audit').get().n,2);
}));
