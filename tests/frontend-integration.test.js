const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createApp}=require('../server');
test('Railway advertises only the House auth mode and keeps existing storefront routes and assets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-frontend-')),ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{}}),server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{const config=await fetch(origin+'/api/frontend-config');assert.equal(config.headers.get('cache-control'),'no-store');assert.deepEqual(await config.json(),{authMode:'house-session'});
 for(const route of ['/','/index.html','/designers/room']){const response=await fetch(origin+route);assert.equal(response.status,200);assert.match(await response.text(),/designer-login-form/);}
 const roomCss=await fetch(origin+'/rooms.css');assert.equal(roomCss.status,200);assert.match(roomCss.headers.get('content-type'),/text\/css/);assert.match(roomCss.headers.get('cache-control'),/no-cache/);
 const css=await fetch(origin+'/styles.css');assert.match(css.headers.get('content-type'),/text\/css/);const image=await fetch(origin+'/house-of-briar-pastel-wordmark-v2.webp');assert.match(image.headers.get('content-type'),/image\/webp/);
 if(fs.existsSync(path.join(__dirname,'../apps/default/dist/index.html'))){const shop=await fetch(origin+'/shop');assert.equal(shop.status,200);assert.match(await shop.text(),/assets\/index-/);const unknown=await fetch(origin+'/missing-image.png');assert.equal(unknown.status,404);}
 }finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
