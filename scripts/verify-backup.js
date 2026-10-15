const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {verifyMediaReferences}=require('../lib/backup-media');

if(!process.argv[2])throw new Error('Usage: node scripts/verify-backup.js <backup-directory>');
const root=path.resolve(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(manifest.version!==2||!manifest.database||!Array.isArray(manifest.files))throw new Error('Invalid backup manifest');
const paths=new Set();
for(const file of manifest.files){
 if(typeof file.path!=='string'||path.isAbsolute(file.path)||file.path.split(/[\\/]/).includes('..')||paths.has(file.path))throw new Error('Unsafe or duplicate manifest path');
 paths.add(file.path);
 const filePath=path.join(root,'data',file.path),bytes=fs.readFileSync(filePath);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==file.size||hash!==file.sha256)throw new Error('Backup verification failed: '+file.path);
}
if(!paths.has(manifest.database))throw new Error('Database is not covered by manifest');
const databasePath=path.join(root,'data',manifest.database);
const db=new Database(databasePath,{readonly:true,fileMustExist:true});
try{
 verifyMediaReferences(db,path.join(root,'data'),paths);
 const rows=db.pragma('integrity_check');
 if(rows.length!==1||rows[0].integrity_check!=='ok')throw new Error('SQLite integrity_check failed: '+JSON.stringify(rows));
}finally{db.close();}
console.log('Verified '+manifest.files.length+' backup files and SQLite integrity.');
