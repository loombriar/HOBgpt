const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp}=require('../server');

test('designer donation identity, paid recovery, threshold and replay are correct',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-donation-'));
  const previous=process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET='whsec_donation_fixture';
  let context,server,createdBody;
  const sessions=new Map();
  try{
    context=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'loom',title:'Piece',price:10,category:'fashion'}],designerTokens:{'loom-token':'loom'},resolveIdentity:async()=>null,
      stripeApi:async(endpoint,options)=>{
        if(endpoint==='checkout/sessions'){
          createdBody=new URLSearchParams(options.body);
          const id='cs_'+sessions.size;
          sessions.set(id,{id,metadata:{donation_id:createdBody.get('metadata[donation_id]')},currency:'usd',amount_total:Number(createdBody.get('line_items[0][price_data][unit_amount]')),payment_status:'unpaid',status:'complete',customer_details:{email:'loom@example.test'}});
          return {id,url:'https://checkout.stripe.test/donation'};
        }
        return sessions.get(endpoint.split('/').pop());
      },sendEmail:async()=>true});
    context.db.prepare("UPDATE designer_profiles SET email='loom@example.test' WHERE id='loom'").run();
    server=context.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    const donate=async(amount,token)=>fetch(origin+'/api/donations/session',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({amount})});
    assert.equal((await donate(5,'loom-token')).status,201);
    const row=context.db.prepare('SELECT * FROM donations').get();
    assert.equal(row.buyer_subject,'designer:loom');assert.equal(row.buyer_email,'loom@example.test');
    assert.equal(createdBody.get('customer_email'),'loom@example.test');
    const read=()=>fetch(origin+'/api/my/badges',{headers:{Authorization:'Bearer loom-token'}});
    assert.deepEqual((await (await read()).json()).badges,[]);
    assert.equal((await context.reconcileDonationBadges()).awarded,0);
    const session=sessions.get(row.stripe_session_id);session.payment_status='paid';session.amount_total=499;
    assert.equal((await context.reconcileDonationBadges()).awarded,0);
    session.amount_total=500;
    assert.equal((await context.reconcileDonationBadges()).awarded,1);
    assert.equal((await context.reconcileDonationBadges()).awarded,0);
    assert.equal((await (await read()).json()).badges[0].type,'supporter');
    const gallery=await (await fetch(origin+'/api/gallery')).json();
    assert.ok(JSON.stringify(gallery).includes('supporter'));
    const storefront=await (await fetch(origin+'/api/designers/loom')).json();assert.equal(storefront.designer.badges[0].type,'supporter');
    context.db.prepare('DELETE FROM user_badges').run();
    context.db.prepare('UPDATE donations SET buyer_subject=NULL').run();
    assert.equal((await context.reconcileDonationBadges()).awarded,1);
    assert.equal(context.db.prepare('SELECT buyer_subject FROM donations').get().buyer_subject,'designer:loom');
    assert.equal((await donate(4,null)).status,201);
    const small=[...sessions.values()].at(-1);small.payment_status='paid';
    assert.equal((await context.reconcileDonationBadges()).awarded,0);
    const raw=JSON.stringify({id:'evt_donation',type:'checkout.session.completed',data:{object:session}});
    const timestamp=Math.floor(Date.now()/1000);const signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
    for(let i=0;i<2;i++)assert.equal((await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw})).status,200);
    assert.equal(context.db.prepare('SELECT COUNT(*) n FROM user_badges').get().n,1);
    const hash=crypto.createHash('sha256').update('signup-token').digest('hex');
    context.db.prepare('INSERT INTO designer_access_tokens(token_hash,designer_id,created_at) VALUES (?,?,?)').run(hash,'loom',new Date().toISOString());
    assert.equal((await donate(5,'signup-token')).status,201);
    const signupRead=await fetch(origin+'/api/my/donations',{headers:{Authorization:'Bearer signup-token'}});assert.equal(signupRead.status,200);assert.equal((await signupRead.json()).donations.length,3);
  }finally{
    if(server?.listening)await new Promise(r=>server.close(r));context?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;
  }
});
