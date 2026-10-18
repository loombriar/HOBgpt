function fingerprints(){return [...new Set(String(process.env.ANDROID_APP_SIGNING_SHA256||'').split(',').map(v=>v.trim().toUpperCase()).filter(v=>/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v)))];}
function origins(rpID){return rpID==='houseofbriar.shop'?fingerprints().map(v=>'android:apk-key-hash:'+Buffer.from(v.replaceAll(':',''),'hex').toString('base64url')):[];}
function statement(){const values=fingerprints();return values.length?[{relation:['delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:'com.houseofbriar.market',sha256_cert_fingerprints:values}}]:[];}
module.exports={fingerprints,origins,statement};
