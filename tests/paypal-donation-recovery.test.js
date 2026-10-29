const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('PayPal donations recover lost returns and uncertain captures without duplicate badges',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-paypal-'));
  const previous=process.env.PAYPAL_WEBHOOK_ID;
  process.env.PAYPAL_WEBHOOK_ID='fixture-webhook';
  let ctx, server, captures=0, rejectSignature=false, loseResponse=false;
  const orders=new Map(), keys=[];
  try {
    ctx=createApp({dataDir:dir,seedProducts:[],resolveIdentity:async()=>null,sendEmail:async()=>true,
      stripeApi:async()=>{throw Error('Stripe must not be called');},
      paypalApi:async(endpoint,opts)=>{
        if(endpoint==='/v1/notifications/verify-webhook-signature')return {verification_status:rejectSignature?'FAILURE':'SUCCESS'};
        const id=endpoint.split('/')[4], order=orders.get(id);
        assert.ok(order,'only known provider order IDs are retrieved');
        if(endpoint.endsWith('/capture')){
          captures++; keys.push(opts.idempotencyKey);
          order.status='COMPLETED';order.purchase_units[0].payments={captures:[{id:'CAP-'+id,status:'COMPLETED',amount:{currency_code:'USD',value:'5.00'}}]};
          if(loseResponse){loseResponse=false;throw Error('response lost after payment');}
        }
        return structuredClone(order);
      }});
    function add(id,{amount='5.00',status='APPROVED',captureStatus='COMPLETED'}={}){
      ctx.db.prepare("INSERT INTO donations(id,buyer_subject,amount_cents,currency,status,created_at,payment_provider,paypal_order_id) VALUES (?, ?,500,'usd','pending',?,'paypal',?)").run(id,'customer:'+id,new Date().toISOString(),id);
      const unit={reference_id:id,custom_id:id,amount:{currency_code:'USD',value:amount}};
      if(status==='COMPLETED')unit.payments={captures:[{id:'CAP-'+id,status:captureStatus,amount:{currency_code:'USD',value:amount}}]};
      orders.set(id,{id,intent:'CAPTURE',status,purchase_units:[unit]});
    }
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const capture=id=>fetch(origin+'/api/paypal/donations/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paypalOrderId:id})});
    const webhook=(id,type='CHECKOUT.ORDER.APPROVED',headers=true)=>fetch(origin+'/api/paypal/webhook',{method:'POST',headers:{'Content-Type':'application/json',...(headers?{'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.test/cert','paypal-transmission-id':'tx','paypal-transmission-sig':'signature','paypal-transmission-time':new Date().toISOString()}: {})},body:JSON.stringify({id:'event-'+id,event_type:type,resource:{id,supplementary_data:{related_ids:{order_id:id}}}})});
    add('lost-return');
    assert.equal((await ctx.reconcileDonationBadges()).paypal.paid,1);
    assert.equal(captures,1);
    assert.equal(ctx.db.prepare("SELECT status FROM donations WHERE id='lost-return'").get().status,'paid');
    assert.equal((await webhook('lost-return')).status,200);
    const replies=await Promise.all([capture('lost-return'),capture('lost-return')]);
    assert.ok(replies.every(r=>r.status===200));assert.equal(captures,1);
    assert.equal(ctx.db.prepare('SELECT count(*) n FROM user_badges').get().n,1);
    add('uncertain');loseResponse=true;
    assert.equal((await capture('uncertain')).status,500);
    assert.equal((await ctx.reconcileDonationBadges()).paypal.paid,1);
    assert.equal(captures,2);assert.equal(new Set(keys).size,2);
    add('concurrent');
    const parallel=await Promise.all([capture('concurrent'),webhook('concurrent'),ctx.reconcileDonationBadges()]);
    assert.equal(parallel[0].status,200);assert.equal(parallel[1].status,200);assert.equal(captures,3);
    assert.equal(ctx.db.prepare("SELECT count(*) n FROM user_badges WHERE source_id='concurrent'").get().n,1);
    add('wrong-amount',{amount:'50.00'});
    assert.equal((await capture('wrong-amount')).status,409);assert.equal(captures,3);
    add('pending-capture',{status:'COMPLETED',captureStatus:'PENDING'});
    assert.equal((await capture('pending-capture')).status,409);
    add('forged');rejectSignature=true;
    assert.equal((await webhook('forged')).status,401);rejectSignature=false;
    assert.equal((await webhook('forged','CHECKOUT.ORDER.APPROVED',false)).status,401);
    assert.equal(captures,3);
    orders.get('forged').purchase_units[0].custom_id='another-donation';
    assert.equal((await webhook('forged')).status,409);assert.equal(captures,3);
    add('completed',{status:'COMPLETED'});
    assert.equal((await webhook('completed','PAYMENT.CAPTURE.COMPLETED')).status,200);
    assert.equal(captures,3);
    add('expired-attempt');ctx.db.prepare('UPDATE donations SET paypal_capture_started_at=? WHERE id=?').run(new Date(Date.now()-6*3600000).toISOString(),'expired-attempt');
    assert.equal((await capture('expired-attempt')).status,409);assert.equal(captures,3);
    delete process.env.PAYPAL_WEBHOOK_ID;
    assert.equal((await webhook('completed')).status,503);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});
    if(previous===undefined)delete process.env.PAYPAL_WEBHOOK_ID;else process.env.PAYPAL_WEBHOOK_ID=previous;
  }
});

test('PayPal return uses the provider token and pending/error responses do not claim success',async()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
  const returnCode=source.slice(source.indexOf('function showCheckoutReturnStatus()'),source.indexOf('const byId ='));
  for(const outcome of ['paid','pending','error']){
    let callback,requested,notice;
    const location={search:'?donation=paypal-success&token=REAL-ORDER&paypal_order_id=LOCAL-ID',pathname:'/',hash:''};
    const sandbox={URLSearchParams,location,history:{replaceState(_a,_b,url){location.search=url.includes('?')?'?'+url.split('?')[1]:'';}},document:{createElement(){return {setAttribute(){},textContent:''};},body:{prepend(value){notice=value.textContent;}}},apiRequest:async(_path,opts)=>{requested=JSON.parse(opts.body).paypalOrderId;if(outcome==='error')throw Error('network');return {status:outcome};}};
    sandbox.window={location,addEventListener(_name,fn){callback=fn;}};
    vm.runInNewContext(returnCode,sandbox);await callback();assert.equal(requested,'REAL-ORDER');
    if(outcome==='paid')assert.match(notice,/Thank you/);else {assert.match(notice,/awaiting confirmation/);assert.doesNotMatch(notice,/canceled|Thank you/);}
  }
});
