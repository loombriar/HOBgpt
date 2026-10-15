const fs = require('node:fs');
const path = require('node:path');

// Validate the snapshot's references, not the live DB: deletions during copying
// must fail the backup instead of publishing an apparently healthy manifest.
function verifyMediaReferences(db, dataDir, manifestPaths) {
  const references = new Set();
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  for (const [table, columns] of [
    ['listing_images', ['storage_key']],
    ['designer_profiles', ['portrait_storage_key', 'logo_storage_key']],
    ['portfolio_images', ['storage_key']],
    ['designer_stories', ['photo_key']],
  ]) {
    if (!tables.has(table)) continue;
    const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
    for (const column of columns) {
      if (!present.has(column)) continue;
      // Deleted listing images are not part of the recoverable catalog.
      const filter = table === 'listing_images' && present.has('upload_status') ? " AND upload_status='ready'" : '';
      for (const row of db.prepare(`SELECT ${column} media_key FROM ${table} WHERE ${column} IS NOT NULL${filter}`).all()) {
        const key = row.media_key;
        if (typeof key !== 'string' || !key || key !== path.basename(key) || key.includes('\\')) throw new Error('Unsafe backup media reference');
        references.add('images/' + key);
      }
    }
  }
  for (const rel of references) {
    if (!fs.existsSync(path.join(dataDir, rel)) || !fs.statSync(path.join(dataDir, rel)).isFile() || (manifestPaths && !manifestPaths.has(rel))) throw new Error('Backup is missing referenced media: ' + rel);
  }
  return references.size;
}
module.exports = { verifyMediaReferences };
