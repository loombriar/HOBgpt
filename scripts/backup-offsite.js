const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { spawnSync }=require('node:child_process');

const required=['BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_ACCESS_KEY_ID','BACKUP_S3_SECRET_ACCESS_KEY'];
for(const name of required)if(!process.env[name])throw new Error(name+' is required');
const endpoint=new URL(process.env.BACKUP_S3_ENDPOINT);
if(endpoint.protocol!=='https:')throw new Error('BACKUP_S3_ENDPOINT must use HTTPS');
const bucket=process.env.BACKUP_S3_BUCKET;
const accessKey=process.env.BACKUP_S3_ACCESS_KEY_ID;
const secretKey=process.env.BACKUP_S3_SECRET_ACCESS_KEY;
const region=process.env.BACKUP_S3_REGION||'auto';
const keepDays=Math.max(1,Number(process.env.BACKUP_RETENTION_DAYS||30));
const root=path.resolve(process.env.BACKUP_WORK_DIR||'.backups/offsite-work');

const hash=(key,data)=>crypto.createHmac('sha256',key).update(data).digest();
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function objectPath(key){return '/'+enc(bucket)+'/'+key.split('/').map(enc).join('/');}
async function request(method,key,{body=Buffer.alloc(0),query='',headers={}}={}){
 const now=new Date(),amz=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=amz.slice(0,8);
 const payloadHash=sha(body),host=endpoint.host,uri=objectPath(key);
 const signed={'host':host,'x-amz-content-sha256':payloadHash,'x-amz-date':amz,...headers};
 const names=Object.keys(signed).map(x=>x.toLowerCase()).sort();
 const canonicalHeaders=names.map(n=>n+':'+String(signed[n]).trim()+'\n').join('');
 const canonical=[method,uri,query,canonicalHeaders,names.join(';'),payloadHash].join('\n');
 const scope=`${date}/${region}/s3/aws4_request`;
 const stringToSign=['AWS4-HMAC-SHA256',amz,scope,sha(Buffer.from(canonical))].join('\n');
 const kDate=hash('AWS4'+secretKey,date),kRegion=hash(kDate,region),kService=hash(kRegion,'s3'),kSigning=hash(kService,'aws4_request');
 const signature=crypto.createHmac('sha256',kSigning).update(stringToSign).digest('hex');
 const authorization=`AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
 const response=await fetch(new URL(uri+(query?'?'+query:''),endpoint),{method,headers:{...signed,Authorization:authorization},body:['GET','HEAD'].includes(method)?undefined:body});
 if(!response.ok)throw new Error(`${method} ${key||bucket} failed: ${response.status} ${(await response.text()).slice(0,500)}`);
 return response;
}
// Parse one <Contents> block at a time to keep object keys and dates paired.
function listContents(xml) {
 const decode=value=>value.replace(/&#(x[0-9a-f]+|[0-9]+);|&(?:amp|lt|gt|quot|apos);/gi,(entity,numeric)=>{
  if(numeric){const n=numeric[0].toLowerCase()==='x'?parseInt(numeric.slice(1),16):parseInt(numeric,10);return n<=0x10ffff?String.fromCodePoint(n):entity;}
  return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'})[entity]||entity;
 });
 const value=(fragment,name)=>{const match=fragment.match(new RegExp('<(?:[\\w.-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+name+'>'));return match?decode(match[1]):null;};
 const objects=[];
 for(const match of xml.matchAll(/<(?:[\w.-]+:)?Contents(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?Contents>/g)){
  const key=value(match[1],'Key'),timestamp=value(match[1],'LastModified');
  if(!key||!timestamp)continue;
  const modified=new Date(timestamp);
  if(Number.isFinite(modified.getTime()))objects.push({key,modified});
 }
 return {objects,truncated:value(xml,'IsTruncated')==='true',nextToken:value(xml,'NextContinuationToken')};
}
async function list(){
 const objects=[];let token=null;
 do {
  const q='list-type=2&prefix='+enc('house-of-briar/')+(token?'&continuation-token='+enc(token):'');
  const response=await request('GET','',{query:q});
  const page=listContents(await response.text());
  objects.push(...page.objects);
  if(page.truncated&&!page.nextToken)throw new Error('S3 listing was truncated without a continuation token');
  token=page.truncated?page.nextToken:null;
 }while(token);
 return objects;
}
async function main(){
 fs.rmSync(root,{recursive:true,force:true});fs.mkdirSync(root,{recursive:true});
 const local=path.join(root,'snapshot');
 const backup=spawnSync(process.execPath,[path.join(__dirname,'backup-data.js'),'--output',local],{stdio:'inherit',env:process.env});
 if(backup.status!==0)throw new Error('Local backup failed');
 const verify=spawnSync(process.execPath,[path.join(__dirname,'verify-backup.js'),local],{stdio:'inherit',env:process.env});
 if(verify.status!==0)throw new Error('Backup verification failed before upload');
 const manifest=JSON.parse(fs.readFileSync(path.join(local,'manifest.json'),'utf8'));
 const stamp=manifest.createdAt.replace(/[:.]/g,'-'),prefix=`house-of-briar/${stamp}/`;
 const upload=[{rel:'manifest.json',file:path.join(local,'manifest.json')},...manifest.files.map(f=>({rel:'data/'+f.path,file:path.join(local,'data',f.path)}))];
 for(const item of upload){const body=fs.readFileSync(item.file);await request('PUT',prefix+item.rel,{body,headers:{'content-type':'application/octet-stream'}});}
 const remoteManifest=await (await request('GET',prefix+'manifest.json')).text();
 if(sha(Buffer.from(remoteManifest))!==sha(fs.readFileSync(path.join(local,'manifest.json'))))throw new Error('Remote manifest verification failed');
 const cutoff=Date.now()-keepDays*86400000;
 for(const item of await list())if(item.modified.getTime()<cutoff)await request('DELETE',item.key);
 console.log(`Verified off-site backup uploaded to s3://${bucket}/${prefix} with ${upload.length} objects; retention ${keepDays} days`);
 fs.rmSync(root,{recursive:true,force:true});
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={listContents,list};
