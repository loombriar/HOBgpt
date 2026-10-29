const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');const {createApp}=require('../server');
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-creative-')),mail=[];
 const options={dataDir:dir,seedProducts:[{id:'test-piece',designerId:'maker',title:'Test piece',price:20}],designerTokens:{seller:'maker'},adminToken:'admin-test',sendEmail:async m=>{mail.push(m);return true;}};
 let ctx=createApp(options),server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');let url='http://127.0.0.1:'+server.address().port;
 const call=async(route,method='GET',body,credential='',origin=url)=>{const response=await fetch(url+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(credential.startsWith('hob_')?{Cookie:credential}:credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text(),response};};
 const customer=async(email)=>{const r=await call('/api/customer/signin-code','POST',{email,name:'Creative',acceptedRules:true});assert.equal(r.status,202);const code=mail.at(-1).text.match(/\b(\d{6})\b/)[1];const v=await call('/api/customer/verify-code','POST',{requestId:r.body.requestId,code});assert.equal(v.status,200);return v.response.headers.get('set-cookie').split(';')[0];};
 return {get ctx(){return ctx},call,customer,restart:async()=>{await new Promise(r=>server.close(r));ctx.db.close();ctx=createApp(options);server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+server.address().port;},close:async()=>{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('creative profiles save, update without changing links, survive restart, and enforce publication and ownership',async()=>{
 const f=await fixture();try{const a=await f.customer('creative-a@example.test'),b=await f.customer('creative-b@example.test');
 const payload={display_name:'Same Name',role:'model',location:'Ohio',bio:'Original creative biography',specialties:'Runway, Editorial',published:true};
 assert.equal((await f.call('/api/creative-house/my-profile','PUT',payload)).status,401);
 assert.equal((await f.call('/api/creative-house/my-profile','PUT',payload,a,'https://evil.example')).status,403);
 const first=await f.call('/api/creative-house/my-profile','PUT',payload,a);assert.equal(first.status,200);const slug=first.body.profile.slug;
 const other=await f.call('/api/creative-house/my-profile','PUT',payload,b);assert.notEqual(other.body.profile.slug,slug);
 assert.equal((await f.call('/api/creative-house/profiles/'+slug)).status,401);
 assert.equal((await f.call('/api/creative-house/profiles/'+slug,'GET',undefined,b)).status,401);
 const publicProfile=await f.call('/api/creative-house/profiles/'+slug,'GET',undefined,'seller');assert.equal(publicProfile.status,200);assert.equal(publicProfile.body.profile.specialties,'Runway, Editorial');assert.ok(!JSON.stringify(publicProfile.body).includes('owner_subject'));
 const edit=await f.call('/api/creative-house/my-profile','PUT',{...payload,display_name:'Updated Name'},a);assert.equal(edit.body.profile.slug,slug);
 await f.restart();const restored=(await f.call('/api/creative-house/my-profile','GET',undefined,a)).body.profile;assert.equal(restored.display_name,'Updated Name');assert.equal(restored.specialties,'Runway, Editorial');
 await f.call('/api/creative-house/my-profile','PUT',{...payload,published:false},a);assert.equal((await f.call('/api/creative-house/profiles/'+slug,'GET',undefined,'seller')).status,404);
 assert.equal((await f.call('/api/creative-house/my-profile','PUT',{...payload,role:'admin'},a)).status,400);
 }finally{await f.close();}
});
test('event profiles and inquiries enforce recipient isolation, active designer access, and one-time responses',async()=>{
 const f=await fixture();try{const a=await f.customer('dj@example.test'),b=await f.customer('other@example.test');
 const profile=await f.call('/api/creative-house/my-event-profile','PUT',{display_name:'Test DJ',role:'dj',location:'Ohio',description:'Original music for independent fashion events.',published:true},a);assert.equal(profile.status,200);
 const slug=profile.body.profile.slug;assert.equal((await f.call('/api/creative-house/event-profiles/'+slug,'GET',undefined,'seller')).status,200);
 const body={recipient_kind:'event-partner',recipient_slug:slug,subject:'Fashion show',message:'Please join our independent fashion event as our music creative.'};
 assert.equal((await f.call('/api/creative-house/inquiries','POST',body,b)).status,401);
 assert.equal((await f.call('/api/creative-house/inquiries','POST',body,'seller')).status,201);
 const inbox=await f.call('/api/creative-house/my-inquiries','GET',undefined,a);assert.equal(inbox.body.inquiries.length,1);const id=inbox.body.inquiries[0].id;
 assert.deepEqual((await f.call('/api/creative-house/my-inquiries','GET',undefined,b)).body.inquiries,[]);
 assert.equal((await f.call('/api/creative-house/my-inquiries/'+id+'/respond','POST',{status:'accepted'},b)).status,404);
 assert.equal((await f.call('/api/creative-house/my-inquiries/'+id+'/respond','POST',{status:'accepted'},a)).status,200);
 assert.equal((await f.call('/api/creative-house/my-inquiries/'+id+'/respond','POST',{status:'declined'},a)).status,404);
 assert.equal((await f.call('/api/creative-house/sent-inquiries','GET',undefined,'seller')).body.inquiries[0].status,'accepted');
 f.ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();assert.equal((await f.call('/api/creative-house/inquiries','POST',body,'seller')).status,403);
 }finally{await f.close();}
});
test('creative backend assets load and account deletion clears published profiles and protects private correspondence',async()=>{
 const f=await fixture();try{const a=await f.customer('deleting@example.test');
 for(const route of ['/creative-access.js','/creative-house-workflows.js']){const r=await f.call(route);assert.equal(r.status,200);}
 const p=await f.call('/api/creative-house/my-profile','PUT',{display_name:'Deleting Creative',role:'model',published:true},a);assert.equal(p.status,200);
 await f.call('/api/creative-house/my-event-profile','PUT',{display_name:'Deleting DJ',role:'dj',location:'Ohio',description:'Creative description longer than twenty characters.',published:true},a);
 await f.call('/api/creative-house/inquiries','POST',{recipient_kind:'talent',recipient_slug:p.body.profile.slug,subject:'Test project',message:'This private inquiry belongs to the deleting customer.'},'seller');
 assert.equal((await f.call('/api/customer/account','DELETE',{confirmation:'DELETE'},a)).status,409);
 assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM creative_profiles').get().n,1);
 f.ctx.db.prepare('DELETE FROM creative_inquiries').run();
 assert.equal((await f.call('/api/customer/account','DELETE',{confirmation:'DELETE'},a)).status,200);
 assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM creative_profiles').get().n,0);
 assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM creative_event_profiles').get().n,0);
 assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM creative_inquiries').get().n,0);
 assert.equal((await f.call('/api/creative-house/profiles/'+p.body.profile.slug,'GET',undefined,'seller')).status,404);
 }finally{await f.close();}
});
test('event and casting actions persist, close correctly, and hide suspended designers',async()=>{
 const f=await fixture();try{
 const event={title:'Test runway event',event_type:'fashion-show',location:'Ohio',event_date:'2026-11-01',description:'An isolated fashion show fixture for backend verification.',roles:['model','dj'],compensation:'paid'};
 assert.equal((await f.call('/api/creative-house/events','POST',event)).status,401);
 const created=await f.call('/api/creative-house/events','POST',event,'seller');assert.equal(created.status,201);
 assert.equal((await f.call('/api/creative-house/events')).body.events[0].id,created.body.id);
 const casting=await f.call('/api/creative-house/opportunities','POST',{title:'Test casting call',role:'both',location:'Ohio',description:'An isolated casting call for backend testing.',compensation:'negotiable'},'seller');assert.equal(casting.status,201);
 f.ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();
 assert.deepEqual((await f.call('/api/creative-house/events')).body.events,[]);assert.deepEqual((await f.call('/api/creative-house/opportunities')).body.opportunities,[]);
 assert.equal((await f.call('/api/creative-house/events','POST',event,'seller')).status,403);
 f.ctx.db.prepare("UPDATE designer_profiles SET status='active' WHERE id='maker'").run();
 assert.equal((await f.call('/api/creative-house/events/'+created.body.id+'/close','POST',{},'seller')).status,200);
 assert.equal((await f.call('/api/creative-house/opportunities/'+casting.body.id+'/close','POST',{},'seller')).status,200);
 assert.deepEqual((await f.call('/api/creative-house/events')).body.events,[]);assert.deepEqual((await f.call('/api/creative-house/opportunities')).body.opportunities,[]);
 }finally{await f.close();}
});
test('project requests reach an admin-only review queue and retain their reviewed status',async()=>{
 const f=await fixture();try{
 const payload={kind:'commission-designer',contact_name:'Test Creative',contact_email:'request@example.test',title:'Original garment request',description:'An original garment request used only in isolated backend tests.'};
 assert.equal((await f.call('/api/creative-house/project-requests','POST',{...payload,contact_email:'invalid'})).status,400);
 assert.equal((await f.call('/api/creative-house/project-requests','POST',payload)).status,201);
 assert.equal((await f.call('/api/admin/creative-project-requests')).status,401);
 assert.equal((await f.call('/api/admin/creative-project-requests','GET',undefined,'seller')).status,403);
 const queue=await f.call('/api/admin/creative-project-requests','GET',undefined,'admin-test');assert.equal(queue.status,200);assert.equal(queue.body.requests.length,1);
 const id=queue.body.requests[0].id;assert.equal(queue.body.requests[0].contact_email,payload.contact_email);
 assert.equal((await f.call('/api/admin/creative-project-requests/'+id,'PATCH',{status:'reviewed'},'seller')).status,403);
 assert.equal((await f.call('/api/admin/creative-project-requests/'+id,'PATCH',{status:'invalid'},'admin-test')).status,400);
 assert.equal((await f.call('/api/admin/creative-project-requests/'+id,'PATCH',{status:'reviewed'},'admin-test')).status,200);
 await f.restart();assert.equal((await f.call('/api/admin/creative-project-requests','GET',undefined,'admin-test')).body.requests[0].status,'reviewed');
 }finally{await f.close();}
});

test('creative specialties migrate old profiles and remain private across legacy saves',async()=>{
 const f=await fixture();try{
  f.ctx.db.exec('ALTER TABLE creative_profiles DROP COLUMN specialties');await f.restart();
  const account=await f.customer('specialty-model@example.test');
  const profile={display_name:'Editorial model',role:'model',bio:'Independent editorial work',location:'Ohio',published:true};
  await f.call('/api/creative-house/my-profile','PUT',{...profile,specialties:'Runway, Editorial'},account);
  await f.call('/api/creative-house/my-profile','PUT',profile,account);
  const own=await f.call('/api/creative-house/my-profile','GET',undefined,account);assert.equal(own.body.profile.specialties,'Runway, Editorial');
  assert.equal((await f.call('/api/creative-house/profiles','GET',undefined,account)).status,401);
  const designers=await f.call('/api/creative-house/profiles','GET',undefined,'seller');assert.equal(designers.body.profiles[0].specialties,'Runway, Editorial');
 }finally{await f.close();}
});

test('networking preferences include wedding attire and repairs and survive edits without exposing account identities',async()=>{
 const f=await fixture();try{
  const owner=await f.customer('network@example.test');
  const profile={display_name:'Wedding Studio',role:'designer',location:'Ohio',bio:'Wedding attire, repair and alteration collaboration.',published:true,openTo:['wedding-attire','repairs-alterations','paid-work']};
  const saved=await f.call('/api/creative-house/my-profile','PUT',profile,owner);assert.equal(saved.status,200);
  const slug=saved.body.profile.slug;
  let data=await f.call('/api/creative-house/profiles/'+slug,'GET',undefined,'seller');assert.deepEqual(data.body.profile.openTo,profile.openTo);assert.ok(!JSON.stringify(data.body).includes('owner_subject'));assert.ok(!JSON.stringify(data.body).includes('network@example.test'));
  assert.equal((await f.call('/api/creative-house/my-profile','PUT',{...profile,openTo:['invalid']},owner)).status,422);
  const {openTo,...legacy}=profile;await f.call('/api/creative-house/my-profile','PUT',legacy,owner);
  await f.restart();data=await f.call('/api/creative-house/my-profile','GET',undefined,owner);assert.deepEqual(data.body.profile.openTo,openTo);
  await f.call('/api/creative-house/my-profile','PUT',{...profile,openTo:[]},owner);assert.deepEqual((await f.call('/api/creative-house/profiles/'+slug,'GET',undefined,'seller')).body.profile.openTo,[]);
 }finally{await f.close();}
});
test('wedding and repair briefs are validated, isolated, reportable and blocked at the server',async()=>{
 const f=await fixture();try{
  const owner=await f.customer('network-recipient@example.test'),other=await f.customer('network-other@example.test');
  const p=await f.call('/api/creative-house/my-profile','PUT',{display_name:'Alterations Studio',role:'designer',published:true},owner);
  const brief={recipient_kind:'talent',recipient_slug:p.body.profile.slug,subject:'Wedding attire collaboration',message:'Looking for a collaborator for wedding party alterations.',projectType:'wedding-attire',compensation:'paid',budget:'$400 total',projectLocation:'Columbus, Ohio',startDate:'2027-06-01',endDate:'2027-06-10'};
  for(const change of [{budget:''},{startDate:'2027-02-30'},{endDate:'2027-05-01'},{projectType:'invalid'},{compensation:'exposure'}])assert.equal((await f.call('/api/creative-house/inquiries','POST',{...brief,...change},'seller')).status,422);
  assert.equal(f.ctx.db.prepare('SELECT COUNT(*) n FROM creative_inquiries').get().n,0);
  assert.equal((await f.call('/api/creative-house/inquiries','POST',brief,'seller')).status,201);
  const inbox=await f.call('/api/creative-house/my-inquiries','GET',undefined,owner);assert.equal(inbox.response.headers.get('cache-control'),'no-store');const item=inbox.body.inquiries[0];assert.equal(JSON.parse(item.collaboration_json).budget,'$400 total');assert.ok(item.sender_name);assert.ok(!JSON.stringify(inbox.body).includes('network-recipient@example.test'));
  const route='/api/creative-house/my-inquiries/'+item.id;
  assert.equal((await f.call(route+'/block','POST',{},other)).status,404);
  assert.equal((await f.call(route+'/report','POST',{reason:'Unwanted request'},other)).status,404);
  assert.equal((await f.call(route+'/block','POST',{},owner,'https://evil.example')).status,403);
  assert.equal((await f.call(route+'/report','POST',{reason:'Unwanted request'},owner)).status,200);
  assert.equal((await f.call(route+'/report','POST',{reason:'Unwanted request'},owner)).status,200);
  assert.equal(f.ctx.db.prepare("SELECT COUNT(*) n FROM support_messages WHERE category='creative_safety'").get().n,1);
  assert.equal((await f.call(route+'/block','POST',{},owner)).status,200);
  assert.equal((await f.call('/api/creative-house/inquiries','POST',brief,'seller')).status,404);
  assert.equal((await f.call(route+'/unblock','POST',{},owner)).status,200);
  assert.equal((await f.call('/api/creative-house/inquiries','POST',{...brief,projectType:'repairs-alterations'},'seller')).status,201);
 }finally{await f.close();}
});
