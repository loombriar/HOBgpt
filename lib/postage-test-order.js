const crypto = require('node:crypto');
const TEST_PROJECT = '2e6e0159-67a1-4b29-b070-6b99db63fabc';
function testOrderAvailable(env) {
  const shippo = env.SHIPPO_TEST_API_KEY || env.Shippo_Test || env.SHIPPO_API_KEY || '';
  return env.RAILWAY_PROJECT_ID === TEST_PROJECT && env.RAILWAY_ENVIRONMENT_NAME === 'testing' &&
    env.SHIPPO_LABELS_MODE === 'test' && shippo.startsWith('shippo_test_') && /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '');
}
function mountPostageTestOrder({app,db,authDesigner,env=process.env}) {
  app.get('/api/my/postage-test-order',authDesigner,(_req,res)=>res.json({available:testOrderAvailable(env)}));
  app.post('/api/my/postage-test-order',authDesigner,(req,res,next)=>{
    try {
      if (!testOrderAvailable(env)) return res.status(404).json({error:{message:'Sample orders are available only in the payment-test environment with test keys.'}});
      const suffix=crypto.createHash('sha256').update(req.designerId).digest('hex').slice(0,24);
      const id=`postage-test-${suffix}`;
      const now=new Date().toISOString();
      const created=db.transaction(()=>{
        const existing=db.prepare('SELECT id FROM orders WHERE id=?').get(id);
        if(existing)return false;
        // This is a fulfillment fixture, not a Stripe payment. The non-Stripe provider
        // prevents all existing Stripe payout paths from releasing fixture earnings.
        db.prepare(`INSERT INTO orders (id,stripe_session_id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at,payment_provider,shipping_details_json,shipping_required)
          VALUES (?,?,'paid','usd',10000,900,9100,?,?,'test_fixture',?,1)`).run(id,`cs_test_postage_fixture_${suffix}`,now,now,JSON.stringify({name:'Sample recipient — DO NOT SHIP',address:{line1:'1600 Amphitheatre Parkway',line2:'',city:'Mountain View',state:'CA',postal_code:'94043',country:'US'}}));
        db.prepare(`INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents)
          VALUES (?,?,?,?,?,10000,1,10000,900,9100)`).run(`item-${id}`,id,`fixture-${id}`,req.designerId,'TEST ONLY — Postage practice order (no payment)');
        db.prepare(`INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,release_reason)
          VALUES (?,?,?,'',9100,'pending',?,'test_fixture')`).run(`transfer-${id}`,id,req.designerId,now);
        return true;
      }).immediate();
      return res.status(created?201:200).json({orderId:id,simulated:true,created,message:'Sample order ready. No payment was taken, no inventory changed, and no payout can be released.'});
    }catch(e){next(e);}
  });
}
module.exports={mountPostageTestOrder,testOrderAvailable};
