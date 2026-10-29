const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const collection=require('../shared/atelier-emine-preview.json');

test('public collection contains 88 display-only pieces and excludes the seller-withdrawn SKU',()=>{
  assert.equal(collection.length,88);
  assert.equal(new Set(collection.map(p=>p.sku)).size,88);
  assert.ok(!collection.some(p=>p.sku==='ATELIEREMINE753'||p.name==='Silva Linen'));
  for(const piece of collection){
    assert.deepEqual(Object.keys(piece).sort(),['sku','name','description','priceUsd','images','care'].sort());
    assert.ok(piece.name&&piece.description&&piece.priceUsd>0&&Number.isFinite(piece.priceUsd));
    assert.ok(piece.images.length>0);
    for(const image of piece.images)assert.equal(new URL(image).origin,'https://www.atelieremine.com');
  }
});
test('preview route works without activating a seller or adding purchasable inventory',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-public-preview-'));
  const dist=path.join(dir,'apps','default','dist');fs.mkdirSync(dist,{recursive:true});
  fs.writeFileSync(path.join(dist,'index.html'),'<!doctype html><div id="root"></div>');
  const ctx=createApp({rootDir:dir,dataDir:path.join(dir,'data'),seedProducts:[],designerTokens:{}});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(origin+'/atelier-emine');
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
    assert.match(response.headers.get('content-security-policy'),/img-src[^;]*https:\/\/www\.atelieremine\.com/);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM designer_profiles').get().n,0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,0);
    const quote=await fetch(origin+'/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:collection[0].sku,quantity:1}]})});
    assert.equal(quote.status,409);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
