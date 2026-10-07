const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp,SELLER_TERMS_VERSION}=require('../server');

test('first 25 designer slots persist across restart and suspension; later signups receive none', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-founders-'));
  const tokens=Object.fromEntries(Array.from({length:24},(_,i)=>['token'+i,'maker'+i]));
  let ctx,server;
  try {
    ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:tokens});
    server=ctx.app.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const signup=async n=>{
      const response=await fetch(origin+'/api/designer-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'founder'+n+'@example.test',displayName:'Maker '+n,brandName:'Studio '+n,categories:['Clothing'],sellerTermsAccepted:true,sellerTermsVersion:SELLER_TERMS_VERSION})});
      assert.equal(response.status,201); return response.json();
    };
    assert.deepEqual(await (await fetch(origin+'/api/founding-designers')).json(),{limit:25,awarded:24,remaining:1});
    const last=await signup(25),later=await signup(26);
    assert.deepEqual(await (await fetch(origin+'/api/founding-designers')).json(),{limit:25,awarded:25,remaining:0});
    assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM founding_designers').get().n,25);
    const publicLast=await (await fetch(origin+'/api/designers/'+last.designer.id)).json();
    assert.ok(publicLast.designer.badges.some(b=>b.type==='founding_designer'));
    const own=await (await fetch(origin+'/api/my/designer-profile',{headers:{Authorization:'Bearer '+last.accessToken}})).json();
    assert.equal(own.designer.foundingBadge.label,'Founding Designer');
    const publicLater=await (await fetch(origin+'/api/designers/'+later.designer.id)).json();
    assert.ok(!publicLater.designer.badges.some(b=>b.type==='founding_designer'));
    assert.equal((await fetch(origin+'/api/my/designer-profile')).status,401);
    const image=await fetch(origin+'/founding-designer-v2.webp');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/webp/);
    ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker0'").run();
    assert.equal((await fetch(origin+'/api/designers/maker0')).status,404);
    const before=ctx.db.prepare('SELECT * FROM founding_designers ORDER BY slot').all();
    await new Promise(r=>server.close(r));server=null;ctx.db.close();ctx=null;
    ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:tokens});
    assert.deepEqual(ctx.db.prepare('SELECT * FROM founding_designers ORDER BY slot').all(),before);
    assert.equal(ctx.db.prepare('SELECT * FROM founding_designers WHERE designer_id=?').get(later.designer.id),undefined);
  }finally {if(server)await new Promise(r=>server.close(r));ctx?.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
