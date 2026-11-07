const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createStripeOperations}=require('../lib/stripe-operations');

test('persistent operations survive interrupted local application without sending another POST',async()=>{
 const db=new Database(':memory:');let calls=0,broken=true,applied=0;
 const config={db,stripeApi:async()=>{calls++;return{id:'re_mock'};},applyResult:()=>{if(broken)throw new Error('interrupted local commit');applied++;}};
 try{
  const first=createStripeOperations(config);
  await assert.rejects(first.request('order_refund','order','refunds',{body:'amount=100',idempotencyKey:'original-key'}));
  assert.equal(db.prepare('SELECT state FROM stripe_operations').get().state,'received');
  broken=false;const restarted=createStripeOperations(config);await restarted.reconcile();assert.equal(applied,1);assert.equal(calls,1);
 }finally{db.close();}
});
test('uncertain requests never replay after 23 hours or with changed parameters',async()=>{
 const db=new Database(':memory:');let now=Date.now(),calls=0;
 try{
  const ops=createStripeOperations({db,now:()=>now,stripeApi:async()=>{calls++;throw new Error('response lost');},applyResult:()=>{}});
  await assert.rejects(ops.request('checkout','order','checkout/sessions',{body:'amount=100',idempotencyKey:'original-key'}));
  await assert.rejects(ops.request('checkout','order','checkout/sessions',{body:'amount=200',idempotencyKey:'original-key'}),/parameters changed/);
  assert.equal(calls,1);now+=23*60*60*1000;await ops.reconcile();assert.equal(calls,1);assert.equal(db.prepare('SELECT state FROM stripe_operations').get().state,'review_required');
 }finally{db.close();}
});
test('concurrent retries do not start another provider request',async()=>{
 const db=new Database(':memory:');let resolve,calls=0;
 try{
  const ops=createStripeOperations({db,stripeApi:()=>{calls++;return new Promise(r=>resolve=r);},applyResult:()=>{}});
  const request={body:'amount=100',idempotencyKey:'original-key'};
  const first=ops.request('checkout','order','checkout/sessions',request);
  await assert.rejects(ops.request('checkout','order','checkout/sessions',request),/being resolved/);
  resolve({id:'cs_mock'});await first;assert.equal(calls,1);
 }finally{db.close();}
});

test('a rejected replay cannot prove that an earlier unknown provider request did not happen',async()=>{
 const db=new Database(':memory:');let calls=0,released=0;
 try{
  const ops=createStripeOperations({db,stripeApi:async()=>{calls++;if(calls===1)throw new Error('response lost');throw Object.assign(new Error('credential rotated'),{providerStatus:401});},applyResult:()=>{},onRejected:()=>released++});
  await assert.rejects(ops.request('checkout','order','checkout/sessions',{body:'amount=100',idempotencyKey:'original-key'}));await ops.reconcile();
  assert.equal(calls,2);assert.equal(released,0);assert.equal(db.prepare('SELECT state FROM stripe_operations').get().state,'unknown');
 }finally{db.close();}
});

test('repeated payout replay rejection preserves the hold, including frozen provider errors',async()=>{
 const db=new Database(':memory:');let calls=0,released=0,applied=0;
 db.exec('CREATE TABLE designer_transfers (id TEXT PRIMARY KEY,payout_in_flight INTEGER NOT NULL DEFAULT 0)');
 db.prepare('INSERT INTO designer_transfers(id) VALUES (?)').run('transfer-465');
 const options={body:'amount=465&currency=usd',idempotencyKey:'hob-transfer-staging-order-maker'};
 try{
  const ops=createStripeOperations({db,stripeApi:async()=>{
   calls++;
   if(calls===1)throw new Error('connection dropped after POST');
   throw Object.freeze(Object.assign(new Error('credentials rejected on replay'),{providerStatus:401}));
  },applyResult:()=>{applied++;},onRejected:()=>{released++;db.prepare('UPDATE designer_transfers SET payout_in_flight=0 WHERE id=?').run('transfer-465');}});
  await assert.rejects(ops.request('payout','transfer-465','transfers',options),/connection dropped after POST/);
  for(let i=0;i<2;i++){
   const result=await ops.reconcile();
   assert.equal(result.errors,1);
   assert.equal(result.resolved,0);
  }
  assert.equal(calls,3);
  assert.equal(released,0);
  assert.equal(applied,0);
  assert.equal(db.prepare('SELECT payout_in_flight FROM designer_transfers').get().payout_in_flight,1);
  const row=db.prepare('SELECT state,attempt_count,response_json FROM stripe_operations').get();
  assert.equal(row.state,'unknown');
  assert.equal(row.attempt_count,3);
  assert.equal(row.response_json,null);
 }finally{db.close();}
});
