const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('trusted-host guard rejects unexpected Host before routes, and allows configured Host',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-trusted-host-'));
  const ctx=createApp({dataDir,seedProducts:[],appOrigin:'https://houseofbriar.shop',enforceTrustedHost:true});
  const server=ctx.app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const bad=await fetch(base+'/api/products',{headers:{Host:'attacker.example'}});
    assert.equal(bad.status,400);
    assert.equal((await bad.json()).error.code,'invalid_host');
    const good=await fetch(base+'/api/products',{headers:{Host:'houseofbriar.shop'}});
    assert.notEqual(good.status,400);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    ctx.analyticsIngest.close();
    ctx.db.close();
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
});

test('OIDC outbound URLs are pinned and both discovery and userinfo reject redirects',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  const block=server.slice(server.indexOf('async function resolveDesignerIdentity('),server.indexOf('function designerBadgeSubject('));
  assert.match(block,/if \(!oidcIssuer\) return null/);
  assert.match(block,/fetch\(\x60\$\{oidcIssuer\}\/\_genesis\/auth\/\.well-known\/openid-configuration\x60, \{redirect:'error'\}\)/);
  assert.match(block,/metadata\.issuer !== oidcIssuer/);
  assert.match(block,/isSameOriginUrl\(metadata\.userinfo_endpoint, oidcIssuer\)/);
  assert.match(block,/fetch\(metadata\.userinfo_endpoint, \{redirect:'error'/);
  assert.doesNotMatch(block,/trustedAppOrigin\(req\)/);
});
