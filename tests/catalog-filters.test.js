const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

test('catalog backend composes category filters, sorts and protects unpublished pieces', async () => {
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'briar-filter-'));
  const fixtures=[{id:'dress',designerId:'maker-a',category:'apparel',title:'Floral dress',price:300},{id:'top',designerId:'maker-b',category:'apparel',title:'Velvet top',price:100},{id:'bag',designerId:'maker-a',category:'accessories',title:'Floral bag',price:200},{id:'costume',designerId:'maker-a',category:'costumes',title:'Fairy costume',price:150},{id:'hidden',designerId:'maker-a',category:'apparel',title:'Private draft',price:1}];
  const context=createApp({dataDir,seedProducts:fixtures});
  require('./helpers/ready-seller')(context.db,'maker-a');
  require('./helpers/ready-seller')(context.db,'maker-b');
  context.db.prepare("UPDATE listings SET style='Dress',pattern='Floral',aesthetic='Boho' WHERE id='dress'").run();
  context.db.prepare("UPDATE listings SET style='Top',pattern='Solid' WHERE id='top'").run();
  context.db.prepare("UPDATE listings SET style='Purse / Bag',pattern='Floral' WHERE id='bag'").run();
  context.db.prepare("UPDATE listings SET style='Costume' WHERE id='costume'").run();
  context.db.prepare("UPDATE listings SET status='draft' WHERE id='hidden'").run();
  const server=context.app.listen(0,'127.0.0.1'); await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}`;
  const ids=async query=>(await (await fetch(url+'/api/gallery'+query)).json()).items.map(x=>x.id);
  try {
    assert.deepEqual(await ids('?style=Dress&pattern=Floral&aesthetic=boho&designer=maker-a'),['dress']);
    assert.deepEqual(await ids('?category=accessories'),['bag']);
    assert.deepEqual(await ids('?style=Costume'),['costume']);
    assert.deepEqual(await ids('?category=apparel&sort=low'),['top','dress']);
    assert.deepEqual(await ids('?pattern=Floral&sort=high'),['dress','bag']);
    assert.deepEqual(await ids('?q=velvet'),['top']);
    assert.deepEqual(await ids('?designer=maker-b'),['top']);
    assert.deepEqual(await ids('?designer=unknown'),[]);
    assert.equal((await fetch(url+'/api/gallery?sort=oops')).status,400);
    assert.equal((await fetch(url+'/api/gallery?style=Dress&style=Top')).status,400);
    assert.equal((await fetch(url+'/api/gallery?designer='+encodeURIComponent("' OR 1=1 --"))).status,200);
    assert.deepEqual(await ids('?designer='+encodeURIComponent("' OR 1=1 --")),[]);
    context.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker-a'").run();
    assert.deepEqual(await ids('?designer=maker-a'),[]);
  } finally {await new Promise(resolve=>server.close(resolve));context.db.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
