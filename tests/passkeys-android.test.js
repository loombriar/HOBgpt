const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
test('generated Android passkey configuration preserves edge-to-edge, remains idempotent and uses native WebAuthn',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hob-native-passkeys-'));
 try{
  const mobile=path.join(root,'mobile'),scripts=path.join(mobile,'scripts'),app=path.join(mobile,'android/app');
  const java=path.join(app,'src/main/java/com/houseofbriar/market/MainActivity.java');
  fs.mkdirSync(path.dirname(java),{recursive:true});fs.mkdirSync(path.join(app,'src/main/res/values'),{recursive:true});fs.mkdirSync(scripts,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'../mobile/scripts/configure-android.mjs'),path.join(scripts,'configure-android.mjs'));
  fs.writeFileSync(java,'package com.houseofbriar.market;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}');
  fs.writeFileSync(path.join(app,'build.gradle'),'plugins {}\n');fs.writeFileSync(path.join(app,'src/main/AndroidManifest.xml'),'<manifest><application android:label="House of Briar"></application></manifest>');
  const run=()=>execFileSync(process.execPath,[path.join(scripts,'configure-android.mjs')],{encoding:'utf8'});run();
  const first=fs.readFileSync(java,'utf8');assert.match(first,/EdgeToEdge.enable\(this\)/);assert.match(first,/WebViewFeature.isFeatureSupported\(WebViewFeature.WEB_AUTHENTICATION\)/);assert.match(first,/WEB_AUTHENTICATION_SUPPORT_FOR_APP/);
  run();assert.equal(fs.readFileSync(java,'utf8'),first);
  assert.equal(fs.readFileSync(path.join(app,'build.gradle'),'utf8').match(/apply from: 'passkeys.gradle'/g).length,1);
  assert.match(fs.readFileSync(path.join(app,'src/main/res/values/passkeys.xml'),'utf8'),/https:\/\/houseofbriar.shop\/\.well-known\/assetlinks.json/);
  assert.equal(fs.readFileSync(path.join(app,'src/main/AndroidManifest.xml'),'utf8').match(/android:name="asset_statements"/g).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
