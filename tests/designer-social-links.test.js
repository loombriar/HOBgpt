const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp}=require('../server');
test('designer social links save privately and expose only visible accounts publicly',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-social-')),ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{token:'maker'}}),server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const exchange=await fetch(origin+'/api/session',{method:'POST',headers:{Authorization:'Bearer token'}}),cookie=(exchange.headers.get('set-cookie')||'').split(';')[0];
  const save=await fetch(origin+'/api/my/designer-profile',{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({socialLinks:{instagram:{url:'https://instagram.com/maker',visible:true},tiktok:{url:'https://tiktok.com/@maker',visible:false}}})});assert.equal(save.status,200);
  const mine=await fetch(origin+'/api/my/designer-profile',{headers:{Cookie:cookie}});const privateProfile=(await mine.json()).designer;assert.equal(privateProfile.socialLinks.tiktok.visible,false);
  const pub=await fetch(origin+'/api/designers/maker');const publicProfile=(await pub.json()).designer;assert.equal(publicProfile.socialLinks.instagram.url,'https://instagram.com/maker');assert.equal(publicProfile.socialLinks.tiktok,undefined);
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
