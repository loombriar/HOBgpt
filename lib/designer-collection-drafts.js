'use strict';
const crypto = require('node:crypto');
function proposeGarments(text) {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(x => x.length >= 3 && x.length <= 160);
  // Treat all extracted lines as untrusted suggestions, not verified merchandise.
  const seen = new Set();
  return lines.filter(x => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, 30).map(line => ({ id: crypto.randomUUID(), name: line, description: '', price: null, sizes: '', colors: '', selected: false }));
}
function registerCollectionDrafts({ app, db, authDesigner, fail, rateLimit }) {
  db.exec(`CREATE TABLE IF NOT EXISTS designer_collection_drafts (
    id TEXT PRIMARY KEY,
    designer_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    garments_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_collection_draft_designer ON designer_collection_drafts(designer_id);`);
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, keyPrefix: 'designer-collection-drafts' });
  app.post('/api/designer/collection-drafts', authDesigner, limiter, (req, res) => {
    const sourceName = String(req.body?.sourceName || 'Catalog').slice(0, 160);
    const text = String(req.body?.extractedText || '');
    if (!text.trim() || text.length > 60000) return fail(res, 400, 'invalid_catalog_text', 'Provide extracted catalog text up to 60,000 characters.');
    const garments = proposeGarments(text);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO designer_collection_drafts (id,designer_id,source_name,garments_json) VALUES (?,?,?,?)')
      .run(id, req.designerId, sourceName, JSON.stringify(garments));
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ id, sourceName, garments, status: 'private_review_only' });
  });
  app.get('/api/designer/collection-drafts/:id', authDesigner, (req, res) => {
    const row = db.prepare('SELECT * FROM designer_collection_drafts WHERE id=? AND designer_id=?').get(req.params.id, req.designerId);
    if (!row) return fail(res, 404, 'not_found', 'Collection draft not found.');
    res.set('Cache-Control', 'no-store');
    res.json({ id: row.id, sourceName: row.source_name, garments: JSON.parse(row.garments_json), status: 'private_review_only' });
  });
  app.patch('/api/designer/collection-drafts/:id', authDesigner, limiter, (req, res) => {
    const row = db.prepare('SELECT id FROM designer_collection_drafts WHERE id=? AND designer_id=?').get(req.params.id, req.designerId);
    if (!row) return fail(res, 404, 'not_found', 'Collection draft not found.');
    const garments = req.body?.garments;
    if (!Array.isArray(garments) || garments.length > 30 || garments.some(g =>
      !g || typeof g.id !== 'string' || g.id.length > 80 || typeof g.name !== 'string' || g.name.length > 160 ||
      typeof g.description !== 'string' || g.description.length > 2000 ||
      (g.price !== null && (typeof g.price !== 'number' || !Number.isFinite(g.price) || g.price < 0 || g.price > 100000)) ||
      typeof g.sizes !== 'string' || g.sizes.length > 300 || typeof g.colors !== 'string' || g.colors.length > 300 ||
      typeof g.selected !== 'boolean'
    )) return fail(res, 400, 'invalid_garments', 'Invalid garment review data.');
    db.prepare('UPDATE designer_collection_drafts SET garments_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND designer_id=?')
      .run(JSON.stringify(garments), row.id, req.designerId);
    res.set('Cache-Control', 'no-store');
    res.json({ id: row.id, garments, status: 'private_review_only' });
  });
}
module.exports = { proposeGarments, registerCollectionDrafts };
