const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Database=require('better-sqlite3');

test('backup creates a consistent SQLite snapshot and excludes WAL/SHM files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hob-backup-')),data=path.join(root,'data'),out=path.join(root,'backup');fs.mkdirSync(data,{recursive:true});
 const dbPath=path.join(data,'catalog.sqlite'),db=new Database(dbPath);db.pragma('journal_mode = WAL');db.exec('CREATE TABLE example(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO example(value) VALUES (\'briar\')');fs.mkdirSync(path.join(data,'images'));fs.writeFileSync(path.join(data,'images','piece.txt'),'media');assert.equal(fs.existsSync(dbPath+'-wal'),true);
 const backup=spawnSync(process.execPath,['scripts/backup-data.js','--output',out],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:data},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));assert.equal(manifest.version,2);assert.equal(manifest.files.some(f=>f.path.endsWith('-wal')||f.path.endsWith('-shm')),false);assert.equal(manifest.files.some(f=>f.path==='images/piece.txt'),true);
 const snap=new Database(path.join(out,'data','catalog.sqlite'),{readonly:true});assert.equal(snap.prepare('SELECT value FROM example').get().value,'briar');snap.close();
 const verify=spawnSync(process.execPath,['scripts/verify-backup.js',out],{cwd:path.join(__dirname,'..'),encoding:'utf8'});assert.equal(verify.status,0,verify.stderr);
 const restored=path.join(root,'restored');
 const restore=()=>spawnSync(process.execPath,['scripts/restore-backup.js',out,restored],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 assert.equal(restore().status,0);
 const restoredDb=new Database(path.join(restored,'catalog.sqlite'),{readonly:true});
 assert.equal(restoredDb.prepare('SELECT value FROM example').get().value,'briar');restoredDb.close();
 assert.equal(fs.readFileSync(path.join(restored,'images','piece.txt'),'utf8'),'media');
 assert.notEqual(restore().status,0); // A second restore must never overwrite data.
 fs.rmSync(restored,{recursive:true});
 fs.writeFileSync(path.join(out,'data','images','piece.txt'),'tampered');
 assert.notEqual(restore().status,0);assert.equal(fs.existsSync(restored),false);
 db.close();fs.rmSync(root,{recursive:true,force:true});
});
