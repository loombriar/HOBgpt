const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');

async function fixture(run,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-designer-security-'));
  const emails=[],stripeCalls=[];let delivery=true;
  const ctx=createApp({dataDir:dir,seedProducts:[{id:'security-piece',designerId:'maker',title:'Security Piece',price:40,category:'fashion'}],designerTokens:{makerToken:'maker',otherToken:'other'},adminToken:'admin',resolveIdentity:async()=>({sub:'maker-sub',email:'maker@legacy.houseofbriar.invalid',email_verified:true}),sendEmail:async message=>{emails.push(message);return delivery;},stripeApi:async(endpoint)=>{stripeCalls.push(endpoint);if(endpoint.startsWith('accounts/'))return{details_submitted:true,payouts_enabled:true,requirements:{currently_due:[]}};throw new Error('Unexpected Stripe call');},...options});
  const srv=ctx.app.listen(0,'127.0.0.1');await once(srv,'listening');
  const origin='http://127.0.0.1:'+srv.address().port;
  const call=async(route,body,token='makerToken',method='POST')=>{
    const response=await fetch(origin+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return{status:response.status,body:await response.json()};
  };
  const request=email=>call('/api/my/designer-settings',{email,displayName:'Maker'},'makerToken','PATCH');
  const code=()=>emails.at(-1).text.match(/\n\n([A-Za-z0-9_-]{43})\n\n/)[1];
  try{await run({ctx,call,request,code,emails,stripeCalls,origin,setDelivery:value=>{delivery=value;}});}
  finally{await new Promise(resolve=>srv.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}

test('House email changes require owner plus mailbox proof and preserve Stripe and OIDC identity',async()=>fixture(async({ctx,call,request,code,emails,stripeCalls})=>{
  const old='maker@legacy.houseofbriar.invalid';
  ctx.db.prepare("INSERT INTO designer_identities (subject,designer_id,email,linked_at) VALUES ('maker-sub','maker',?,?)").run(old,new Date().toISOString());
  ctx.db.prepare("UPDATE listings SET designer_email=? WHERE designer_id='maker'").run(old);
  ctx.db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_existing' WHERE id='maker'").run();
  const pending=await request('new@example.test');assert.equal(pending.status,202);assert.equal(pending.body.designer.email,old);assert.equal(pending.body.verificationRequired,true);
  assert.equal(emails[0].to,'new@example.test');
  const token=code();const row=ctx.db.prepare("SELECT * FROM designer_email_changes WHERE designer_id='maker'").get();
  assert.equal(row.token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(row).includes(token));
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
  assert.equal(ctx.db.prepare("SELECT designer_email FROM listings WHERE id='security-piece'").get().designer_email,old);
  assert.equal((await call('/api/my/designer-email/verify',{token},'otherToken')).status,422);
  assert.equal((await call('/api/my/designer-email/verify',{token},'')).status,401);
  const verified=await call('/api/my/designer-email/verify',{token});assert.equal(verified.status,200);assert.equal(verified.body.email,'new@example.test');
  assert.equal((await call('/api/my/designer-email/verify',{token})).status,422);
  assert.equal(ctx.db.prepare("SELECT designer_email FROM listings WHERE id='security-piece'").get().designer_email,'new@example.test');
  assert.equal(ctx.db.prepare("SELECT email FROM designer_identities WHERE subject='maker-sub'").get().email,old);
  assert.equal(ctx.db.prepare("SELECT stripe_account_id FROM designer_profiles WHERE id='maker'").get().stripe_account_id,'acct_existing');assert.equal(stripeCalls.length,0);
  const profile=await call('/api/my/designer-profile',undefined,'oidcToken','GET');assert.equal(profile.status,200);assert.equal(profile.body.designer.email,'new@example.test');
  assert.equal(ctx.db.prepare("SELECT designer_email FROM listings WHERE id='security-piece'").get().designer_email,'new@example.test');
}));

test('email codes expire, replacements invalidate old codes, and delivery fails closed',async()=>fixture(async({ctx,call,request,code,setDelivery})=>{
  await request('first@example.test');const first=code();
  await request('second@example.test');const second=code();
  assert.equal((await call('/api/my/designer-email/verify',{token:first})).status,422);
  ctx.db.prepare("UPDATE designer_email_changes SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await call('/api/my/designer-email/verify',{token:second})).status,422);
  setDelivery(false);assert.equal((await request('undelivered@example.test')).status,503);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM designer_email_changes').get().n,0);
  assert.equal(ctx.db.prepare("SELECT email FROM designer_profiles WHERE id='maker'").get().email,'maker@legacy.houseofbriar.invalid');
}));

test('email verification rechecks uniqueness and rejects suspended accounts',async()=>fixture(async({ctx,call,request,code})=>{
  await request('claimed@example.test');const token=code();
  ctx.db.prepare("UPDATE designer_profiles SET email='claimed@example.test' WHERE id='other'").run();
  assert.equal((await call('/api/my/designer-email/verify',{token})).status,409);
  ctx.db.prepare("UPDATE designer_profiles SET email='other@example.test' WHERE id='other'").run();
  ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();
  assert.equal((await call('/api/my/designer-email/verify',{token})).status,403);
  assert.equal(ctx.db.prepare("SELECT email FROM designer_profiles WHERE id='maker'").get().email,'maker@legacy.houseofbriar.invalid');
}));

test('legacy seller consent is explicit, versioned, stable on replay, and gates sales and payouts',async()=>fixture(async({ctx,call,stripeCalls})=>{
  ctx.db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_existing' WHERE id='maker'").run();
  let profile=(await call('/api/my/designer-profile',undefined,'makerToken','GET')).body.designer;
  assert.equal(profile.sellerTermsAccepted,false);assert.equal(profile.sellerTermsAcceptedAt,null);
  const cart={items:[{id:'security-piece',quantity:1}]};
  assert.equal((await call('/api/checkout/quote',cart)).status,409);assert.equal(stripeCalls.length,0);
  assert.equal((await call('/api/my/seller-terms',{accepted:false,termsVersion:SELLER_TERMS_VERSION})).status,422);
  assert.equal((await call('/api/my/seller-terms',{accepted:true,termsVersion:'old-version'})).status,422);
  const now=new Date().toISOString();
  ctx.db.prepare("INSERT INTO orders (id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('held-order','paid','usd',100,10,90,?)").run(now);
  ctx.db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at) VALUES ('held-transfer','held-order','maker','acct_existing',90,'pending',?)").run(now);
  assert.equal((await call('/api/admin/orders/held-order/designers/maker/release',{},'admin')).status,409);assert.equal(stripeCalls.length,0);
  const accepted=await call('/api/my/seller-terms',{accepted:true,termsVersion:SELLER_TERMS_VERSION});assert.equal(accepted.status,200);assert.ok(accepted.body.acceptedAt);
  const repeated=await call('/api/my/seller-terms',{accepted:true,termsVersion:SELLER_TERMS_VERSION});assert.equal(repeated.body.acceptedAt,accepted.body.acceptedAt);
  profile=(await call('/api/my/designer-profile',undefined,'makerToken','GET')).body.designer;assert.equal(profile.sellerTermsAccepted,true);assert.equal(profile.sellerTermsVersion,SELLER_TERMS_VERSION);
  assert.equal((await call('/api/checkout/quote',cart)).status,200);
  const record=ctx.db.prepare("SELECT * FROM designer_terms_acceptances WHERE designer_id='maker'").get();assert.equal(record.acceptance_source,'designer-room');assert.equal(record.accepted_at,accepted.body.acceptedAt);
}));

test('an old application consent flag is not a versioned Seller Terms acceptance',async()=>fixture(async({ctx,call})=>{
  const now=new Date().toISOString();
  ctx.db.prepare("INSERT INTO designer_applications (id,email,display_name,brand_name,status,created_at,marketplace_terms_accepted) VALUES ('old-application','old@example.test','Old Maker','Old Atelier','approved',?,1)").run(now);
  ctx.db.prepare("UPDATE designer_profiles SET application_id='old-application' WHERE id='maker'").run();
  const profile=await call('/api/my/designer-profile',undefined,'makerToken','GET');
  assert.equal(profile.body.designer.sellerTermsAccepted,false);assert.equal(profile.body.designer.sellerTermsAcceptedAt,null);
}));

test('carrier updates acknowledge verified shipping while holding payouts without Seller Terms',async()=>{
  const previous=process.env.EASYPOST_WEBHOOK_SECRET;process.env.EASYPOST_WEBHOOK_SECRET='test-only-carrier-secret';
  try{await fixture(async({ctx,origin,stripeCalls})=>{
    const now=new Date().toISOString();
    ctx.db.prepare("INSERT INTO orders (id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('carrier-order','paid','usd',100,10,90,?)").run(now);
    ctx.db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_provider_id) VALUES ('carrier-transfer','carrier-order','maker','acct_existing',90,'pending',?,'trk_held')").run(now);
    const raw=JSON.stringify({object:'Event',description:'tracker.updated',result:{id:'trk_held',status:'in_transit',tracking_details:[{status:'in_transit'}]}});
    const timestamp=new Date().toISOString(),route='/api/easypost/webhook';
    const signature=crypto.createHmac('sha256',process.env.EASYPOST_WEBHOOK_SECRET).update(timestamp+'POST'+route+raw).digest('hex');
    const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json','x-timestamp':timestamp,'x-path':route,'x-hmac-signature-v2':signature},body:raw});
    assert.equal(response.status,200);assert.equal(stripeCalls.length,0);
    const transfer=ctx.db.prepare("SELECT * FROM designer_transfers WHERE id='carrier-transfer'").get();assert.ok(transfer.tracking_verified_at);assert.equal(transfer.status,'pending');
    assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM designer_notifications WHERE type='seller_terms_required'").get().n,1);
  });}finally{if(previous===undefined)delete process.env.EASYPOST_WEBHOOK_SECRET;else process.env.EASYPOST_WEBHOOK_SECRET=previous;}
});

test('signup records presented terms version and issued designer token can open the room',async()=>fixture(async({ctx,call})=>{
  const body={email:'signup@example.test',displayName:'Signup Maker',brandName:'Signup Atelier',categories:['Art'],sellerTermsAccepted:true};
  assert.equal((await call('/api/designer-applications',body,'')).status,422);
  const signup=await call('/api/designer-applications',{...body,sellerTermsVersion:SELLER_TERMS_VERSION},'');assert.equal(signup.status,201);
  const profile=await call('/api/my/designer-profile',undefined,signup.body.accessToken,'GET');assert.equal(profile.status,200);assert.equal(profile.body.designer.sellerTermsAccepted,true);
  const record=ctx.db.prepare('SELECT * FROM designer_terms_acceptances WHERE designer_id=?').get(signup.body.designer.id);assert.equal(record.acceptance_source,'signup');assert.equal(record.terms_version,SELLER_TERMS_VERSION);assert.ok(record.accepted_at);
}));
