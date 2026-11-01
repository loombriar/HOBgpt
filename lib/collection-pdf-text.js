'use strict';
const zlib = require('node:zlib');

// Conservative text-only extraction for simple PDF catalogs. No OCR or image parsing.
// Bounds are intentional: untrusted compressed streams must never exhaust memory.
function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.subarray(0,5).toString('ascii') !== '%PDF-') {
    throw Object.assign(new Error('Invalid PDF header'), { code: 'invalid_pdf' });
  }
  const source = buffer.toString('latin1');
  if (/\/Encrypt\b/.test(source)) throw Object.assign(new Error('Encrypted PDFs are unsupported'), { code: 'encrypted_pdf' });
  const pages = (source.match(/\/Type\s*\/Page\b/g) || []).length;
  if (pages > 100) throw Object.assign(new Error('PDF exceeds 100 pages'), { code: 'too_many_pages' });
  const chunks = [];
  const streamPattern = /stream\r?\n/g;
  let match, count = 0, total = 0;
  while ((match = streamPattern.exec(source)) && count++ < 300) {
    const end = source.indexOf('endstream', streamPattern.lastIndex);
    if (end < 0) break;
    const start = streamPattern.lastIndex;
    const compressed = buffer.subarray(start, Math.min(end, start + 1024 * 1024));
    const dictionary = source.slice(Math.max(0, match.index - 500), match.index);
    let decoded;
    try {
      decoded = /\/FlateDecode\b/.test(dictionary)
        ? zlib.inflateSync(compressed, { maxOutputLength: 2 * 1024 * 1024 }).toString('latin1')
        : compressed.toString('latin1');
    } catch { streamPattern.lastIndex = end + 9; continue; }
    total += decoded.length;
    if (total > 4 * 1024 * 1024) break;
    const textBlocks = decoded.match(/BT[\s\S]*?ET/g) || [];
    for (const block of textBlocks) {
      const strings = [...block.matchAll(/\(((?:\\.|[^\\)])*)\)\s*T[j']/g)]
        .map(m => m[1].replace(/\\([()\\])/g, '$1').replace(/\\n/g, ' ').replace(/\\r/g, ' '));
      if (strings.length) chunks.push(strings.join(' '));
    }
    streamPattern.lastIndex = end + 9;
  }
  return { pagesDetected: pages, text: chunks.join('\n').slice(0, 60000), extraction: 'basic_pdf_text_only' };
}
module.exports = { extractPdfText };
