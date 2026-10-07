const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');

if(!process.argv[2])throw new Error('Usage: node scripts/verify-backup.js <backup-directory>');
const root=path.resolve(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(manifest.version!==2||!manifest.database||!Array.isArray(manifest.files))throw new Error('Invalid backup manifest');
for(const file of manifest.files){
 const filePath=path.join(root,'data',file.path),bytes=fs.readFileSync(filePath);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==file.size||hash!==file.sha256)throw new Error('Backup verification failed: '+file.path);
}
const databasePath=path.join(root,'data',manifest.database);
const db=new Database(databasePath,{readonly:true,fileMustExist:true});
try{
 const rows=db.pragma('integrity_check');
 if(rows.length!==1||rows[0].integrity_check!=='ok')throw new Error('SQLite integrity_check failed: '+JSON.stringify(rows));
}finally{db.close();}
console.log('Verified '+manifest.files.length+' backup files and SQLite integrity.');
