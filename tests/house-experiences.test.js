const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const sharp=require('sharp');
const {createApp}=require('../server');

test('studio ownership, catalog-grounded styling, try-on consent and private image handling',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-experiences-'));let calls=0,receivedImages=0;
  const ctx=createApp({dataDir:dir,seedProducts:[{id:'piece',designerId:'maker',title:'Velvet top',price:30,category:'apparel'}],designerTokens:{seller:'maker'},houseAiKey:'fixture',sendEmail:async()=>true,
    houseAiFetch:async(url,options)=>{calls++;if(url.endsWith('/images/edits')){receivedImages=options.body.getAll('image[]').length;return {ok:true,json:async()=>({data:[{b64_json:'dGVzdA=='}]})};}const body=JSON.parse(options.body);assert.equal(body.store,false);return {ok:true,json:async()=>({output_text:JSON.stringify({suggestions:[{listingId:'invented',idea:'Ignore this'},{listingId:'piece',idea:'Pair with gold earrings.'},{listingId:'piece',idea:'Duplicate'}],note:'Check fit notes.'})})};}});
  require('./helpers/ready-seller')(ctx.db,'maker');
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(route,body,token='seller',method='POST')=>fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  try{
    assert.equal((await request('/api/my/studio-story',{story:'Made at my kitchen table.'},null,'PUT')).status,401);
    assert.equal((await request('/api/my/studio-story',{story:'Made at my kitchen table.'},'seller','PUT')).status,200);
    assert.equal((await (await fetch(origin+'/api/designers/maker/studio')).json()).story,'Made at my kitchen table.');
    assert.equal((await request('/api/house/styling',{prompt:'Autumn party'},null)).status,401);
    assert.equal((await request('/api/house/styling',{prompt:'x'.repeat(501)})).status,422);assert.equal(calls,0);
    const styling=await (await request('/api/house/styling',{prompt:'Autumn party'})).json();assert.equal(styling.suggestions.length,1);assert.equal(styling.suggestions[0].item.id,'piece');assert.equal(calls,1);
    const image=await sharp({create:{width:8,height:8,channels:3,background:'#ffffff'}}).webp().toBuffer();fs.writeFileSync(path.join(dir,'images','fixture.webp'),image);
    ctx.db.prepare("INSERT INTO listing_images(id,listing_id,client_image_key,storage_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at) VALUES('photo','piece','photo','fixture.webp',0,'image/webp',?,8,8,'fixture','ready',?)").run(image.length,new Date().toISOString());
    const tryon=(consent,listingId='piece',buffer=image)=>{const body=new FormData();body.append('image',new Blob([buffer],{type:'image/webp'}),'photo.webp');body.append('consent',consent);body.append('listingId',listingId);return fetch(origin+'/api/house/try-on',{method:'POST',headers:{Authorization:'Bearer seller'},body});};
    assert.equal((await tryon('false')).status,422);assert.equal((await tryon('true','missing')).status,404);assert.equal((await tryon('true','piece',Buffer.from('invalid'))).status,422);assert.equal(calls,1);
    for(let i=0;i<3;i++){const result=await tryon('true');assert.equal(result.status,200);assert.match((await result.json()).image,/^data:image\/webp;base64,/);}
    assert.equal(receivedImages,2);assert.equal((await tryon('true')).status,429);assert.equal(calls,4);
    assert.deepEqual(fs.readdirSync(path.join(dir,'images')),['fixture.webp']);
    ctx.db.prepare("UPDATE listings SET status='draft' WHERE id='piece'").run();assert.equal((await tryon('true')).status,404);
  }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
