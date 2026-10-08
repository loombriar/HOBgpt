const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-full-audit-'));
  const ctx = createApp({ dataDir: dir, designerTokens: { makerToken: 'maker' }, adminToken: 'adminToken', sendEmail: async () => true, seedProducts: [{ id: 'piece', designerId: 'maker', title: 'Piece', price: 10 }] });
  const server = ctx.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { ctx, origin, send: (route, body, headers = {}) => fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), close: async () => { await new Promise(r => server.close(r)); ctx.db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
test('newsletter validates consent, persists normalized addresses once, and rate limits', async () => {
  const f = await fixture(); try {
    assert.equal((await f.send('/api/newsletter/subscribe', { email: 'bad', consent: true })).status, 422);
    assert.equal((await f.send('/api/newsletter/subscribe', { email: 'a@example.com' })).status, 422);
    for (const email of [' A@EXAMPLE.COM ', 'a@example.com']) assert.equal((await f.send('/api/newsletter/subscribe', { email, consent: true })).status, 202);
    const rows = f.ctx.db.prepare('SELECT * FROM newsletter_subscribers').all();
    assert.equal(rows.length, 1); assert.equal(rows[0].email, 'a@example.com'); assert.ok(rows[0].consent_version); assert.ok(rows[0].subscribed_at);
    for (let i = 0; i < 6; i++) await f.send('/api/newsletter/subscribe', { email: 'a@example.com', consent: true });
    assert.equal((await f.send('/api/newsletter/subscribe', { email: 'a@example.com', consent: true })).status, 429);
  } finally { await f.close(); }
});
test('measurement requests validate on the server and reach the designer without open chat', async () => {
  const f = await fixture(); try {
    assert.equal((await f.send('/api/listings/piece/inquiries', { measurements: { bust: 34 } })).status, 401);
    const headers = { Authorization: 'Bearer makerToken' };
    for (const bust of ['34', -1, 151, 34.001]) assert.equal((await f.send('/api/listings/piece/inquiries', { measurements: { bust } }, headers)).status, 422);
    const response = await f.send('/api/listings/piece/inquiries', { measurements: { bust: 34.25, height: 67 }, message: 'Can this fit?' }, headers);
    assert.equal(response.status, 201);
    const row = f.ctx.db.prepare('SELECT * FROM listing_inquiries').get(); assert.match(row.message, /bust: 34.25 in/); assert.match(row.message, /Can this fit/);
    const mine = await fetch(f.origin + '/api/my/designer-inquiries', { headers }); assert.equal((await mine.json()).inquiries.length, 1);
    const reply = await f.send(`/api/my/inquiries/${row.id}/messages`, { message: 'Open chat' }, headers); assert.equal(reply.status, 409);
  } finally { await f.close(); }
});
test('invalid and oversized JSON use safe client error responses', async () => {
  const f = await fixture(); try {
    for (const [body, expected] of [['{"email":', 400], [JSON.stringify({ email: 'x'.repeat(70000) }), 413]]) {
      const response = await fetch(f.origin + '/api/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, expected); const payload = await response.json(); assert.ok(payload.error); assert.doesNotMatch(JSON.stringify(payload), /SyntaxError|stack|Unexpected token/);
    }
  } finally { await f.close(); }
});
test('private API responses prohibit caching and sitemap omits private routes and suspended designers', async () => {
  const f = await fixture(); try {
    const profile = await fetch(f.origin + '/api/my/designer-profile', { headers: { Authorization: 'Bearer makerToken' } }); assert.equal(profile.headers.get('cache-control'), 'no-store');
    f.ctx.db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='maker'").run();
    const sitemap = await (await fetch(f.origin + '/sitemap.xml')).text(); assert.match(sitemap, /<urlset/); assert.doesNotMatch(sitemap, /\/account|\/admin|\/cart|\/checkout|\/designers\/maker/);
    const robots = await (await fetch(f.origin + '/robots.txt')).text(); assert.match(robots, /Disallow: \/api\//); assert.match(robots, /Sitemap:/);
  } finally { await f.close(); }
});
