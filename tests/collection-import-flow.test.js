const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');
test('catalog upload, private review, ownership, draft conversion and retry work through HTTP',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-catalog-flow-'));
 const ctx=createApp({dataDir:dir,designerTokens:{makerToken:'maker',otherToken:'other'}});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const request=(route,{token='makerToken',body,method='POST',headers={}}={})=>fetch(origin+route,{method,headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 try{
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >>\nstream\nBT (Summer Dress) Tj ET\nendstream\n%%EOF');
  const form=new FormData();form.append('catalog',new Blob([pdf],{type:'application/pdf'}),'collection.pdf');
  const uploaded=await request('/api/designer/collection-imports',{body:form});assert.equal(uploaded.status,202);assert.equal(uploaded.headers.get('cache-control'),'no-store');const extracted=await uploaded.json();assert.match(extracted.extractedText,/Summer Dress/);
  const word=new FormData();word.append('catalog',new Blob([Buffer.from('UEsDBBQAAAAIAARPZF2PIASmeQAAAJ4AAAARAAAAd29yZC9kb2N1bWVudC54bWxFzsENwjAMBdBVqg6AKw4copABEEuExLQRtR0lrgLb05QDl/dlW1+ybSZK2AhZhzetXE27jotqNgA1LEi+niQj77enFPK6j2WGJiXmIgFrTTzTCudpugD5xKOzzTwkfnrmTumouydGHm4+vFAt9E23HObDXwv+H7kvUEsBAhQDFAAAAAgABE9kXY8gBKZ5AAAAngAAABEAAAAAAAAAAAAAAIABAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAABAAEAPwAAAKgAAAAAAA==','base64')],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),'collection.docx');
  const wordResult=await request('/api/designer/collection-imports',{body:word});assert.equal(wordResult.status,202);assert.match((await wordResult.json()).extractedText,/Linen Jacket/);
  const invalid=new FormData();invalid.append('catalog',new Blob(['not a PDF'],{type:'application/pdf'}),'bad.pdf');assert.equal((await request('/api/designer/collection-imports',{body:invalid})).status,400);
  const created=await request('/api/designer/collection-drafts',{body:{sourceName:'collection.pdf',extractedText:extracted.extractedText}});assert.equal(created.status,201);const draft=await created.json();
  const route='/api/designer/collection-drafts/'+draft.id;
  assert.equal((await request(route,{method:'GET',token:'otherToken'})).status,404);
  assert.equal((await request(route,{method:'PATCH',token:'otherToken',body:{garments:[]}})).status,404);
  const garments=draft.garments.map(g=>({...g,description:'Original cotton summer dress',price:125,sizes:'M',colors:'Blue',selected:true}));
  assert.equal((await request(route,{method:'PATCH',body:{garments}})).status,200);
  assert.deepEqual((await (await request(route,{method:'GET'})).json()).garments,garments);
  const listing={title:garments[0].name,description:garments[0].description,price:125,category:'apparel',size:'M'};
  const headers={'Idempotency-Key':'pdf-'+garments[0].id};
  const first=await request('/api/listings',{body:listing,headers});assert.equal(first.status,201);const firstData=await first.json();assert.equal(firstData.item.status,'draft');
  const retry=await request('/api/listings',{body:listing,headers});assert.equal(retry.status,200);assert.equal((await retry.json()).item.id,firstData.item.id);
  assert.equal(ctx.db.prepare("SELECT count(*) n FROM listings WHERE status='published'").get().n,0);
  const unicode=await request('/api/designer/collection-drafts',{body:{extractedText:'服'.repeat(59900)}});assert.equal(unicode.status,201);
  assert.equal((await request('/api/designer/collection-drafts',{token:'',body:{extractedText:'Dress'}})).status,401);
 }finally{await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
