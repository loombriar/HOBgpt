const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const taxonomy=require('../shared/taxonomy.json');
test('shared availability values save and presentation composes with department and type',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-taxonomy-'));
 const ctx=createApp({dataDir:dir,designerTokens:{seller:'maker'},seedProducts:[{id:'seed',designerId:'maker',title:'Seed',price:10,category:'apparel'}]});
 require('./helpers/ready-seller')(ctx.db,'maker');
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const choice of taxonomy.availability){
   const response=await fetch(origin+'/api/listings',{method:'POST',headers:{Authorization:'Bearer seller','Content-Type':'application/json'},body:JSON.stringify({title:choice.label,description:'An original piece',price:30,category:'apparel',style:'Dress',presentation:'menswear',productionType:choice.value})});
   assert.equal(response.status,201,JSON.stringify(await response.clone().json()));const {item}=await response.json();assert.equal(item.presentation,'menswear');assert.equal(item.productionType,choice.value);
   ctx.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(item.id);
  }
  const items=await (await fetch(origin+'/api/gallery?category=apparel&style=Dress&presentation=menswear&productionType=Upcycled')).json();
  assert.equal(items.items.length,1);assert.equal(items.items[0].productionType,'Upcycled');
  const invalid=await fetch(origin+'/api/gallery?presentation=unknown');assert.equal(invalid.status,400);
  const script=await fetch(origin+'/house-taxonomy.js');assert.equal(script.status,200);assert.match(await script.text(),/Hair Accessories/);
 }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
