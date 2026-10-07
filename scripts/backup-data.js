const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');

const args=process.argv.slice(2),i=args.indexOf('--output');
const source=path.resolve(process.env.DATA_DIR||'.data');
const target=path.resolve(i>=0&&args[i+1]?args[i+1]:path.join('.backups',new Date().toISOString().replace(/[:.]/g,'-')));
const databaseName=String(process.env.DATABASE_FILE||'catalog.sqlite');
const databasePath=path.join(source,databaseName);

if(!fs.existsSync(source))throw new Error('DATA_DIR does not exist: '+source);
if(!fs.existsSync(databasePath))throw new Error('SQLite database does not exist: '+databasePath);
fs.mkdirSync(path.join(target,'data'),{recursive:true});

const files=[];
function record(rel,filePath){const bytes=fs.readFileSync(filePath);files.push({path:rel.replaceAll(path.sep,'/'),size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
function copyMedia(dir,rel=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const r=path.join(rel,entry.name),from=path.join(dir,entry.name);
  if(path.resolve(from)===path.resolve(databasePath)||from===databasePath+'-wal'||from===databasePath+'-shm')continue;
  const to=path.join(target,'data',r);
  if(entry.isDirectory()){fs.mkdirSync(to,{recursive:true});copyMedia(from,r);}
  else if(entry.isFile()){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);record(r,to);}
 }
}

async function main(){
 const snapshot=path.join(target,'data',databaseName);
 fs.mkdirSync(path.dirname(snapshot),{recursive:true});
 const db=new Database(databasePath,{readonly:true,fileMustExist:true});
 try{await db.backup(snapshot);}finally{db.close();}
 record(databaseName,snapshot);
 copyMedia(source);
 const manifest={version:2,createdAt:new Date().toISOString(),database:databaseName,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Backup written to '+target+' ('+files.length+' files)');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
