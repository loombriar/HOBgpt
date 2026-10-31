const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
// The Android app consumes existing entitlements; new digital purchases stay disabled
// until Play Billing (or an enrolled alternative billing program) is implemented.
const androidWebView = req => /Android/i.test(req.get('User-Agent') || '') && /;\s*wv\)/i.test(req.get('User-Agent') || '');
const idOf = value => typeof value === 'string' ? value : value?.id;
function registerPortfolioSubscriptions({app,db,authBuyer,authDesigner,authAdmin,upload,fail,rateLimit,imageWork,stripeApi,trustedAppOrigin,imagesDir,options}) {
  const priceId = options.portfolioPriceId || process.env.STRIPE_PORTFOLIO_PRICE_ID || '';
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_billing (
    owner_subject TEXT PRIMARY KEY, customer_id TEXT UNIQUE, subscription_id TEXT UNIQUE,
    checkout_id TEXT UNIQUE, checkout_claim TEXT, status TEXT NOT NULL DEFAULT 'free',
    paid_until INTEGER NOT NULL DEFAULT 0, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS portfolio_images (id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL,
    storage_key TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS portfolio_settings (owner_subject TEXT PRIMARY KEY,
    layout TEXT NOT NULL DEFAULT 'grid', theme TEXT NOT NULL DEFAULT 'mint', featured_project TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS portfolio_views (id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL,
    viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const rowFor = subject => db.prepare('SELECT * FROM portfolio_billing WHERE owner_subject=?').get(subject);
  function access(subject) {
    const row=rowFor(subject);
    const premium=Boolean(row?.subscription_id && row.status==='active' && row.paid_until>Math.floor(Date.now()/1000));
    return {plan:premium?'premium':'free',premium,imageLimit:premium?30:5,customLayout:premium,featuredProjects:premium,analytics:premium,
      status:row?.status||'free',paidUntil:row?.paid_until||null,cancelAtPeriodEnd:Boolean(row?.cancel_at_period_end),canManageBilling:Boolean(row?.subscription_id)};
  }
  async function validatePrice() {
    if(!priceId)throw Object.assign(new Error('Premium subscriptions are not configured yet.'),{statusCode:503});
    const price=await stripeApi('prices/'+encodeURIComponent(priceId));
    if(price.id!==priceId || !price.active || price.currency!=='usd' || price.unit_amount!==499 || price.recurring?.interval!=='month' || (price.recurring.interval_count||1)!==1)
      throw Object.assign(new Error('Premium price must be $4.99 USD per month.'),{statusCode:503});
    return price;
  }
  const locks=new Map();
  async function locked(subject,fn) {
    const previous=locks.get(subject)||Promise.resolve();
    let release;const current=new Promise(resolve=>{release=resolve});locks.set(subject,current);
    await previous;
    try{return await fn();}finally{release();if(locks.get(subject)===current)locks.delete(subject);}
  }
  async function sync(subject,subscriptionId) {
    return locked(subject,async()=>{
      const row=rowFor(subject);if(!row?.customer_id)return;
      const subscription=await stripeApi('subscriptions/'+encodeURIComponent(subscriptionId)+'?expand[]=latest_invoice');
      if(subscription.id!==subscriptionId || idOf(subscription.customer)!==row.customer_id)throw new Error('Subscription ownership mismatch.');
      const items=subscription.items?.data||[];
      const matches=items.length===1 && idOf(items[0].price)===priceId && items[0].quantity===1;
      let invoice=subscription.latest_invoice;
      if(typeof invoice==='string')invoice=await stripeApi('invoices/'+encodeURIComponent(invoice));
      const invoiceSubscription=idOf(invoice?.parent?.subscription_details?.subscription)||idOf(invoice?.subscription);
      const paid=matches && subscription.status==='active' && !subscription.pause_collection && invoice?.status==='paid' && invoiceSubscription===subscriptionId && idOf(invoice.customer)===row.customer_id;
      const periodEnd=items[0]?.current_period_end || subscription.current_period_end;
      const lineEnds=(invoice?.lines?.data||[]).filter(line=>idOf(line.pricing?.price_details?.price)||idOf(line.price)).filter(line=>(idOf(line.pricing?.price_details?.price)||idOf(line.price))===priceId).map(line=>line.period?.end).filter(Number.isSafeInteger);
      const until=paid && Number.isSafeInteger(periodEnd) && lineEnds.length ? Math.min(periodEnd,...lineEnds) : 0;
      const status=matches?subscription.status:'unsupported_plan';
      db.prepare('UPDATE portfolio_billing SET subscription_id=?,status=?,paid_until=?,cancel_at_period_end=?,updated_at=CURRENT_TIMESTAMP WHERE owner_subject=? AND customer_id=?')
        .run(subscriptionId,status,until,subscription.cancel_at_period_end?1:0,subject,row.customer_id);
      return access(subject);
    });
  }
  async function reconcile(subject) {
    const row=rowFor(subject);
    if(row?.subscription_id)return sync(subject,row.subscription_id);
    if(!row?.checkout_id)return access(subject);
    const session=await stripeApi('checkout/sessions/'+encodeURIComponent(row.checkout_id));
    if(session.id!==row.checkout_id || idOf(session.customer)!==row.customer_id || session.mode!=='subscription')throw new Error('Checkout ownership mismatch.');
    if(session.status==='complete' && idOf(session.subscription))return sync(subject,idOf(session.subscription));
    return access(subject);
  }
  app.get('/api/creative-house/subscription/plans',(req,res)=>res.set('Cache-Control','no-store').json({plans:[{id:'free',amountCents:0,imageLimit:5},{id:'premium',amountCents:499,currency:'usd',interval:'month',imageLimit:30}],checkoutConfigured:Boolean(priceId) && !androidWebView(req)}));
  app.get('/api/creative-house/subscription',authBuyer,async(req,res,next)=>{try{await reconcile(req.buyerSubject);res.set('Cache-Control','no-store').json({access:access(req.buyerSubject)});}catch(e){next(e);}});
  app.post('/api/creative-house/subscription/checkout',authBuyer,async(req,res,next)=>{
    if(androidWebView(req))return fail(res,403,'purchase_unavailable','Portfolio upgrades are unavailable in this app.');
    try{const result=await locked(req.buyerSubject,async()=>{
      await validatePrice();
      if(!db.prepare('SELECT 1 FROM creative_profiles WHERE owner_subject=?').get(req.buyerSubject))return {error:'Create your free creative profile before upgrading.',code:409};
      let row=rowFor(req.buyerSubject);
      if(row?.subscription_id){const s=await stripeApi('subscriptions/'+encodeURIComponent(row.subscription_id));if(!['canceled','incomplete_expired'].includes(s.status))return {error:'You already have a subscription. Use Manage billing.',code:409};db.prepare('UPDATE portfolio_billing SET checkout_id=NULL,subscription_id=NULL,checkout_claim=NULL WHERE owner_subject=?').run(req.buyerSubject);row=rowFor(req.buyerSubject);}
      if(row?.checkout_id){const session=await stripeApi('checkout/sessions/'+encodeURIComponent(row.checkout_id));if(session.status==='open')return {url:session.url};if(session.status==='complete'&&idOf(session.subscription)){db.prepare('UPDATE portfolio_billing SET subscription_id=? WHERE owner_subject=?').run(idOf(session.subscription),req.buyerSubject);return {error:'Checkout is already complete. Refresh your subscription status.',code:409};}}
      db.prepare('INSERT OR IGNORE INTO portfolio_billing(owner_subject) VALUES (?)').run(req.buyerSubject);row=rowFor(req.buyerSubject);
      if(!row.customer_id){const customer=await stripeApi('customers',{method:'POST',body:new URLSearchParams({email:req.buyerEmail}).toString(),idempotencyKey:'hob-portfolio-customer-'+crypto.createHash('sha256').update(req.buyerSubject).digest('hex')});if(!customer.id?.startsWith('cus_'))throw new Error('Invalid Stripe customer.');db.prepare('UPDATE portfolio_billing SET customer_id=? WHERE owner_subject=?').run(customer.id,req.buyerSubject);row=rowFor(req.buyerSubject);}
      // Persist a claim before calling Stripe; retrying a lost response reuses the same session.
      const claim=row.checkout_claim||crypto.randomUUID();db.prepare('UPDATE portfolio_billing SET checkout_claim=? WHERE owner_subject=?').run(claim,req.buyerSubject);
      const origin=trustedAppOrigin(req),body=new URLSearchParams({mode:'subscription',customer:row.customer_id,'line_items[0][price]':priceId,'line_items[0][quantity]':'1',success_url:origin+'/creative-house.html?subscription=success#portfolios',cancel_url:origin+'/creative-house.html?subscription=canceled#portfolios'});
      const session=await stripeApi('checkout/sessions',{method:'POST',body:body.toString(),idempotencyKey:'hob-portfolio-checkout-'+claim});
      if(!session.id?.startsWith('cs_')||!session.url?.startsWith('https://checkout.stripe.com/'))throw new Error('Invalid Stripe checkout.');
      db.prepare('UPDATE portfolio_billing SET checkout_id=?,checkout_claim=NULL,subscription_id=NULL,status=\'pending\',paid_until=0 WHERE owner_subject=?').run(session.id,req.buyerSubject);return {url:session.url};
    });if(result.error)return fail(res,result.code,'subscription_exists',result.error);res.status(201).json(result);}catch(e){next(e);}
  });
  app.post('/api/creative-house/subscription/portal',authBuyer,async(req,res,next)=>{if(androidWebView(req))return fail(res,403,'purchase_unavailable','Billing portal is unavailable in this app.');try{const row=rowFor(req.buyerSubject);if(!row?.subscription_id)return fail(res,409,'no_subscription','No subscription to manage.');const session=await stripeApi('billing_portal/sessions',{method:'POST',body:new URLSearchParams({customer:row.customer_id,return_url:trustedAppOrigin(req)+'/creative-house.html#portfolios'}).toString()});res.json({url:session.url});}catch(e){next(e);}});
  app.post('/api/creative-house/subscription/cancel',authBuyer,async(req,res,next)=>{try{const row=rowFor(req.buyerSubject);if(!row?.subscription_id)return fail(res,409,'no_subscription','No subscription to cancel.');await stripeApi('subscriptions/'+encodeURIComponent(row.subscription_id),{method:'POST',body:'cancel_at_period_end=true'});await sync(req.buyerSubject,row.subscription_id);res.json({access:access(req.buyerSubject)});}catch(e){next(e);}});
  app.get('/api/admin/portfolio-subscriptions',authAdmin,(_req,res)=>res.set('Cache-Control','no-store').json({subscriptions:db.prepare('SELECT owner_subject,status,paid_until,cancel_at_period_end,updated_at FROM portfolio_billing ORDER BY updated_at DESC LIMIT 100').all()}));
  async function premium(req,res,next){try{await reconcile(req.buyerSubject);if(!access(req.buyerSubject).premium)return fail(res,403,'premium_required','An active paid Premium Portfolio is required.');next();}catch(e){next(e);}}
  const images=subject=>db.prepare('SELECT id,caption FROM portfolio_images WHERE owner_subject=? ORDER BY created_at,id').all(subject).map(image=>({...image,url:'/api/creative-house/portfolio-images/'+image.id}));
  function portfolio(subject,privateView=false){const a=access(subject),settings=db.prepare('SELECT layout,theme,featured_project FROM portfolio_settings WHERE owner_subject=?').get(subject);return {images:images(subject).slice(0,privateView?30:a.imageLimit),settings:a.premium?settings||{layout:'grid',theme:'mint',featured_project:''}:{layout:'grid',theme:'mint',featured_project:''},...(privateView?{access:a}:{})};}
  app.get('/api/creative-house/my-portfolio',authBuyer,async(req,res,next)=>{try{await reconcile(req.buyerSubject);res.set('Cache-Control','no-store').json(portfolio(req.buyerSubject,true));}catch(e){next(e);}});
  app.post('/api/creative-house/my-portfolio/images',authBuyer,imageWork.gate('buyer'),imageWork.parse,async(req,res,next)=>{
    let target;
    try{await reconcile(req.buyerSubject);if(!req.file)return fail(res,422,'image_required','Choose a JPEG, PNG, or WebP image.');if(!db.prepare('SELECT 1 FROM creative_profiles WHERE owner_subject=?').get(req.buyerSubject))return fail(res,409,'profile_required','Create a creative profile first.');
      const meta=await imageWork.run(()=>sharp(req.file.path,{limitInputPixels:40000000}).metadata());if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)return fail(res,422,'invalid_image','Choose a still JPEG, PNG, or WebP image.');
      const id=crypto.randomUUID(),key='portfolio-'+id+'.webp';target=path.join(imagesDir,key);await imageWork.run(()=>sharp(req.file.path,{limitInputPixels:40000000}).rotate().resize(2000,2000,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(target));
      const inserted=db.transaction(()=>{if(db.prepare('SELECT COUNT(*) n FROM portfolio_images WHERE owner_subject=?').get(req.buyerSubject).n>=access(req.buyerSubject).imageLimit)return false;db.prepare('INSERT INTO portfolio_images(id,owner_subject,storage_key,caption) VALUES (?,?,?,?)').run(id,req.buyerSubject,key,String(req.body?.caption||'').trim().slice(0,200));return true;}).immediate();
      if(!inserted){await fs.promises.unlink(target);return fail(res,409,'image_limit','Your portfolio has reached its image limit.');}res.status(201).json(portfolio(req.buyerSubject,true));
    }catch(e){if(target)await fs.promises.unlink(target).catch(()=>{});next(e);}
  });
  app.delete('/api/creative-house/my-portfolio/images/:id',authBuyer,async(req,res,next)=>{try{const image=db.prepare('SELECT * FROM portfolio_images WHERE id=? AND owner_subject=?').get(req.params.id,req.buyerSubject);if(!image)return fail(res,404,'not_found','Image not found.');db.prepare('DELETE FROM portfolio_images WHERE id=? AND owner_subject=?').run(image.id,req.buyerSubject);await fs.promises.unlink(path.join(imagesDir,image.storage_key)).catch(()=>{});res.json({deleted:true});}catch(e){next(e);}});
  app.put('/api/creative-house/my-portfolio/settings',authBuyer,premium,(req,res)=>{const {layout,theme,featured_project=''}=req.body||{};if(!['grid','editorial','spotlight'].includes(layout)||!['mint','coral','night'].includes(theme)||typeof featured_project!=='string'||featured_project.length>1000)return fail(res,422,'invalid_settings','Choose a valid layout, color, and featured project.');db.prepare('INSERT INTO portfolio_settings(owner_subject,layout,theme,featured_project) VALUES (?,?,?,?) ON CONFLICT(owner_subject) DO UPDATE SET layout=excluded.layout,theme=excluded.theme,featured_project=excluded.featured_project').run(req.buyerSubject,layout,theme,featured_project);res.json({saved:true});});
  app.get('/api/creative-house/my-portfolio/analytics',authBuyer,premium,(req,res)=>res.set('Cache-Control','no-store').json({views:db.prepare("SELECT COUNT(*) n FROM portfolio_views WHERE owner_subject=? AND viewed_at>=datetime('now','-30 days')").get(req.buyerSubject).n,days:30}));
  // Same audience and publication rules as the existing talent directory.
  app.get('/api/creative-house/portfolios/:slug',authDesigner,(req,res)=>{const profile=db.prepare('SELECT * FROM creative_profiles WHERE slug=? AND published=1').get(req.params.slug);if(!profile)return fail(res,404,'not_found','Portfolio not found.');db.prepare('INSERT INTO portfolio_views(id,owner_subject) VALUES (?,?)').run(crypto.randomUUID(),profile.owner_subject);db.prepare("DELETE FROM portfolio_views WHERE viewed_at<datetime('now','-90 days')").run();res.set('Cache-Control','no-store').json(portfolio(profile.owner_subject));});
  app.get('/api/creative-house/portfolio-images/:id',authBuyer,async(req,res,next)=>{try{const image=db.prepare('SELECT * FROM portfolio_images WHERE id=?').get(req.params.id);if(!image)return fail(res,404,'not_found','Image not found.');if(image.owner_subject!==req.buyerSubject){const profile=db.prepare('SELECT 1 FROM creative_profiles WHERE owner_subject=? AND published=1').get(image.owner_subject);const designer=db.prepare("SELECT p.id FROM designer_profiles p LEFT JOIN designer_identities i ON i.designer_id=p.id WHERE p.status='active' AND (i.subject=? OR 'designer:'||p.id=?)").get(req.buyerSubject,req.buyerSubject);if(!profile||!designer||!portfolio(image.owner_subject).images.some(i=>i.id===image.id))return fail(res,404,'not_found','Image not found.');}res.set('Cache-Control','no-store').type('image/webp').sendFile(path.join(imagesDir,image.storage_key));}catch(e){next(e);}});
  async function handleEvent(event) {
    if(event.account)return;
    const object=event.data?.object;
    if(event.type.startsWith('checkout.session.') && object?.mode==='subscription') {
      const row=db.prepare('SELECT * FROM portfolio_billing WHERE checkout_id=?').get(object.id);
      if(row)await reconcile(row.owner_subject);
    } else if(event.type.startsWith('customer.subscription.') || ['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type)) {
      const subscriptionId=event.type.startsWith('customer.subscription.')?object?.id:idOf(object?.parent?.subscription_details?.subscription)||idOf(object?.subscription);
      const customer=idOf(object?.customer);const row=db.prepare('SELECT * FROM portfolio_billing WHERE customer_id=?').get(customer||'');
      if(row && subscriptionId){if(row.subscription_id && row.subscription_id!==subscriptionId)return;if(!row.subscription_id){await reconcile(row.owner_subject);if(rowFor(row.owner_subject)?.subscription_id!==subscriptionId)return;}await sync(row.owner_subject,subscriptionId);}
    }
  }
  return {handleEvent,access};
}
module.exports={registerPortfolioSubscriptions};
