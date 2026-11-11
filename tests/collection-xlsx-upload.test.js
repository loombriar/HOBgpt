'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server');

function makeXlsx(xml){
  const data=Buffer.from(xml),filename=Buffer.from('xl/worksheets/sheet1.xml');
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  const localEntry=Buffer.concat([local,filename,data]);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,6);
  central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
  const directory=Buffer.concat([central,filename]);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(localEntry.length,16);
  return Buffer.concat([localEntry,directory,end]);
}

test('designer can upload an XLSX catalog and access its saved private collection review',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-xlsx-upload-'));
  const ctx=createApp({dataDir:dir,designerTokens:{makerToken:'maker',otherToken:'other'}});
  const server=ctx.app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const request=(route,{token='makerToken',method='GET',body}={})=>fetch(origin+route,{
    method,
    headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},
    body:body instanceof FormData?body:body?JSON.stringify(body):undefined
  });
  try{
    const xml='<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>title</t></is></c><c r="B1" t="inlineStr"><is><t>retail price</t></is></c><c r="C1" t="inlineStr"><is><t>short_description</t></is></c><c r="D1" t="inlineStr"><is><t>colour</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Blue Dress</t></is></c><c r="B2"><v>89.99</v></c><c r="C2" t="inlineStr"><is><t>Handmade cotton dress</t></is></c><c r="D2" t="inlineStr"><is><t>Blue</t></is></c></row></sheetData></worksheet>';
    const form=new FormData();
    form.append('catalog',new Blob([makeXlsx(xml)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'spring-collection.xlsx');
    const uploaded=await request('/api/designer/collection-imports',{method:'POST',body:form});
    assert.equal(uploaded.status,202);
    assert.equal(uploaded.headers.get('cache-control'),'no-store');
    const extraction=await uploaded.json();
    assert.equal(extraction.extractionMethod,'xlsx_cells_only');
    assert.match(extraction.extractedText,/Blue Dress \| 89\.99/);

    const created=await request('/api/designer/collection-drafts',{method:'POST',body:{sourceName:'spring-collection.xlsx',extractedText:extraction.extractedText}});
    assert.equal(created.status,201);
    const review=await created.json();
    assert.equal(review.status,'private_review_only');
    assert.equal(review.garments.length,1);
    assert.deepEqual({name:review.garments[0].name,price:review.garments[0].price,description:review.garments[0].description,colors:review.garments[0].colors},{name:'Blue Dress',price:89.99,description:'Handmade cotton dress',colors:'Blue'});

    const listed=await request('/api/designer/collection-drafts');
    assert.equal(listed.status,200);
    assert.equal((await listed.json()).items[0].sourceName,'spring-collection.xlsx');
    const reopened=await request('/api/designer/collection-drafts/'+review.id);
    assert.equal(reopened.status,200);
    assert.equal((await reopened.json()).garments[0].name,'Blue Dress');
    assert.deepEqual((await (await request('/api/designer/collection-drafts',{token:'otherToken'})).json()).items,[]);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
