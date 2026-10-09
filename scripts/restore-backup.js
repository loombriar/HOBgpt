const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw new Error('Usage: node scripts/restore-backup.js <backup-directory> <new-data-directory>');
const source = path.resolve(sourceArg), target = path.resolve(targetArg);
if (fs.existsSync(target)) throw new Error('Restore target must not exist; existing data will never be overwritten.');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (manifest.version !== 2 || !Array.isArray(manifest.files)) throw new Error('Invalid backup manifest');
for (const file of manifest.files) {
  if (typeof file.path !== 'string' || path.isAbsolute(file.path) || file.path.split(/[\\/]/).some(part => part === '..' || part === '')) throw new Error('Unsafe backup path');
  const resolved = fs.realpathSync(path.join(source, 'data', file.path));
  if (!resolved.startsWith(fs.realpathSync(path.join(source, 'data')) + path.sep)) throw new Error('Backup file escapes data directory');
}
if (!manifest.files.some(file => file.path === manifest.database)) throw new Error('Database is absent from manifest');
const verification = spawnSync(process.execPath, [path.join(__dirname, 'verify-backup.js'), source], { encoding: 'utf8' });
if (verification.status !== 0) throw new Error(verification.stderr || 'Backup verification failed');
fs.mkdirSync(target);
try {
  for (const file of manifest.files) {
    const destination = path.join(target, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(source, 'data', file.path), destination, fs.constants.COPYFILE_EXCL);
  }
  console.log(`Restored ${manifest.files.length} verified files into ${target}`);
} catch (error) {
  fs.rmSync(target, { recursive: true, force: true });
  throw error;
}
