const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

test('collection URLs have distinct share metadata and reject unknown names',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-collections-'));
  const ctx=createApp({dataDir:dir,seedProducts:[],sendEmail:async()=>true});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [slug,title] of [['autumn-atelier','The Autumn Atelier'],['winter-briar','Winter Briar'],['garden-party','The Garden Party'],['independent-by-design','Independent by Design']]){
      const response=await fetch(origin+'/collections/'+slug);assert.equal(response.status,200);
      const html=await response.text();assert.ok(html.includes(`<title>${title} | House of Briar</title>`));
      assert.ok(html.includes(`href="https://houseofbriar.shop/collections/${slug}"`));assert.ok(html.includes('id="house-editorial-pieces"'));
      assert.match(html, /<script src="\/atelier\.js\?v=[^"]+" defer><\/script>/);
    }
    assert.equal((await fetch(origin+'/collections/unknown')).status,404);
    for(const asset of ['atelier.js','atelier.css']){const response=await fetch(origin+'/'+asset);assert.equal(response.status,200);assert.ok((await response.text()).length>100);}
  }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
