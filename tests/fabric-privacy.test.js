const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const sharp=require('sharp');
const {createApp}=require('../server');

test('Fabric Finder removes photo metadata and requests no provider response storage',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-fabric-privacy-'));
  const previousKey=process.env.OPENAI_API_KEY,originalFetch=global.fetch;
  let received,calls=0;
  process.env.OPENAI_API_KEY='fixture';
  global.fetch=async(url,options)=>{
    if(String(url)!=='https://api.openai.com/v1/responses')return originalFetch(url,options);
    calls++;received=JSON.parse(options.body);
    return {ok:true,json:async()=>({output_text:JSON.stringify({fabricFamily:'Woven fabric',confidence:'low'})})};
  };
  const ctx=createApp({dataDir,seedProducts:[],designerTokens:{'fabric-test':'maker'},sendEmail:async()=>true});
  const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const image=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).withMetadata().jpeg().toBuffer();
    assert.ok((await sharp(image).metadata()).exif);
    const form=new FormData();form.append('photos',new Blob([image],{type:'image/jpeg'}),'photo.jpg');
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/my/fabric-finder',{method:'POST',headers:{Authorization:'Bearer fabric-test'},body:form});
    assert.equal(response.status,200);assert.equal(calls,1);assert.equal(received.store,false);
    const sent=received.input[0].content.find(c=>c.type==='input_image').image_url;
    assert.match(sent,/^data:image\/webp;base64,/);
    const metadata=await sharp(Buffer.from(sent.split(',')[1],'base64')).metadata();
    assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);assert.equal(metadata.xmp,undefined);
    assert.match((await response.json()).disclaimer,/Visual estimate only/);
  }finally{
    global.fetch=originalFetch;
    if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
    await new Promise(r=>server.close(r));ctx.db.close();fs.rmSync(dataDir,{recursive:true,force:true});
  }
});
