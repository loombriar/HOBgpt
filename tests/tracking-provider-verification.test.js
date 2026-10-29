const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');

const number='9400111899223856928499';
const carrier='usps';
const tracking=()=>({object_id:'trk_fixture',tracking_number:number,carrier,tracking_status:{status:'TRANSIT'},tracking_history:[{status:'TRANSIT',status_date:'2026-10-24T12:00:00Z'}],test:false});
async function fixture(run,{testKey=false}={}){
  const previous=process.env.SHIPPO_API_KEY;
  process.env.SHIPPO_API_KEY=testKey?'shippo_test_fixture_only':'shippo_live_fixture_only';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-tracking-provider-'));
  const providerCalls=[],stripeCalls=[],emails=[];
  let providerBody=tracking(),providerStatus=200;
  const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Tracking fixture',price:50}],designerTokens:{'fixture-maker':'maker'},adminToken:'fixture-admin',
    fetch:async(url,options)=>{assert.equal(url,'https://api.goshippo.com/tracks/');providerCalls.push(JSON.parse(options.body));return new Response(JSON.stringify(providerBody),{status:providerStatus,headers:{'Content-Type':'application/json'}});},
    stripeApi:async(endpoint,options)=>{assert.equal(endpoint,'transfers');stripeCalls.push(new URLSearchParams(options.body));return{id:'tr_fixture_only'};},
    sendEmail:async message=>{emails.push(message);return true;}});
  const db=ctx.db,now=new Date().toISOString();
  db.prepare("UPDATE designer_profiles SET stripe_account_id='acct_fixture_only',status='active' WHERE id='maker'").run();
  db.prepare('INSERT INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker',SELLER_TERMS_VERSION,now,'fixture');
  db.prepare("INSERT INTO orders (id,status,payment_provider,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at) VALUES ('order','paid','stripe','usd',5000,350,4650,?,?)").run(now,now);
  db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES ('line','order','piece','maker','Tracking fixture',5000,1,5000,350,4650)").run();
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const submit=()=>fetch(origin+'/api/orders/order/tracking',{method:'POST',headers:{Authorization:'Bearer fixture-maker','Content-Type':'application/json'},body:JSON.stringify({carrier:'USPS',trackingNumber:number})});
  const transfer=()=>db.prepare("SELECT * FROM designer_transfers WHERE order_id='order' AND designer_id='maker'").get();
  try{await run({db,submit,transfer,providerCalls,stripeCalls,emails,setProvider(body,status=200){providerBody=body;providerStatus=status;}});}
  finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.SHIPPO_API_KEY;else process.env.SHIPPO_API_KEY=previous;}
}

test('mismatched or incomplete provider tracking never verifies or reaches Stripe',async()=>fixture(async f=>{
  for(const override of [{tracking_number:'9400111899223856928400'},{carrier:'ups'},{tracking_number:undefined},{carrier:undefined}]){
    f.setProvider({...tracking(),...override});
    const response=await f.submit();assert.equal(response.status,502);
    assert.equal((await response.json()).error.code,'internal_error');
    assert.equal(f.transfer().tracking_verified_at,null);
    assert.equal(f.transfer().tracking_number,null);
    assert.equal(f.transfer().status,'pending');assert.equal(f.stripeCalls.length,0);
    assert.equal(f.emails.length,0);
  }
  // A valid response after prior failures can still complete the shipment.
  f.setProvider(tracking());assert.equal((await f.submit()).status,200);assert.equal(f.stripeCalls.length,1);
}));

test('provider-marked test responses stay simulated even with a live-shaped key',async()=>fixture(async f=>{
  f.setProvider({...tracking(),test:true});
  const response=await f.submit();assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{verified:false,status:'test_transit'});
  assert.equal(f.transfer().tracking_verified_at,null);assert.equal(f.transfer().status,'pending');
  assert.equal(f.stripeCalls.length,0);
}));

test('test key never verifies a shipment even when the provider omits its test marker',async()=>fixture(async f=>{
  f.setProvider({...tracking(),carrier:'shippo',test:false});
  const response=await f.submit();assert.equal(response.status,202);
  assert.equal((await response.json()).verified,false);
  assert.equal(f.providerCalls[0].carrier,'shippo');assert.equal(f.transfer().tracking_verified_at,null);
  assert.equal(f.stripeCalls.length,0);
},{testKey:true}));

test('matching live tracking with no carrier event remains held',async()=>fixture(async f=>{
  f.setProvider({...tracking(),tracking_history:[]});
  const response=await f.submit();assert.equal(response.status,202);
  assert.equal((await response.json()).verified,false);
  assert.equal(f.transfer().tracking_verified_at,null);assert.equal(f.stripeCalls.length,0);
}));

test('matching live carrier event permits one correctly valued mocked payout across retries',async()=>fixture(async f=>{
  f.setProvider({...tracking(),carrier:'USPS'});
  for(let i=0;i<2;i++){
    const response=await f.submit();assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.verified,true);assert.equal(result.transfers[0].status,'paid');
  }
  assert.equal(f.providerCalls.length,1);assert.equal(f.providerCalls[0].tracking_number,number);
  assert.equal(f.stripeCalls.length,1);assert.equal(f.stripeCalls[0].get('amount'),'4650');
  assert.equal(f.stripeCalls[0].get('destination'),'acct_fixture_only');
  assert.ok(f.transfer().tracking_verified_at);assert.equal(f.transfer().stripe_transfer_id,'tr_fixture_only');
}));

test('provider rejection preserves payout and tracking holds',async()=>fixture(async f=>{
  f.setProvider({detail:'Unknown carrier'},422);
  const response=await f.submit();assert.equal(response.status,422);
  assert.equal(f.transfer().tracking_verified_at,null);assert.equal(f.transfer().tracking_number,null);
  assert.equal(f.stripeCalls.length,0);
}));
