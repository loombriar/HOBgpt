const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {once}=require('node:events');const sharp=require('sharp');
const {createApp}=require('../server');
async function fixture(run){
 const mail=[],dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-projects-')),realFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;let review={allow:true,needsHumanReview:false},reviewCalls=0;
 process.env.OPENAI_API_KEY='fixture-key';global.fetch=async(url,options)=>String(url)==='https://api.openai.com/v1/responses'?(reviewCalls++,new Response(JSON.stringify({output_text:JSON.stringify(review)}),{status:review?200:503})):realFetch(url,options);
 const ctx=createApp({dataDir:dir,designerTokens:{maker:'maker'},seedProducts:[{id:'seed',designerId:'maker',title:'Fixture',price:20}],resolveIdentity:async({token})=>['owner','other','sewer','second'].includes(token)?{sub:token,email:token+'@example.test',email_verified:true}:null,sendEmail:async message=>{mail.push(message);return true;}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const call=(url,body,token='owner',method=body?'POST':'GET',origin=base)=>fetch(base+url,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const image=await sharp({create:{width:90,height:120,channels:3,background:'#ffccbb'}}).png().toBuffer();
 const upload=async(id,token='owner',consent=true,bytes=image)=>{const form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'sketch.png');if(consent)form.append('consent','true');return fetch(base+`/api/my/design-projects/${id}/images`,{method:'POST',headers:{Origin:base,Authorization:'Bearer '+token},body:form});};
 const create=async()=>{const r=await call('/api/my/design-projects',{title:'My original dress',displayName:'Sketch Artist',details:'A dress based on my original drawing with a fitted bodice and full skirt.',budget:'$200–$350',sizeNotes:'Size M',visibility:'makers'});assert.equal(r.status,201,await r.clone().text());return(await r.json()).project;};
 try{await run({ctx,base,mail,call,upload,create,setReview:v=>{review=v;},reviews:()=>reviewCalls});}finally{global.fetch=realFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('designs start private, image access follows sharing and maker authorization, and hide revokes access',()=>fixture(async f=>{
 assert.equal((await f.call('/api/my/design-projects',null,'')).status,401);
 const project=await f.create();assert.equal(project.visibility,'private');
 assert.equal((await f.call('/api/my/design-projects/'+project.id,{visibility:'makers'},'other','PATCH')).status,404);
 assert.equal((await f.call('/api/my/design-projects/'+project.id,{visibility:'makers'},'owner','PATCH')).status,422);
 const uploaded=await f.upload(project.id);assert.equal(uploaded.status,201,await uploaded.clone().text());const image=(await uploaded.json()).image;
 assert.equal((await f.call(image.url,null,'maker')).status,404);assert.equal((await f.call(image.url)).status,200);
 assert.equal((await f.call('/api/design-projects',null,'other')).status,403);
 const session=await f.call('/api/session',{},'maker');const cookie=session.headers.get('set-cookie').split(';')[0];
 const forged=await fetch(f.base+'/api/my/design-projects/'+project.id,{method:'PATCH',headers:{Cookie:cookie,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({visibility:'makers'})});assert.equal(forged.status,403);
 assert.equal((await f.call('/api/my/design-projects/'+project.id,{visibility:'makers'},'owner','PATCH')).status,200);
 const board=await f.call('/api/design-projects',null,'maker');assert.equal(board.headers.get('cache-control'),'no-store');const text=await board.text();assert.ok(text.includes('My original dress'));assert.ok(!text.includes('owner@example.test'));assert.ok(!text.includes('owner_subject'));
 const media=await f.call(image.url,null,'maker');assert.equal(media.status,200);assert.equal(media.headers.get('cache-control'),'no-store');
 assert.equal((await f.call(image.url,null,'other')).status,404);
 await f.call('/api/my/design-projects/'+project.id,{visibility:'private'},'owner','PATCH');assert.equal((await f.call(image.url,null,'maker')).status,404);
 assert.equal((await f.call('/api/my/design-projects/'+project.id,null,'other','DELETE')).status,404);
 assert.equal((await f.call('/api/my/design-projects/'+project.id,null,'owner','DELETE')).status,200);assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM design_project_images').get().n,0);
}));
test('seamstresses opt into custom construction; acceptance alone shares contacts with the chosen maker',()=>fixture(async f=>{
 const p=await f.create();await f.upload(p.id);await f.call('/api/my/design-projects/'+p.id,{visibility:'makers'},'owner','PATCH');
 const profile={displayName:'Custom Sewing Studio',location:'Columbus',bio:'I turn original fashion drawings into carefully fitted garments.',services:['custom-construction'],modes:['designer-work'],published:false};
 assert.equal((await f.call('/api/my/sewing-services',profile,'sewer','PUT')).status,200);assert.equal((await f.call('/api/design-projects',null,'sewer')).status,403);
 await f.call('/api/my/sewing-services',{...profile,published:true},'sewer','PUT');assert.equal((await f.call('/api/design-projects',null,'sewer')).status,200);
 const note={note:'I can draft the pattern and make a sample. We can discuss fabrics and timing.'};
 const response=await f.call('/api/design-projects/'+p.id+'/offers',note,'sewer');assert.equal(response.status,201,await response.clone().text());const offer=(await response.json()).id;
 assert.equal((await f.call('/api/design-projects/'+p.id+'/offers',note,'sewer')).status,409);
 const myOffers=await(await f.call('/api/my/design-projects',null,'sewer')).json();assert.ok(!JSON.stringify(myOffers).includes('owner@example.test'));
 const ownerBefore=await(await f.call('/api/my/design-projects')).json();assert.ok(!JSON.stringify(ownerBefore).includes('sewer@example.test'));
 assert.equal((await f.call(`/api/my/design-projects/${p.id}/offers/${offer}`,{status:'accepted'},'other','PATCH')).status,404);
 assert.equal((await f.call(`/api/my/design-projects/${p.id}/offers/${offer}`,{status:'accepted'},'owner','PATCH')).status,200);
 const owner=await(await f.call('/api/my/design-projects')).json();assert.equal(owner.projects[0].offers[0].contactEmail,'sewer@example.test');assert.equal(owner.projects[0].visibility,'private');
 const maker=await(await f.call('/api/my/design-projects',null,'sewer')).json();assert.equal(maker.offers[0].contactEmail,'owner@example.test');assert.equal(maker.offers[0].project.id,p.id);
 assert.equal((await f.call(maker.offers[0].project.images[0].url,null,'sewer')).status,200);
 assert.equal((await f.call(maker.offers[0].project.images[0].url,null,'maker')).status,404);
}));
test('uploads require ownership, consent, valid still images and passing safety review; images are bounded',()=>fixture(async f=>{
 const p=await f.create();assert.equal((await f.upload(p.id,'other')).status,404);
 assert.equal((await f.upload(p.id,'owner',false)).status,422);assert.equal(f.reviews(),0);
 assert.equal((await f.upload(p.id,'owner',true,Buffer.from('not an image'))).status,422);
 f.setReview({allow:false,needsHumanReview:true});assert.equal((await f.upload(p.id)).status,422);assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM design_project_images').get().n,0);
 f.setReview(null);assert.equal((await f.upload(p.id)).status,503);assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM design_project_images').get().n,0);
 f.setReview({allow:true,needsHumanReview:false});for(let i=0;i<3;i++)assert.equal((await f.upload(p.id)).status,201);assert.equal((await f.upload(p.id)).status,422);
 const row=f.ctx.db.prepare('SELECT image FROM design_project_images LIMIT 1').get(),meta=await sharp(row.image).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
 const images=(await(await f.call('/api/my/design-projects')).json()).projects[0].images;
 await f.call('/api/my/design-projects/'+p.id,{visibility:'makers'},'owner','PATCH');
 for(const image of images)assert.equal((await f.call(`/api/my/design-projects/${p.id}/images/${image.id}`,null,'owner','DELETE')).status,200);
 assert.equal((await(await f.call('/api/my/design-projects')).json()).projects[0].visibility,'private');
}));

test('deleting a customer account removes its private projects and drawing bytes, without erasing another owner',()=>fixture(async f=>{
 const untouched=await f.create();
 const response=await f.call('/api/customer/signin-code',{email:'delete-sketch@example.test',name:'Sketcher',acceptedRules:true},'');assert.equal(response.status,202);const {requestId}=await response.json();const code=f.mail.at(-1).text.match(/\b(\d{6})\b/)[1];
 const verified=await f.call('/api/customer/verify-code',{requestId,code},'');assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie').split(';')[0];
 const created=await fetch(f.base+'/api/my/design-projects',{method:'POST',headers:{Origin:f.base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({title:'Private sketch',displayName:'Sketcher',details:'An original design for a fitted jacket with embroidered panels.'})});assert.equal(created.status,201);const project=(await created.json()).project;
 f.ctx.db.prepare('INSERT INTO design_project_images VALUES(?,?,?)').run('delete-image',project.id,Buffer.from('private drawing bytes'));
 const deleted=await fetch(f.base+'/api/customer/account',{method:'DELETE',headers:{Origin:f.base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});assert.equal(deleted.status,200,await deleted.clone().text());
 assert.equal(f.ctx.db.prepare('SELECT 1 FROM design_project_images WHERE project_id=?').get(project.id),undefined);assert.equal(f.ctx.db.prepare('SELECT 1 FROM design_projects WHERE id=?').get(project.id),undefined);assert.ok(f.ctx.db.prepare('SELECT 1 FROM design_projects WHERE id=?').get(untouched.id));
}));
