const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {once}=require('node:events');
const {createApp}=require('../server');

async function fixture(run){
  const names=['ADMIN_TOKEN','ADMIN_TOKENS','ADMIN_TOKENS_JSON','ADMIN_TOTP_REQUIRED','ADMIN_TOTP_SECRETS_JSON'];
  const previous=names.map(name=>process.env[name]);
  delete process.env.ADMIN_TOKEN;delete process.env.ADMIN_TOKENS;
  process.env.ADMIN_TOTP_REQUIRED='false';
  const identities={owner:{token:'owner-lifecycle-fixture',role:'owner'},reviewer:{token:'reviewer-lifecycle-fixture',role:'reviewer'},support:{token:'support-lifecycle-fixture',role:'support'}};
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-admin-lifecycle-'));
  let ctx,server,origin;
  async function stop(){if(server){await new Promise(resolve=>server.close(resolve));server=null;}if(ctx){ctx.db.close();ctx=null;}}
  async function start(entries=identities,{required=false,secrets={}}={}){
    await stop();process.env.ADMIN_TOKENS_JSON=JSON.stringify(entries);
    process.env.ADMIN_TOTP_REQUIRED=String(required);process.env.ADMIN_TOTP_SECRETS_JSON=JSON.stringify(secrets);
    ctx=createApp({dataDir,seedProducts:[]});server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  }
  const request=(route,cookie,method='GET',extra={})=>fetch(origin+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin}:{}),...extra}});
  async function login(label,code){const response=await request('/api/admin/session',null,'POST',{Authorization:'Bearer '+identities[label].token,...(code?{'X-Admin-TOTP':code}:{})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const hash=cookie=>crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex');
  try{await start();await run({start,request,login,hash,identities,get ctx(){return ctx;}});}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true});names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});}
}

test('expired admin cookies are rejected and removed without revoking other identities',async()=>fixture(async f=>{
  const cookies={};for(const role of ['owner','reviewer','support'])cookies[role]=await f.login(role);
  for(const [role,route] of [['reviewer','/api/admin/listings'],['support','/api/admin/support']]){
    assert.equal((await f.request(route,cookies[role])).status,200);
    f.ctx.db.prepare('UPDATE admin_sessions SET expires_at=? WHERE session_hash=?').run('2000-01-01T00:00:00.000Z',f.hash(cookies[role]));
    for(const target of ['/api/admin/session',route,'/api/admin/designers'])assert.equal((await f.request(target,cookies[role])).status,401,target);
    assert.equal(f.ctx.db.prepare('SELECT 1 FROM admin_sessions WHERE session_hash=?').get(f.hash(cookies[role])),undefined);
    assert.equal((await f.request('/api/admin/designers',cookies.owner)).status,200);
  }
}));

test('logging out one administrator leaves another session active and preserves audit identity',async()=>fixture(async f=>{
  const reviewer=await f.login('reviewer'),support=await f.login('support');
  assert.equal((await f.request('/api/admin/session',reviewer,'DELETE')).status,200);
  for(const route of ['/api/admin/session','/api/admin/listings'])assert.equal((await f.request(route,reviewer)).status,401);
  assert.equal((await f.request('/api/admin/support',support)).status,200);
  assert.equal((await f.request('/api/admin/listings',support,'GET',{'X-Admin-Role':'owner','X-Admin-Actor':'owner',Authorization:'Bearer '+f.identities.owner.token})).status,403);
  const audit=f.ctx.db.prepare("SELECT actor,role,status_code FROM admin_audit_log WHERE path='/api/admin/listings' AND status_code=403").all();
  assert.ok(audit.some(row=>row.actor==='support'&&row.role==='support'));
  assert.equal(f.ctx.db.prepare('SELECT count(*) n FROM admin_sessions').get().n,1);
}));

test('persistent admin sessions survive unchanged config but fail after token rotation, role change or removal',async()=>fixture(async f=>{
  const owner=await f.login('owner'),reviewer=await f.login('reviewer'),support=await f.login('support');
  await f.start();
  assert.equal((await f.request('/api/admin/listings',reviewer)).status,200);
  const changed=structuredClone(f.identities);
  changed.reviewer.token='rotated-reviewer-lifecycle-fixture';changed.support.role='reviewer';
  await f.start(changed);
  for(const cookie of [reviewer,support]){
    for(const route of ['/api/admin/session','/api/admin/listings','/api/admin/support'])assert.equal((await f.request(route,cookie)).status,401);
    assert.equal(f.ctx.db.prepare('SELECT 1 FROM admin_sessions WHERE session_hash=?').get(f.hash(cookie)),undefined);
  }
  assert.equal((await f.request('/api/admin/designers',owner)).status,200);
  delete changed.owner;await f.start(changed);
  assert.equal((await f.request('/api/admin/designers',owner)).status,401);
  assert.equal(f.ctx.db.prepare('SELECT count(*) n FROM admin_sessions').get().n,0);
}));

const FACTOR_A='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const FACTOR_B='MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK';
function factorCode(secret,step=0){
  const key=Buffer.from(secret==='a'?'12345678901234567890':'abcdefghijabcdefghij');
  const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+step));
  const digest=crypto.createHmac('sha1',key).update(message).digest();
  return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,'0');
}

test('enabling MFA rejects persisted sessions issued without a second factor',async()=>fixture(async f=>{
  const cookie=await f.login('owner');
  await f.start(f.identities,{required:true,secrets:{owner:FACTOR_A}});
  assert.equal((await f.request('/api/admin/designers',cookie)).status,401);
  assert.equal(f.ctx.db.prepare('SELECT count(*) n FROM admin_sessions').get().n,0);
  const verified=await f.login('owner',factorCode('a'));
  assert.equal((await f.request('/api/admin/designers',verified)).status,200);
}));

test('factor rotation revokes only the affected identity and requires fresh verified login',async()=>fixture(async f=>{
  const initial={required:true,secrets:{owner:FACTOR_A,support:FACTOR_B}};
  await f.start(f.identities,initial);
  const owner=await f.login('owner',factorCode('a'));
  const support=await f.login('support',factorCode('b'));
  await f.start(f.identities,initial);
  assert.equal((await f.request('/api/admin/designers',owner)).status,200);
  // A replacement device uses a new factor; changing another person's factor
  // must leave the unaffected support session available for recovery.
  await f.start(f.identities,{required:true,secrets:{owner:FACTOR_B,support:FACTOR_B}});
  assert.equal((await f.request('/api/admin/designers',owner)).status,401);
  assert.equal(f.ctx.db.prepare('SELECT 1 FROM admin_sessions WHERE session_hash=?').get(f.hash(owner)),undefined);
  assert.equal((await f.request('/api/admin/support',support)).status,200);
  const invalid=await f.request('/api/admin/session',null,'POST',{Authorization:'Bearer '+f.identities.owner.token,'X-Admin-TOTP':factorCode('a')});
  assert.equal(invalid.status,401);
  // The next accepted time step avoids reusing this actor's consumed counter.
  const fresh=await f.login('owner',factorCode('b',1));
  assert.equal((await f.request('/api/admin/designers',fresh)).status,200);
}));

test('removing a required factor and legacy token-only bindings invalidate old sessions',async()=>fixture(async f=>{
  await f.start(f.identities,{required:true,secrets:{owner:FACTOR_A}});
  const cookie=await f.login('owner',factorCode('a'));
  await f.start(f.identities,{required:true});
  assert.equal((await f.request('/api/admin/designers',cookie)).status,401);
  await f.start();
  const legacy=await f.login('owner');
  f.ctx.db.prepare('UPDATE admin_sessions SET credential_hash=? WHERE session_hash=?')
    .run(crypto.createHash('sha256').update(f.identities.owner.token).digest('hex'),f.hash(legacy));
  assert.equal((await f.request('/api/admin/designers',legacy)).status,401);
}));
