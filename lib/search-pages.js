// Public HTML for visitors and crawlers before the React application starts.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const link = (href, label) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
function renderSearchPage(template, {title, description, url, body}) {
  const metadata = `<title>${escapeHtml(title)} | House of Briar</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(title)} | House of Briar"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:type" content="website">`;
  return template.replace(/<title>[^<]*<\/title>/gi, '').replace(/<meta\s+name=["']description["'][^>]*>/gi, '').replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', metadata + '</head>')
    .replace(/<div id="root">\s*<\/div>/, `<div id="root"><header>${link('/', 'House of Briar')} · ${link('/shop', 'Shop the Runway')} · ${link('/designers', 'Independent designers')}</header><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${body}</main></div>`);
}
function listingLinks(rows) {
  return rows.length ? `<ul>${rows.map(row => `<li>${link('/shop/' + encodeURIComponent(row.id), row.title)}<p>${escapeHtml(row.description)}</p></li>`).join('')}</ul>` : '<p>The House is getting dressed. Explore the Atelier Emine collection preview while new collections arrive.</p>';
}
module.exports = {escapeHtml, link, renderSearchPage, listingLinks};
