const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');
async function fixture(run,options={}){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-hardening-')),emails=[];
  const ctx=createApp({dataDir,seedProducts:[],sendEmail:async m=>{emails.push(m);return true;},...options});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{await run({ctx,origin,post,emails});}finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dataDir,{recursive:true,force:true});}
}
const signup={email:'maker@example.test',displayName:'Maker',brandName:'Verified Atelier',categories:['apparel'],sellerTermsAccepted:true,sellerTermsVersion:SELLER_TERMS_VERSION};
test('signup requires mailbox proof; codes are hashed, expiring, single-use and never issue a bearer',async()=>fixture(async({ctx,post,emails,origin})=>{
  const start=await post('/api/designer-applications',signup);assert.equal(start.status,202);const pending=await start.json();
  assert.equal(pending.accessToken,undefined);assert.equal(pending.designer,undefined);assert.equal(pending.signup,undefined);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_profiles WHERE email=?').get(signup.email).n,0);
  const code=emails[0].text.match(/\b\d{6}\b/)[0];
  const row=ctx.db.prepare('SELECT * FROM designer_login_challenges WHERE id=?').get(pending.requestId);
  assert.equal(row.code_hash,crypto.createHash('sha256').update(pending.requestId+':'+code).digest('hex'));
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
  const wrong=code==='000000'?'111111':'000000';assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code:wrong})).status,401);
  const verified=await post('/api/designer/verify-code',{requestId:pending.requestId,code});assert.equal(verified.status,201);
  const cookie=verified.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
  const body=await verified.json();assert.equal(body.accessToken,undefined);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_access_tokens').get().n,0);
  assert.equal((await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie.split(';')[0]}})).status,200);
  assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code})).status,401);
}));
test('email recovery revokes old bearer credentials, configured tokens and sessions',async()=>fixture(async({ctx,post,origin,emails})=>{
  ctx.db.prepare("UPDATE designer_profiles SET email=? WHERE id='maker'").run(signup.email);
  const token='hob_'+crypto.randomBytes(32).toString('base64url');
  ctx.db.prepare('INSERT INTO designer_access_tokens(token_hash,designer_id,created_at) VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),'maker',new Date().toISOString());
  const old=await post('/api/session',{}, {Authorization:'Bearer '+token});assert.equal(old.status,200);const oldCookie=old.headers.get('set-cookie').split(';')[0];
  const pending=await (await post('/api/designer/signin-code',{email:signup.email})).json();const code=emails[0].text.match(/\b\d{6}\b/)[0];
  assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code})).status,200);
  for(const headers of [{Authorization:'Bearer '+token},{Authorization:'Bearer old-configured-token'},{Cookie:oldCookie}])assert.equal((await fetch(origin+'/api/my/designer-profile',{headers})).status,401);
  assert.ok(ctx.db.prepare('SELECT revoked_at FROM designer_access_tokens').get().revoked_at);
},{designerTokens:{'old-configured-token':'maker'}}));
test('expired challenges, repeated wrong guesses, and cross-origin signup fail closed',async()=>fixture(async({ctx,post,emails})=>{
  assert.equal((await post('/api/designer-applications',signup,{Origin:'https://evil.test'})).status,403);
  const pending=await (await post('/api/designer-applications',signup)).json();const code=emails[0].text.match(/\b\d{6}\b/)[0];
  for(let i=0;i<5;i++)assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code:code==='000000'?'111111':'000000'})).status,401);
  assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code})).status,401);
  ctx.db.prepare("UPDATE designer_login_challenges SET attempts=0,expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await post('/api/designer/verify-code',{requestId:pending.requestId,code})).status,401);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_profiles WHERE email=?').get(signup.email).n,0);
}));
test('an issued token from the year 2000 cannot authorize seller or buyer access',async()=>fixture(async({ctx,origin})=>{
  const token='hob_old';ctx.db.prepare('INSERT INTO designer_access_tokens(token_hash,designer_id,created_at) VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),'maker','2000-01-01T00:00:00.000Z');
  for(const route of ['/api/my/designer-profile','/api/my/special-offers'])assert.equal((await fetch(origin+route,{headers:{Authorization:'Bearer '+token}})).status,401);
},{designerTokens:{fixture:'maker'}}));

function commerceOptions(failCreation=false){
  let db,number=0;
  return {options:{designerTokens:{seller:'maker'},connectAccounts:{maker:'acct_maker'},
    seedProducts:[{id:'promo-piece',designerId:'maker',title:'Promo piece',price:100,shippingCostCents:0}],
    stripeApi:async(endpoint,request)=>{
      if(endpoint==='accounts/acct_maker')return {details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
      if(endpoint==='checkout/sessions'){
        if(failCreation)throw Error('Unknown network outcome');
        await new Promise(r=>setTimeout(r,20));return {id:'cs_promo_'+(++number),url:'https://checkout.stripe.test/session'};
      }
      const id=endpoint.split('/').at(-1),order=db.prepare('SELECT * FROM orders WHERE stripe_session_id=?').get(id);
      return {id,status:'complete',payment_status:'paid',currency:'usd',amount_total:order.subtotal_cents,payment_intent:'pi_'+id,metadata:{order_id:order.id},shipping_details:{name:'Buyer',address:{line1:'1 Test Lane',city:'Test City',state:'OH',postal_code:'44101',country:'US'}}};
    }},prepare(ctx){db=ctx.db;
      db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_maker',stripe_details_submitted=1,stripe_payouts_enabled=1,stripe_status_checked_at=?,stripe_requirements_due='[]' WHERE id='maker'").run(new Date().toISOString());
      db.prepare("UPDATE listings SET production_type='Made to Order',stock_quantity=0 WHERE id='promo-piece'").run();
      db.prepare('INSERT OR IGNORE INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker',SELLER_TERMS_VERSION,new Date().toISOString(),'test');
    }};
}
test('one-use promo admits one concurrent checkout, survives restart, and redeems once',async()=>{
  const commerce=commerceOptions();await fixture(async({ctx,post,origin})=>{
    commerce.prepare(ctx);
    assert.equal((await post('/api/my/promo-codes',{code:'ONCE',discountType:'percent',discountValue:10,maxUses:1},{Authorization:'Bearer seller'})).status,201);
    const body={items:[{id:'promo-piece',quantity:1}],promoCodes:['ONCE'],expectedTotalBeforeTaxCents:9000};
    const responses=await Promise.all([post('/api/checkout/session',body),post('/api/checkout/session',body)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
    const checkout=await responses.find(r=>r.status===201).json();
    assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM promo_code_reservations WHERE status='reserved'").get().n,1);
    const restarted=createApp({dataDir:ctx.dataDir,seedProducts:[],designerTokens:{seller:'maker'}});
    try{assert.equal(restarted.db.prepare("SELECT COUNT(*) n FROM promo_code_reservations WHERE status='reserved'").get().n,1);}finally{restarted.db.close();}
    assert.equal((await fetch(origin+'/api/checkout/session/'+checkout.sessionId)).status,200);
    assert.equal((await fetch(origin+'/api/checkout/session/'+checkout.sessionId)).status,200);
    assert.equal(ctx.db.prepare('SELECT use_count FROM designer_promo_codes').get().use_count,1);
    assert.equal(ctx.db.prepare('SELECT status FROM promo_code_reservations').get().status,'redeemed');
    assert.equal((await post('/api/checkout/session',body)).status,409);
  },commerce.options);
});
test('unknown checkout creation outcome retains promo capacity for reconciliation',async()=>{
  const commerce=commerceOptions(true);await fixture(async({ctx,post})=>{
    commerce.prepare(ctx);
    await post('/api/my/promo-codes',{code:'ONCE',discountType:'percent',discountValue:10,maxUses:1},{Authorization:'Bearer seller'});
    assert.equal((await post('/api/checkout/session',{items:[{id:'promo-piece',quantity:1}],promoCodes:['ONCE']})).status,500);
    assert.equal(ctx.db.prepare('SELECT status FROM promo_code_reservations').get().status,'reserved');
    assert.equal(ctx.db.prepare('SELECT use_count FROM designer_promo_codes').get().use_count,0);
  },commerce.options);
});
test('verified Stripe expiration releases promo capacity and delayed duplicates cannot release a new hold',async()=>{
  const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='whsec_promo_expiration';
  const commerce=commerceOptions();
  try{await fixture(async({ctx,post,origin})=>{
    commerce.prepare(ctx);await post('/api/my/promo-codes',{code:'ONCE',discountType:'percent',discountValue:10,maxUses:1},{Authorization:'Bearer seller'});
    const body={items:[{id:'promo-piece',quantity:1}],promoCodes:['ONCE'],expectedTotalBeforeTaxCents:9000};
    const first=await (await post('/api/checkout/session',body)).json();
    async function expire(eventId,sessionId){
      const raw=JSON.stringify({id:eventId,type:'checkout.session.expired',data:{object:{id:sessionId,status:'expired',metadata:{order_id:first.orderId}}}});
      const timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
      return fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});
    }
    assert.equal((await expire('evt_unbound','cs_wrong')).status,200);
    assert.equal(ctx.db.prepare('SELECT status FROM promo_code_reservations').get().status,'reserved');
    assert.equal((await expire('evt_expired',first.sessionId)).status,200);
    assert.equal(ctx.db.prepare('SELECT status FROM promo_code_reservations').get().status,'released');
    const second=await post('/api/checkout/session',body);assert.equal(second.status,201);
    await expire('evt_expired',first.sessionId);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM promo_code_reservations WHERE status='reserved'").get().n,1);
    assert.equal(ctx.db.prepare('SELECT use_count FROM designer_promo_codes').get().use_count,0);
  },commerce.options);}finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
});
test('deposit reconciliation validates Stripe evidence, requires admin access and never moves money',async()=>{
  let session,calls=[];await fixture(async({ctx,post,origin})=>{
    const now=new Date().toISOString();
    ctx.db.prepare("INSERT INTO listing_inquiries(id,listing_id,designer_id,buyer_subject,message,created_at) VALUES ('inquiry','piece','maker','buyer','Request',?)").run(now);
    ctx.db.prepare("INSERT INTO special_order_offers(id,inquiry_id,designer_id,buyer_subject,title,total_cents,deposit_cents,lead_days_min,lead_days_max,status,created_at,stripe_session_id) VALUES ('offer','inquiry','maker','buyer','Custom piece',10000,5000,7,14,'offered',?,'cs_old_deposit')").run(now);
    const before=ctx.db.prepare('SELECT * FROM special_order_offers').all();
    const valid={id:'cs_old_deposit',metadata:{special_offer_id:'offer'},currency:'usd',amount_total:5000,status:'complete',payment_status:'paid',payment_intent:'pi_old_deposit'};
    assert.equal((await post('/api/admin/special-deposits/reconcile',{})).status,401);
    for(const patch of [{id:'cs_other'},{metadata:{special_offer_id:'other'}},{currency:'eur'},{amount_total:1},{payment_intent:null}]){
      session={...valid,...patch};assert.equal((await ctx.reconcileSpecialDeposits()).mismatched,1);
    }
    session=valid;const result=await post('/api/admin/special-deposits/reconcile',{}, {Authorization:'Bearer admin'});assert.equal(result.status,200);
    const report=await result.json();assert.equal(report.summary.paidNeedsReview,1);assert.equal(report.offers[0].state,'paid_needs_review');
    assert.deepEqual(ctx.db.prepare('SELECT * FROM special_order_offers').all(),before);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_transfers').get().n,0);
    assert.ok(calls.every(c=>c.endpoint==='checkout/sessions/cs_old_deposit'&&!c.request?.method));
  },{adminToken:'admin',designerTokens:{fixture:'maker'},seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:100}],stripeApi:async(endpoint,request)=>{calls.push({endpoint,request});return session;}});
});
