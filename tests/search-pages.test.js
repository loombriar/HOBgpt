const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
const {renderSearchPage}=require('../lib/search-pages');

test('search HTML escapes public text and replaces metadata without hiding content',()=>{
 const html=renderSearchPage('<head><title>Old</title><meta name="description" content="old"></head><div id="root"></div>',{title:'Label <script>',description:'"Quoted" & original',url:'https://houseofbriar.shop/shop',body:'<p>Public collection</p>'});
 assert.ok(html.includes('Label &lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.equal((html.match(/name="description"/g)||[]).length,1);
 assert.ok(html.includes('<div id="root"><header>'));
 assert.ok(html.includes('<p>Public collection</p>'));
});

test('public routes include crawlable content, canonical URLs and sitemap entry, excluding private data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-search-'));
 const root=path.join(dir,'site'),dist=path.join(root,'apps/default/dist');fs.mkdirSync(dist,{recursive:true});
 fs.writeFileSync(path.join(dist,'index.html'),'<html><head><title>House of Briar</title><meta name="description" content="generic"></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>');
 const ctx=createApp({rootDir:root,dataDir:path.join(dir,'data'),seedProducts:[],designerTokens:{}});
 ctx.db.prepare("INSERT INTO designer_profiles(id,email,display_name,brand_name,bio,status,created_at) VALUES(?,?,?,?,?,?,?)").run('public-label','private@example.com','Public Label','Public & Original','Handmade <clothing>','active',new Date().toISOString());
 ctx.db.prepare("INSERT INTO designer_profiles(id,email,display_name,brand_name,status,created_at) VALUES(?,?,?,?,?,?)").run('suspended-label','suspended@example.com','Suspended','Suspended','suspended',new Date().toISOString());
 ctx.db.prepare("INSERT INTO listings(id,designer_id,title,description,price,category,status,moderation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run('draft','public-label','SECRET DRAFT','Private design',30,'Tops','draft','pending',new Date().toISOString(),new Date().toISOString());
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const [route,text] of [['/shop','Shop independent fashion'],['/designers','Public &amp; Original'],['/designers/public-label','Handmade &lt;clothing&gt;'],['/atelier-emine','Perla Elara']]){
   const r=await fetch(origin+route),html=await r.text();assert.equal(r.status,200,route);assert.ok(html.includes(text),route);assert.match(html,/<link rel="canonical"/);assert.ok(!html.includes('SECRET DRAFT'));assert.ok(!html.includes('private@example.com'));assert.ok(!html.includes('Suspended'));assert.ok(html.includes('<script src="/assets/app.js"></script>'));
  }
  const sitemap=await (await fetch(origin+'/sitemap.xml')).text();assert.ok(sitemap.includes('/atelier-emine</loc>'));assert.ok(!sitemap.includes('suspended-label'));assert.ok(!sitemap.includes('/shop/draft'));
  assert.equal((await fetch(origin+'/designers/suspended-label')).status,404);
  assert.equal((await fetch(origin+'/designers/missing')).status,404);
 }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
