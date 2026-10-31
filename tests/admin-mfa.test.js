const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server');

test('MFA verification authenticates the token, checks codes without a session, and preserves login', async () => {
  const names=['ADMIN_TOTP_REQUIRED','ADMIN_TOTP_SECRETS_JSON','ADMIN_TOTP_DIAGNOSTICS'];
  const previous=names.map(name=>process.env[name]);
  process.env.ADMIN_TOTP_REQUIRED='true';
  process.env.ADMIN_TOTP_DIAGNOSTICS='true';
  process.env.ADMIN_TOTP_SECRETS_JSON=JSON.stringify({'legacy-admin':'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'});
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-mfa-check-'));
  let ctx,server;
  try {
    ctx=createApp({dataDir,seedProducts:[],adminToken:'diagnostic-test-token'});
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const code=totp(Buffer.from('12345678901234567890'),Math.floor(Date.now()/30000));
    const check=(token,value)=>fetch(origin+'/api/admin/totp-check',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'X-Admin-TOTP':value}});
    assert.equal((await check('wrong-token',code)).status,401);
    const valid=await check('diagnostic-test-token',code);
    assert.equal(valid.status,200);
    assert.equal(valid.headers.get('set-cookie'),null);
    assert.deepEqual(await valid.json(),{valid:true});
    assert.deepEqual(await (await check('diagnostic-test-token','bad')).json(),{valid:false});
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_totp_used').get().n,0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n,0);
    const login=()=>fetch(origin+'/api/admin/session',{method:'POST',headers:{Authorization:'Bearer diagnostic-test-token',Origin:origin,'X-Admin-TOTP':code}});
    assert.equal((await login()).status,200);
    assert.equal((await login()).status,401);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ctx)ctx.db.close();
    fs.rmSync(dataDir,{recursive:true,force:true});
    names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});
  }
});

function totp(secret, counter) {
  const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac('sha1',secret).update(msg).digest();
  const offset=digest[19]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

test('required admin MFA rejects missing, replayed, and bearer-bypass credentials', async () => {
  const oldRequired=process.env.ADMIN_TOTP_REQUIRED;
  const oldSecrets=process.env.ADMIN_TOTP_SECRETS_JSON;
  const secret=Buffer.from('12345678901234567890');
  process.env.ADMIN_TOTP_REQUIRED='true';
  process.env.ADMIN_TOTP_SECRETS_JSON=JSON.stringify({'legacy-admin':'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'});
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-mfa-'));
  let ctx,server;
  try {
    ctx=createApp({dataDir,seedProducts:[],adminToken:'legacy-admin-test-token'});
    server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const login=code=>fetch(origin+'/api/admin/session',{method:'POST',headers:{Authorization:'Bearer legacy-admin-test-token',Origin:origin,...(code?{'X-Admin-TOTP':code}:{})}});
    assert.equal((await login()).status,401);
    const code=totp(secret,Math.floor(Date.now()/30000));
    const success=await login(code);
    assert.equal(success.status,200);
    const cookie=success.headers.get('set-cookie').split(';')[0];
    assert.equal((await login(code)).status,401);
    assert.equal((await fetch(origin+'/api/admin/designers',{headers:{Authorization:'Bearer legacy-admin-test-token'}})).status,403);
    assert.equal((await fetch(origin+'/api/admin/designers',{headers:{Cookie:cookie}})).status,200);
    // Attribute the MFA-backed request to its actual administrator identity and role.
    await new Promise(resolve => setTimeout(resolve, 10));
    const audit=ctx.db.prepare("SELECT actor,role,method,path,status_code FROM admin_audit_log WHERE path='/api/admin/designers' ORDER BY created_at DESC LIMIT 1").get();
    assert.deepEqual(audit,{actor:'legacy-admin',role:'operator',method:'GET',path:'/api/admin/designers',status_code:200});
    // MFA-backed sessions must be revocable; a previously valid cookie cannot survive logout.
    const logout=await fetch(origin+'/api/admin/session',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}});
    assert.equal(logout.status,200);
    assert.equal((await fetch(origin+'/api/admin/designers',{headers:{Cookie:cookie}})).status,401);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n,0);
    // A consumed TOTP code must not silently reissue a session after logout.
    assert.equal((await login(code)).status,401);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ctx)ctx.db.close();
    fs.rmSync(dataDir,{recursive:true,force:true});
    if(oldRequired===undefined)delete process.env.ADMIN_TOTP_REQUIRED;else process.env.ADMIN_TOTP_REQUIRED=oldRequired;
    if(oldSecrets===undefined)delete process.env.ADMIN_TOTP_SECRETS_JSON;else process.env.ADMIN_TOTP_SECRETS_JSON=oldSecrets;
  }
});


test('named MFA identities cannot authenticate with another administrator\'s TOTP code', async () => {
  const names = ['ADMIN_TOKENS_JSON', 'ADMIN_TOTP_REQUIRED', 'ADMIN_TOTP_SECRETS_JSON'];
  const previous = names.map(name => process.env[name]);
  const aliceSecret = Buffer.from('12345678901234567890');
  const bobSecret = Buffer.from('abcdefghijabcdefghij');
  process.env.ADMIN_TOKENS_JSON = JSON.stringify({
    alice: { token: 'alice-mfa-test-token', role: 'reviewer' },
    bob: { token: 'bob-mfa-test-token', role: 'support' }
  });
  process.env.ADMIN_TOTP_REQUIRED = 'true';
  process.env.ADMIN_TOTP_SECRETS_JSON = JSON.stringify({
    alice: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    bob: 'MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK'
  });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-named-mfa-'));
  let ctx, server;
  try {
    ctx = createApp({ dataDir, seedProducts: [], adminToken: 'legacy-mfa-test-token' });
    server = ctx.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const counter = Math.floor(Date.now() / 30000);
    const aliceCode = totp(aliceSecret, counter);
    const bobCode = totp(bobSecret, counter);
    const login = (token, code) => fetch(origin + '/api/admin/session', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, Origin: origin, 'X-Admin-TOTP': code }
    });
    assert.equal((await login('alice-mfa-test-token', bobCode)).status, 401);
    assert.equal((await login('bob-mfa-test-token', aliceCode)).status, 401);
    const alice = await login('alice-mfa-test-token', aliceCode);
    assert.equal(alice.status, 200);
    const aliceCookie = alice.headers.get('set-cookie').split(';')[0];
    assert.equal((await login('alice-mfa-test-token', aliceCode)).status, 401);
    const bob = await login('bob-mfa-test-token', bobCode);
    assert.equal(bob.status, 200);
    const bobCookie = bob.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(origin + '/api/admin/listings', { headers: { Cookie: aliceCookie } })).status, 200);
    assert.equal((await fetch(origin + '/api/admin/support', { headers: { Cookie: aliceCookie } })).status, 403);
    assert.equal((await fetch(origin + '/api/admin/support', { headers: { Cookie: bobCookie } })).status, 200);
    assert.equal((await fetch(origin + '/api/admin/listings', { headers: { Cookie: bobCookie } })).status, 403);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (ctx) ctx.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    });
  }
});
