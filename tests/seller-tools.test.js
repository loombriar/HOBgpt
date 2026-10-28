const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');const {once}=require('node:events');const {createApp}=require('../server');
async function fixture(run,extra={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-seller-tools-'));const calls=[];const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'a',title:'Original title',price:50}],designerTokens:{seller:'a'},houseAiKey:'test-only-provider-key',houseAiFetch:async(url,request)=>{calls.push({url,request});return{ok:true,json:async()=>({output_text:JSON.stringify({description:'A skirt with the seller’s stated botanical print.',tags:['botanical skirt','boho'],aesthetic:'Boho',reviewNotes:['Confirm material composition before saving.']})})};},...extra});const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const call=async(body,token='seller')=>{const response=await fetch(origin+'/api/my/studio/assistant',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
try{await run({ctx,calls,call,origin});}finally{await new Promise(resolve=>server.close(resolve));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}}
const facts={consent:true,title:'Botanical skirt',description:'Botanical print, elastic waist.',category:'handmade',style:'Skirt',productionType:'One of a Kind'};
test('seller suggestions require consent, bounded facts and authentication, and never save listings',async()=>fixture(async({ctx,calls,call})=>{
 assert.equal((await call(facts,'')).status,401);assert.equal((await call({...facts,consent:false})).status,422);assert.equal((await call({...facts,title:'x'.repeat(121)})).status,422);assert.equal((await call({...facts,title:''})).status,422);assert.equal(calls.length,0);
 const result=await call(facts);assert.equal(result.status,200);assert.equal(result.body.draftOnly,true);assert.equal(result.body.aesthetic,'Boho');assert.deepEqual(result.body.tags,['botanical skirt','boho']);const request=JSON.parse(calls[0].request.body);assert.equal(request.store,false);assert.equal(request.text.format.type,'json_schema');assert.equal(request.text.format.strict,true);assert.equal(request.max_output_tokens,1100);assert.equal(ctx.db.prepare("SELECT title FROM listings WHERE id='piece'").get().title,'Original title');
 for(let i=1;i<10;i++)assert.equal((await call(facts)).status,200);assert.equal((await call(facts)).status,429);assert.equal(calls.length,10);
}));
test('provider failures and invalid classification are sanitized without altering a listing',async()=>fixture(async({call})=>{const result=await call(facts);assert.equal(result.status,502);assert.equal(JSON.stringify(result.body).includes('secret-provider-error'),false);},{houseAiFetch:async()=>{throw Error('secret-provider-error');}}));
test('invalid generated output cannot bypass aesthetic or tag limits',async()=>fixture(async({call})=>{assert.equal((await call(facts)).status,502);},{houseAiFetch:async()=>({ok:true,json:async()=>({output_text:JSON.stringify({description:'Draft',tags:['x'.repeat(41)],aesthetic:'Unapproved',reviewNotes:[]})})})}));
test('photo clarity preview validates decoded bytes, preserves dimensions and does not store or replace originals',async()=>fixture(async({ctx,origin})=>{
 const original=await sharp({create:{width:800,height:600,channels:3,background:'#a3b8a7'}}).png().toBuffer();
 async function enhance(bytes,type='image/png',token='seller'){const body=new FormData();body.append('image',new Blob([bytes],{type}),'piece.png');return fetch(origin+'/api/my/studio/photo-enhance',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body});}
 assert.equal((await enhance(original,'image/png','')).status,401);assert.equal((await enhance(Buffer.from('not an image'))).status,422);
 const response=await enhance(original);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/webp/);assert.equal(response.headers.get('cache-control'),'no-store');const image=Buffer.from(await response.arrayBuffer()),metadata=await sharp(image).metadata();assert.equal(metadata.width,800);assert.equal(metadata.height,600);assert.equal(metadata.format,'webp');assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM listing_images').get().n,0);assert.equal(ctx.db.prepare("SELECT title FROM listings WHERE id='piece'").get().title,'Original title');
}));
test('photo autofill uses real departments and matching item types, including print and aesthetic',async()=>{
 let photoRequest;
 const suggestion={title:'Striped bag',category:'accessories',style:'Purse / Bag',pattern:'Stripes',description:'A bag with visible stripes.',tags:['striped bag'],aesthetic:'Vintage / Retro',reviewNotes:['Confirm materials.']};
 await fixture(async({ctx,origin,calls})=>{
  const image=await sharp({create:{width:32,height:32,channels:3,background:'#ab4567'}}).png().toBuffer();
  async function analyze(){const body=new FormData();body.append('image',new Blob([image],{type:'image/png'}),'bag.png');body.append('consent','true');return fetch(origin+'/api/my/studio/photo-listing',{method:'POST',headers:{Authorization:'Bearer seller'},body});}
  const response=await analyze();assert.equal(response.status,200);const result=await response.json();assert.equal(result.pattern,'Stripes');assert.equal(result.aesthetic,'Vintage / Retro');assert.equal(result.draftOnly,true);
  const schema=JSON.parse(photoRequest.body).text.format.schema;assert.ok(schema.properties.category.enum.includes('accessories'));assert.ok(schema.properties.style.enum.includes('Purse / Bag'));
  suggestion.category='apparel';assert.equal((await analyze()).status,502);
  assert.equal(ctx.db.prepare("SELECT title FROM listings WHERE id='piece'").get().title,'Original title');
 },{houseAiFetch:async(url,request)=>{photoRequest=request;return {ok:true,json:async()=>({output_text:JSON.stringify(suggestion)})};}});
});
test('photo size is an explicit editable suggestion and is bounded to supported sizes',async()=>{
 let requestBody;let size='L';
 await fixture(async({origin})=>{
 const image=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer();
 const analyze=async()=>{const body=new FormData();body.append('image',new Blob([image],{type:'image/png'}),'dress.png');body.append('consent','true');body.append('title','Large dress');return fetch(origin+'/api/my/studio/photo-listing',{method:'POST',headers:{Authorization:'Bearer seller'},body});};
 const response=await analyze();assert.equal(response.status,200);assert.equal((await response.json()).size,'L');const schema=requestBody.text.format.schema;assert.ok(schema.required.includes('size'));assert.ok(schema.properties.size.enum.includes(''));
 assert.match(requestBody.input[0].content,/never infer size from body shape/);
 size='unsupported';assert.equal((await analyze()).status,502);
 },{houseAiFetch:async(url,request)=>{requestBody=JSON.parse(request.body);return {ok:true,json:async()=>({output_text:JSON.stringify({title:'Large dress',category:'apparel',style:'Dress',pattern:'',description:'A dress.',tags:['dress'],aesthetic:'Other',reviewNotes:[],size})})};}});
});
