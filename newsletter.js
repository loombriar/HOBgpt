function registerNewsletter({ app, db, fail, rateLimit }) {
  db.exec(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY, consent_version TEXT NOT NULL, subscribed_at TEXT NOT NULL
  )`);
  const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: 'newsletter' });
  app.post('/api/newsletter/subscribe', limit, (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 422, 'invalid_email', 'Enter a valid email address.');
    if (req.body?.consent !== true) return fail(res, 422, 'consent_required', 'Choose to receive House notes before joining.');
    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email,consent_version,subscribed_at) VALUES (?,?,?)').run(email, 'house-notes-2026-10-08', new Date().toISOString());
    // Identical responses keep the subscriber list private.
    return res.set('Cache-Control', 'no-store').status(202).json({ ok: true });
  });
}
module.exports = { registerNewsletter };
