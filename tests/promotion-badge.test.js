const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp:createBaseApp,SELLER_TERMS_VERSION}=require('../server');

// Successful commerce fixtures represent sellers who completed Stripe verification.
function createApp(options) {
  const designerIds = new Set([...Object.values(options.designerTokens || {}), ...(options.seedProducts || []).map(item => item.designerId).filter(Boolean)]);
  const connectAccounts = {...options.connectAccounts};
  for (const id of designerIds) connectAccounts[id] ||= 'acct_fixture_' + id.replace(/[^a-z0-9]/gi, '_');
  const stripeFixture = options.stripeApi;
  const context = createBaseApp({...options, seedProducts:(options.seedProducts || []).map(item=>({...item,shippingCostCents:item.shippingCostCents ?? 0})), connectAccounts, stripeApi: async (endpoint, request) => {
    if (endpoint.startsWith('accounts/acct_fixture_') || Object.values(options.connectAccounts || {}).some(id => endpoint === 'accounts/' + id)) {
      return {details_submitted:true, payouts_enabled:true, charges_enabled:true, requirements:{currently_due:[]}};
    }
    if (stripeFixture) { const result=await stripeFixture(endpoint, request); if(result?.payment_status==='paid' && !result.shipping_details)result.shipping_details={name:'Fixture Buyer',address:{line1:'1 Test Lane',city:'Test City',state:'OH',postal_code:'44101',country:'US'}}; return result; }
    throw new Error('Unexpected Stripe fixture endpoint: ' + endpoint);
  }});
  for (const [id, account] of Object.entries(connectAccounts)) context.db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run(account,id);
  for (const id of designerIds) context.db.prepare("INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)").run(id,SELLER_TERMS_VERSION,new Date().toISOString(),"test-fixture");
  return context;
}

test('designer discounts are scoped, sent to Stripe, and verified payment awards one buyer badge',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-promotion-badge-'));
  const previous=process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET='whsec_promotion_badge_fixture';
  let server,context,checkoutBody;
  try{
    context=createApp({dataDir:dir,seedProducts:[
      {id:'promo-a',designerId:'maker-a',title:'Piece A',price:100,category:'fashion'},
      {id:'promo-b',designerId:'maker-b',title:'Piece B',price:100,category:'fashion'}
    ],designerTokens:{'seller-a':'maker-a'},resolveIdentity:async({token})=>token==='buyer'?{sub:'buyer-sub',email:'buyer@example.test',email_verified:true}:token==='other-buyer'?{sub:'other-sub',email:'other@example.test',email_verified:true}:null,
    stripeApi:async(endpoint,options)=>{
      if(endpoint==='checkout/sessions/cs_promo_badge')return{id:'cs_promo_badge',status:'complete',payment_status:'paid',metadata:{order_id:context.db.prepare("SELECT id FROM orders WHERE stripe_session_id='cs_promo_badge'").get().id},currency:'usd',amount_total:17500,shipping_details:{name:'Fixture Buyer',address:{line1:'1 Test Lane',city:'Test City',postal_code:'44101',country:'US'}}};
      assert.equal(endpoint,'checkout/sessions');checkoutBody=new URLSearchParams(options.body);
      return{id:'cs_promo_badge',url:'https://checkout.stripe.test/fixture'};
    },sendEmail:async()=>true});
    server=context.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    const post=async(route,body,token='')=>fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    const promo=await post('/api/my/promo-codes',{code:'BRIAR25',discountType:'percent',discountValue:25},'seller-a');assert.equal(promo.status,201);
    const cart={items:[{id:'promo-a',quantity:1,amount:1},{id:'promo-b',quantity:1,amount:1}],promoCodes:['BRIAR25','UNKNOWN'],subtotal:1,discount:19999};
    const quoteResponse=await post('/api/checkout/quote',cart);assert.equal(quoteResponse.status,200);
    const quote=await quoteResponse.json();assert.equal(quote.subtotalCents,17500);assert.equal(quote.discountCents,2500);
    assert.equal(quote.items.find(x=>x.id==='promo-a').discountCents,2500);assert.equal(quote.items.find(x=>x.id==='promo-b').discountCents,0);
    const checkout=await post('/api/checkout/session',cart,'buyer');assert.equal(checkout.status,201);const {orderId}=await checkout.json();
    assert.equal(checkoutBody.get('allow_promotion_codes'),'false');assert.equal(checkoutBody.get('line_items[0][price_data][unit_amount]'),'7500');assert.equal(checkoutBody.get('line_items[1][price_data][unit_amount]'),'10000');
    assert.equal(context.db.prepare('SELECT COUNT(*) n FROM user_badges').get().n,0);
    const paid=async(total)=>{
      const raw=JSON.stringify({id:'evt_promo_badge',type:'checkout.session.completed',data:{object:{id:'cs_promo_badge',metadata:{order_id:orderId},payment_status:'paid',shipping_details:{name:'Fixture Buyer',address:{line1:'1 Test Lane',city:'Test City',postal_code:'44101',country:'US'}},currency:'usd',amount_total:total,payment_intent:'pi_fixture'}}});
      const timestamp=Math.floor(Date.now()/1000);const signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
      return fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});
    };
    assert.equal((await paid(17499)).status,400);assert.equal(context.db.prepare('SELECT COUNT(*) n FROM user_badges').get().n,0);
    assert.equal((await paid(17500)).status,200);assert.equal((await paid(17500)).status,200);
    assert.equal(context.db.prepare("SELECT use_count FROM designer_promo_codes WHERE code='BRIAR25'").get().use_count,1);
    for(let i=0;i<2;i++)assert.equal((await fetch(origin+'/api/checkout/session/cs_promo_badge')).status,200);
    const promoStats=context.db.prepare("SELECT use_count,revenue_cents,discount_cents FROM designer_promo_codes WHERE code='BRIAR25'").get();
    assert.deepEqual(promoStats,{use_count:1,revenue_cents:7500,discount_cents:2500});
    assert.equal(context.db.prepare("SELECT COUNT(*) n FROM analytics_events WHERE event_name='purchase' AND order_id=?").get(orderId).n,1);
    const badges=context.db.prepare('SELECT * FROM user_badges').all();assert.equal(badges.length,1);assert.equal(badges[0].buyer_subject,'buyer-sub');assert.equal(badges[0].badge_type,'verified_buyer');assert.equal(badges[0].source_id,orderId);
    const other=await fetch(origin+'/api/my/badges',{headers:{Authorization:'Bearer other-buyer'}});assert.equal(other.status,200);assert.deepEqual((await other.json()).badges,[]);
  }finally{
    if(server?.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));context?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;
  }
});
