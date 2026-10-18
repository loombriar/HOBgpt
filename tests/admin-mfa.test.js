const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server');

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
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ctx)ctx.db.close();
    fs.rmSync(dataDir,{recursive:true,force:true});
    if(oldRequired===undefined)delete process.env.ADMIN_TOTP_REQUIRED;else process.env.ADMIN_TOTP_REQUIRED=oldRequired;
    if(oldSecrets===undefined)delete process.env.ADMIN_TOTP_SECRETS_JSON;else process.env.ADMIN_TOTP_SECRETS_JSON=oldSecrets;
  }
});
