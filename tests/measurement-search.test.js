const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('measurement ranges persist and search excludes missing or mismatched fit data', async () => {
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'briar-fit-'));
 const instance=createApp({dataDir,seedProducts:[],designerTokens:{'fit-token':'fit-maker'}});
 const server=instance.app.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(route,body,method='POST')=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer fit-token'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const listing={title:'Fit dress',price:100,category:'apparel',style:'Dress',fitMeasurements:{bust:{min:34,max:36},waist:{min:30,max:34}}};
 try {
  const created=await request('/api/listings',listing);assert.equal(created.status,201);const id=created.body.item.id;
  assert.deepEqual(created.body.item.fitMeasurements,listing.fitMeasurements);
  instance.db.prepare("UPDATE listings SET status='published',moderation_status='approved' WHERE id=?").run(id);
  const search=async measurements=>request('/api/gallery/search',{filters:{style:'Dress'},measurements});
  assert.deepEqual((await search({bust:34,waist:34})).body.items.map(x=>x.id),[id]);
  assert.equal((await search({bust:36.1})).body.items.length,0);
  assert.equal((await search({bust:35,hips:40})).body.items.length,0);
  assert.equal((await request('/api/gallery/search',{filters:{}})).status,400);
  assert.equal((await fetch(base+'/api/gallery/search',{method:'POST',body:JSON.stringify({measurements:{bust:35}})})).status,400);
  assert.equal((await search({})).status,400);
  assert.equal((await search({bust:'35'})).status,400);
  assert.equal((await search({bust:-1})).status,400);
  const preserved=await request('/api/listings/'+id,{title:'Fit dress',price:100,category:'apparel'},'PUT');
  assert.deepEqual(preserved.body.item.fitMeasurements,listing.fitMeasurements);
  const invalid=await request('/api/listings/'+id,{...listing,fitMeasurements:{bust:{min:36,max:34}}},'PUT');assert.equal(invalid.status,422);
  const edited=await request('/api/listings/'+id,{...listing,fitMeasurements:{bust:{min:40,max:42}}},'PUT');assert.equal(edited.status,200);
  assert.equal((await search({bust:35})).body.items.length,0);
  assert.equal((await search({bust:41})).body.items.length,1);
  const clear=await request('/api/listings/'+id,{...listing,fitMeasurements:{}},'PUT');assert.deepEqual(clear.body.item.fitMeasurements,{});
  assert.equal((await search({bust:41})).body.items.length,0);
  instance.db.prepare('UPDATE listings SET fit_measurements=? WHERE id=?').run(JSON.stringify(listing.fitMeasurements),id);
  instance.db.prepare("UPDATE listings SET status='draft' WHERE id=?").run(id);
  assert.equal((await search({bust:35})).body.items.length,0);
 } finally {await new Promise(resolve=>server.close(resolve));instance.db.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
