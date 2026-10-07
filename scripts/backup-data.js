const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const args=process.argv.slice(2),i=args.indexOf('--output');
const source=path.resolve(process.env.DATA_DIR||'.data');
const target=path.resolve(i>=0&&args[i+1]?args[i+1]:path.join('.backups',new Date().toISOString().replace(/[:.]/g,'-')));
if(!fs.existsSync(source))throw new Error('DATA_DIR does not exist: '+source);
fs.mkdirSync(target,{recursive:true});
const files=[];
function copy(dir,rel=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const r=path.join(rel,entry.name),from=path.join(dir,entry.name),to=path.join(target,'data',r);if(entry.isDirectory()){fs.mkdirSync(to,{recursive:true});copy(from,r);}else if(entry.isFile()){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);const b=fs.readFileSync(to);files.push({path:r.replaceAll(path.sep,'/'),size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}}
copy(source);
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files},null,2)+'\n');
console.log('Backup written to '+target+' ('+files.length+' files)');
