'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('security monitor reads only aggregate audit counts and cannot mutate or inspect private data', async () => {
  const old = process.env.ADMIN_TOKENS_JSON;
  const oldMfa = process.env.ADMIN_TOTP_REQUIRED;
  process.env.ADMIN_TOTP_REQUIRED = 'false';
  process.env.ADMIN_TOKENS_JSON = JSON.stringify({brotherTest:{token:'unique-monitor-fixture',role:'security_monitor'}});
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'hob-security-monitor-'));
  let ctx,server;
  try {
    ctx=createApp({dataDir,seedProducts:[],adminToken:'operator-fixture'});
    server=ctx.app.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const request=(url,method='GET',headers={})=>fetch(origin+url,{method,headers:{Origin:origin,Authorization:'Bearer unique-monitor-fixture',...headers}});
    const summary=await request('/api/admin/security-summary');
    assert.equal(summary.status,200);
    assert.equal(summary.headers.get('cache-control'),'no-store');
    const body=await summary.json();
    assert.deepEqual(Object.keys(body).sort(),['adminRequests','adminServerErrors','deniedAdminRequests','windowHours'].sort());
    assert.equal(body.windowHours,24);
    assert.equal((await request('/api/admin/session')).status,200);
    for(const [route,method] of [
      ['/api/admin/operations','GET'],['/api/admin/orders/missing','GET'],
      ['/api/admin/designers','GET'],['/api/admin/support','GET'],
      ['/api/admin/listings','GET'],['/api/admin/analytics','GET'],
      ['/api/admin/orders/missing/refund','POST'],
      ['/api/admin/orders/missing/designers/missing/release','POST'],
      ['/api/admin/designers/suspend','POST'],
      ['/api/admin/listings/missing/approve','POST'],
      ['/api/admin/security-summary','POST']
    ]) {
      const response=await request(route,method);
      assert.equal(response.status,403,method+' '+route);
      assert.equal((await response.json()).error.code,'admin_role_forbidden');
    }
    assert.equal((await request('/api/admin/security-summary','GET',{'X-Admin-Role':'owner'})).status,200);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor='brotherTest' AND role='security_monitor' AND status_code=403").get().n >= 10,true);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ctx)ctx.db.close();
    fs.rmSync(dataDir,{recursive:true,force:true});
    if(old===undefined)delete process.env.ADMIN_TOKENS_JSON;else process.env.ADMIN_TOKENS_JSON=old;
    if(oldMfa===undefined)delete process.env.ADMIN_TOTP_REQUIRED;else process.env.ADMIN_TOTP_REQUIRED=oldMfa;
  }
});
