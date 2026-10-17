// One-time, test-only recovery from an explicitly selected Railway S3 backup.
// Does not change the running database or write to the backup bucket.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { request } = require('./backup-offsite');

async function main() {
  if (process.env.NODE_ENV !== 'test' || process.env.RECOVERY_DRILL_ENABLED !== 'true')
    throw new Error('Recovery requires NODE_ENV=test and RECOVERY_DRILL_ENABLED=true');
  if (process.env.DATA_DIR !== '/data/recovered')
    throw new Error('Set DATA_DIR=/data/recovered for isolated recovery');
  if (!/^hob-payment-tests-backups(?:-|$)/.test(process.env.BACKUP_S3_BUCKET || ''))
    throw new Error('Only the dedicated Payment Tests backup bucket is permitted');
  for (const key of Object.keys(process.env))
    if (/^(STRIPE_|SHIPPO_|SMTP_|SENDGRID_|RESEND_|PAYPAL_)/.test(key))
      throw new Error('Remove live payment, shipping and email credentials: ' + key);
  const prefix = 'house-of-briar/2026-10-16T21-38-21-212Z/';
  const target = '/data/recovered';
  if (fs.existsSync(target)) throw new Error('Recovery target already exists; refusing to overwrite it');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-recovery-'));
  try {
    const manifestBytes = Buffer.from(await (await request('GET', prefix + 'manifest.json')).arrayBuffer());
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.version !== 2 || manifest.database !== 'catalog.sqlite' || !Array.isArray(manifest.files))
      throw new Error('Unexpected backup manifest');
    fs.writeFileSync(path.join(temp, 'manifest.json'), manifestBytes);
    for (const file of manifest.files) {
      if (typeof file.path !== 'string' || !/^(catalog\.sqlite|images\/[a-zA-Z0-9_-]+\.webp)$/.test(file.path))
        throw new Error('Unsafe or unexpected backup path');
      const dest = path.join(temp, 'data', file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const bytes = Buffer.from(await (await request('GET', prefix + 'data/' + file.path)).arrayBuffer());
      fs.writeFileSync(dest, bytes, { flag: 'wx' });
    }
    const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-backup.js'), temp], { stdio: 'inherit' });
    if (verify.status !== 0) throw new Error('Downloaded backup failed verification');
    const restore = spawnSync(process.execPath, [path.join(__dirname, 'restore-backup.js'), temp, target], { stdio: 'inherit' });
    if (restore.status !== 0) throw new Error('Isolated restore failed');
    console.log('Recovery completed at ' + target + '. No live data was overwritten.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { main };
