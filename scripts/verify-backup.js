const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
if(!process.argv[2])throw new Error('Usage: node scripts/verify-backup.js <backup-directory>');
const root=path.resolve(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(!Array.isArray(manifest.files))throw new Error('Invalid backup manifest');
for(const file of manifest.files){const bytes=fs.readFileSync(path.join(root,'data',file.path));const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(bytes.length!==file.size||hash!==file.sha256)throw new Error('Backup verification failed: '+file.path);}
console.log('Verified '+manifest.files.length+' backup files.');
