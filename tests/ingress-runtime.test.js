const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('integrated ingress serves traffic, blocks direct backend, and validates exact Stripe webhook bytes', {timeout:20000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-ingress-runtime-'));
  const webhookSecret='whsec_runtime_fixture';
  const child=spawn(process.execPath,['scripts/start-ingress.js'],{
    cwd:path.join(__dirname,'..'),
    env:{...process.env,PORT:'0',DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1',ALLOWED_HOSTS:'127.0.0.1',
      NODE_ENV:'test',ADMIN_TOKEN:'runtime-admin-fixture',DESIGNER_TOKENS_JSON:'{}',
      MEASUREMENT_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),
      STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:webhookSecret,RESEND_API_KEY:'',OFFSITE_BACKUP_ENABLED:'false'},
    stdio:['ignore','pipe','pipe','ipc']
  });
  let logs='';child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
  try{
    const ready=await Promise.race([once(child,'message').then(([x])=>x),once(child,'exit').then(()=>{throw new Error(logs);})]);
    assert.equal(ready.type,'ingress-ready');
    const base=`http://127.0.0.1:${ready.port}`;
    const direct=`http://127.0.0.1:${ready.backendPort}`;
    assert.equal((await fetch(base+'/api/health')).status,200);
    assert.equal((await fetch(base+'/')).status,200);
    for(const ip of ['198.51.100.9','203.0.113.20']){
      assert.equal((await fetch(base+'/api/gallery',{headers:{'x-real-ip':ip,'x-forwarded-for':ip,'x-hob-ingress-signature':'fake'}})).status,200);
    }
    const bypass=await fetch(direct+'/api/gallery',{headers:{'x-real-ip':'198.51.100.9'}});
    assert.equal(bypass.status,403);
    assert.equal((await bypass.json()).error,'untrusted_ingress');
    const body='{\n  "id": "evt_ingress_runtime", "type": "fixture.unhandled", "data": {"object": {}}\n}';
    const timestamp=Math.floor(Date.now()/1000);
    const signature=crypto.createHmac('sha256',webhookSecret).update(`${timestamp}.${body}`).digest('hex');
    const headers={'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`};
    assert.equal((await fetch(base+'/api/stripe/webhook',{method:'POST',headers,body})).status,200);
    assert.equal((await fetch(base+'/api/stripe/webhook',{method:'POST',headers,body:body+' '})).status,400);
    assert.equal((await fetch(direct+'/api/stripe/webhook',{method:'POST',headers,body})).status,403);
  }finally{
    const exited=once(child,'exit');child.kill('SIGTERM');await exited;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
