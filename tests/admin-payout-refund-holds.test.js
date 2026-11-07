const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('operations exposes seller-scoped refund holds without changing transfers',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-payout-refund-holds-'));
  const ctx=createApp({dataDir:dir,seedProducts:[],adminToken:'fixture-admin',sendEmail:async()=>true});
  const db=ctx.db,now=new Date().toISOString();
  db.prepare("INSERT INTO orders (id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('order','paid','stripe','usd',1200,70,1130,?)").run(now);
  for(const [id,amount] of [['refunded-maker',665],['other-maker',465]])db.prepare("INSERT INTO designer_transfers (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at) VALUES (?,'order',?,'acct_fixture',?,'pending',?)").run(id,id,amount,now);
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/api/admin/operations';
  const read=async()=>{const response=await fetch(url,{headers:{Authorization:'Bearer fixture-admin'}});assert.equal(response.status,200);return (await response.json()).payouts.sort((a,b)=>a.designer_id.localeCompare(b.designer_id));};
  const refund=(scope,status)=>db.prepare("INSERT INTO order_refunds (order_id,scope,amount_cents,status,created_at,updated_at) VALUES ('order',?,700,?,?,?)").run(scope,status,now,now);
  try{
    assert.equal((await fetch(url)).status,401);
    assert.ok((await read()).every(p=>p.refund_hold===false&&p.refund_status===null));
    db.prepare("UPDATE orders SET refund_status='partial' WHERE id='order'").run();
    refund('refunded-maker','succeeded');
    let payouts=await read();
    assert.equal(payouts[0].designer_id,'other-maker');assert.equal(payouts[0].refund_hold,false);assert.equal(payouts[0].refund_status,null);
    assert.equal(payouts[1].refund_hold,true);assert.equal(payouts[1].refund_status,'succeeded');
    // Match the release gate even for pending, failed or canceled refund records.
    for(const status of ['initiating','pending','failed','canceled']){
      db.prepare("UPDATE order_refunds SET status=? WHERE order_id='order'").run(status);
      payouts=await read();assert.equal(payouts[1].refund_hold,true);assert.equal(payouts[1].refund_status,status);assert.equal(payouts[0].refund_hold,false);
    }
    db.prepare("DELETE FROM order_refunds WHERE order_id='order'").run();
    refund('full','succeeded');
    assert.ok((await read()).every(p=>p.refund_hold===true&&p.refund_status==='succeeded'));
    // Older refunds may only have the order-level summary.
    db.prepare("DELETE FROM order_refunds WHERE order_id='order'").run();
    db.prepare("UPDATE orders SET refund_status='succeeded' WHERE id='order'").run();
    assert.ok((await read()).every(p=>p.refund_hold===true&&p.refund_status==='succeeded'));
    assert.ok(db.prepare('SELECT status FROM designer_transfers').all().every(p=>p.status==='pending'));
  }finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
