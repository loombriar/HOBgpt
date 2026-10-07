const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Database=require('better-sqlite3');

test('backup creates a consistent SQLite snapshot and excludes WAL/SHM files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hob-backup-')),data=path.join(root,'data'),out=path.join(root,'backup');fs.mkdirSync(data,{recursive:true});
 const dbPath=path.join(data,'catalog.sqlite'),db=new Database(dbPath);db.pragma('journal_mode = WAL');db.exec('CREATE TABLE example(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO example(value) VALUES (\'briar\')');fs.mkdirSync(path.join(data,'images'));fs.writeFileSync(path.join(data,'images','piece.txt'),'media');assert.equal(fs.existsSync(dbPath+'-wal'),true);
 const backup=spawnSync(process.execPath,['scripts/backup-data.js','--output',out],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:data},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));assert.equal(manifest.version,2);assert.equal(manifest.files.some(f=>f.path.endsWith('-wal')||f.path.endsWith('-shm')),false);assert.equal(manifest.files.some(f=>f.path==='images/piece.txt'),true);
 const snap=new Database(path.join(out,'data','catalog.sqlite'),{readonly:true});assert.equal(snap.prepare('SELECT value FROM example').get().value,'briar');snap.close();
 const verify=spawnSync(process.execPath,['scripts/verify-backup.js',out],{cwd:path.join(__dirname,'..'),encoding:'utf8'});assert.equal(verify.status,0,verify.stderr);
 db.close();fs.rmSync(root,{recursive:true,force:true});
});
