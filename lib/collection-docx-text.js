'use strict';
const zlib = require('node:zlib');

// Read only Word's document XML; never extract ZIP entries to disk.
function extractDocxText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid Word document.');
  const eocd = buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw new Error('Invalid Word archive.');
  const count = buffer.readUInt16LE(eocd + 10);
  const directory = buffer.readUInt32LE(eocd + 16);
  if (count > 2000 || directory >= buffer.length) throw new Error('Word archive is too large.');
  let offset = directory, xml = null;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid Word archive entry.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength > buffer.length) throw new Error('Invalid Word archive entry.');
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== 'word/document.xml') continue;
    if (uncompressed > 4 * 1024 * 1024 || compressed > 4 * 1024 * 1024 || ![0,8].includes(method)) throw new Error('Word document content exceeds limits.');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid Word content entry.');
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + compressed > buffer.length) throw new Error('Truncated Word content.');
    const data = buffer.subarray(start, start + compressed);
    const result = method === 8 ? zlib.inflateRawSync(data, {maxOutputLength: 4 * 1024 * 1024}) : data;
    if (result.length !== uncompressed) throw new Error('Invalid Word content length.');
    xml = result.toString('utf8');
    break;
  }
  if (!xml) throw new Error('Word document text was not found.');
  const decode = s => s.replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi, (match, num, named) => {
    if (named) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()] || match;
    const code = num[0].toLowerCase() === 'x' ? parseInt(num.slice(1),16) : parseInt(num,10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
  const text = decode(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')).trim().slice(0,60000);
  return {text, extraction:'docx_text_only'};
}
module.exports = {extractDocxText};
