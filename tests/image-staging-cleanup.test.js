'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {cleanupStaleIncomingFiles,createImageWorkControls,DEFAULT_STALE_STAGING_MAX_AGE_MS}=require('../lib/image-work-controls');
const name=c=>c.repeat(8)+'-'+c.repeat(4)+'-4'+c.repeat(3)+'-8'+c.repeat(3)+'-'+c.repeat(12)+'.tmp';
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'hob-staging-'));
test('cleanup deletes only stale generated regular files',async()=>{
  const dir=root(),incoming=path.join(dir,'.incoming');fs.mkdirSync(incoming);
  const old=path.join(incoming,name('a')),recent=path.join(incoming,name('b')),manual=path.join(incoming,'manual.tmp'),outside=path.join(dir,'outside');
  const link=path.join(incoming,name('c')),folder=path.join(incoming,name('d'));
  try{
    for(const p of [old,recent,manual,outside])fs.writeFileSync(p,'preserve');
    fs.symlinkSync(outside,link);fs.mkdirSync(folder);
    const now=Date.now();
    for(const p of [old,manual])fs.utimesSync(p,new Date(now-2*DEFAULT_STALE_STAGING_MAX_AGE_MS),new Date(now-2*DEFAULT_STALE_STAGING_MAX_AGE_MS));
    assert.equal(await cleanupStaleIncomingFiles(incoming,{nowMs:now}),1);
    assert.equal(fs.existsSync(old),false);
    for(const p of [recent,manual,outside,link,folder])assert.equal(fs.existsSync(p),true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing directory is harmless and symlink root is rejected',async()=>{
  const dir=root(),target=path.join(dir,'target'),link=path.join(dir,'link');
  try{
    assert.equal(await cleanupStaleIncomingFiles(path.join(dir,'missing')),0);
    fs.mkdirSync(target);fs.symlinkSync(target,link,'dir');
    await assert.rejects(cleanupStaleIncomingFiles(link),{code:'unsafe_staging_directory'});
    await assert.rejects(cleanupStaleIncomingFiles(target,{maxAgeMs:1000}),TypeError);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('startup cleanup reports removed count',async()=>{
  const dir=root(),incoming=path.join(dir,'images','.incoming'),events=[];
  try{
    fs.mkdirSync(incoming,{recursive:true});
    const file=path.join(incoming,name('f'));fs.writeFileSync(file,'old');
    const time=new Date(Date.now()-2*DEFAULT_STALE_STAGING_MAX_AGE_MS);fs.utimesSync(file,time,time);
    const controls=createImageWorkControls({db:{exec(){},transaction(){return Object.assign(()=>{}, {immediate:()=>0});}},imagesDir:path.join(dir,'images'),fail:()=>{},log:(...a)=>events.push(a)});
    assert.equal(await controls.stagingCleanup,1);
    assert.equal(fs.existsSync(file),false);
    assert.equal(events[0][1],'stale_image_uploads_cleaned');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
