const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('admin recovery requires Stripe-bound paid evidence, is idempotent and rejects refunded deposits',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-special-recovery-'));
  let session={id:'cs_legacy',metadata:{special_offer_id:'offer'},currency:'usd',amount_total:5000,status:'open',payment_status:'unpaid',payment_intent:'pi_legacy'};
  const ctx=createApp({dataDir,seedProducts:[{id:'piece',designerId:'maker',title:'Piece',price:100}],adminToken:'admin',
    stripeApi:async endpoint=>{assert.equal(endpoint,'checkout/sessions/cs_legacy');return session;}});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const now=new Date().toISOString();
    ctx.db.prepare("INSERT INTO listing_inquiries (id,listing_id,designer_id,buyer_subject,message,created_at) VALUES ('inquiry','piece','maker','buyer','Request',?)").run(now);
    ctx.db.prepare("INSERT INTO special_order_offers (id,inquiry_id,designer_id,buyer_subject,title,total_cents,deposit_cents,lead_days_min,lead_days_max,status,created_at,stripe_session_id) VALUES ('offer','inquiry','maker','buyer','Custom',10000,5000,7,14,'offered',?,'cs_legacy')").run(now);
    const url=`http://127.0.0.1:${server.address().port}/api/admin/special-deposits/offer/confirm-paid`;
    const post=async token=>fetch(url,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{}});
    assert.equal((await post()).status,401);
    assert.equal((await post('admin')).status,409);
    assert.equal(ctx.db.prepare("SELECT status FROM special_order_offers WHERE id='offer'").get().status,'offered');
    session={...session,status:'complete',payment_status:'paid',metadata:{special_offer_id:'wrong'}};
    assert.equal((await post('admin')).status,409);
    session={...session,metadata:{special_offer_id:'offer'}};
    assert.equal((await post('admin')).status,200);
    const paid=ctx.db.prepare("SELECT status,stripe_payment_intent_id,deposit_paid_at FROM special_order_offers WHERE id='offer'").get();
    assert.equal(paid.status,'deposit_paid');assert.equal(paid.stripe_payment_intent_id,'pi_legacy');assert.ok(paid.deposit_paid_at);
    assert.equal((await post('admin')).status,200);
    assert.equal(ctx.db.prepare("SELECT deposit_paid_at FROM special_order_offers WHERE id='offer'").get().deposit_paid_at,paid.deposit_paid_at);
    ctx.db.prepare("UPDATE special_order_offers SET status='deposit_refunded',stripe_refund_id='re_legacy' WHERE id='offer'").run();
    assert.equal((await post('admin')).status,409);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    ctx.analyticsIngest.close();ctx.db.close();fs.rmSync(dataDir,{recursive:true,force:true});
  }
});
