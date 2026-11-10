'use strict';
const crypto = require('node:crypto');
const {createSandboxOrder, captureSandboxOrder} = require('./paypal-single-seller-sandbox');

// Deliberately separate from merchandise orders and fulfillment. Fixed server-side test SKU.
const TEST_AMOUNT_CENTS = 100;
function installPayPalSandboxTestOrders({app, db, paypalApi, authAdmin, checkoutLimiter, trustedAppOrigin, env = process.env}) {
  db.exec(`CREATE TABLE IF NOT EXISTS paypal_sandbox_test_orders (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents = 100),
    currency TEXT NOT NULL CHECK(currency = 'USD'),
    paypal_order_id TEXT UNIQUE,
    paypal_capture_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('pending','created','completed','failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const enabled = () => env.PAYPAL_ENVIRONMENT === 'sandbox' &&
    env.PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED === 'true' &&
    !(env.NODE_ENV === 'production' && env.RAILWAY_ENVIRONMENT_NAME !== 'staging');
  const guard = (req,res,next) => {
    if (!enabled()) return res.status(503).json({error:'paypal_sandbox_disabled'});
    if (!['owner','operator'].includes(req.adminRole)) return res.status(403).json({error:'forbidden'});
    next();
  };
  const get = db.prepare('SELECT * FROM paypal_sandbox_test_orders WHERE id=? AND actor=?');
  const error = (next,e) => next(e);
  const output = row => ({id:row.id,status:row.status,amountCents:row.amount_cents,currency:row.currency,paypalOrderId:row.paypal_order_id,captureId:row.paypal_capture_id});
  app.post('/api/admin/paypal-sandbox/test-orders',authAdmin,checkoutLimiter,guard,async(req,res,next)=>{
    const id=crypto.randomUUID(),now=new Date().toISOString(),actor=req.adminActor;
    // No amount, SKU, seller, or redirect from the request is trusted.
    db.prepare("INSERT INTO paypal_sandbox_test_orders(id,actor,amount_cents,currency,status,created_at,updated_at) VALUES (?,?,100,'USD','pending',?,?)").run(id,actor,now,now);
    try {
      const origin=trustedAppOrigin(req);
      const order=await createSandboxOrder({env,paypalApi,referenceId:id,description:'House of Briar sandbox test purchase',amountCents:TEST_AMOUNT_CENTS,
        returnUrl:origin+'/?checkout=paypal-sandbox-return',cancelUrl:origin+'/?checkout=paypal-sandbox-cancel'});
      db.prepare("UPDATE paypal_sandbox_test_orders SET paypal_order_id=?,status='created',updated_at=? WHERE id=? AND actor=?").run(order.orderId,new Date().toISOString(),id,actor);
      return res.status(201).json({...output(get.get(id,actor)),approvalUrl:order.approvalUrl});
    } catch(e) {
      db.prepare("UPDATE paypal_sandbox_test_orders SET status='failed',updated_at=? WHERE id=? AND actor=?").run(new Date().toISOString(),id,actor);
      return error(next,e);
    }
  });
  app.get('/api/admin/paypal-sandbox/test-orders/:id',authAdmin,guard,(req,res)=>{
    const row=get.get(req.params.id,req.adminActor);
    return row?res.json(output(row)):res.status(404).json({error:'test_order_not_found'});
  });
  app.post('/api/admin/paypal-sandbox/test-orders/:id/capture',authAdmin,checkoutLimiter,guard,async(req,res,next)=>{
    const row=get.get(req.params.id,req.adminActor);
    if(!row)return res.status(404).json({error:'test_order_not_found'});
    if(row.status==='completed')return res.json(output(row));
    if(row.status!=='created'||!row.paypal_order_id)return res.status(409).json({error:'test_order_not_ready'});
    try {
      const result=await captureSandboxOrder({env,paypalApi,orderId:row.paypal_order_id,referenceId:row.id,amountCents:row.amount_cents,currency:row.currency});
      db.prepare("UPDATE paypal_sandbox_test_orders SET status='completed',paypal_capture_id=?,updated_at=? WHERE id=? AND actor=? AND status='created'").run(result.captureId,new Date().toISOString(),row.id,req.adminActor);
      return res.json(output(get.get(row.id,req.adminActor)));
    }catch(e){return error(next,e);}
  });
}
module.exports={installPayPalSandboxTestOrders};
