'use strict';
const zlib = require('node:zlib');
const MAX_XML = 4 * 1024 * 1024;
const decode = s => String(s).replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi, (match,num,named) => {
  if (named) return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()] || match;
  const n = num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):parseInt(num,10);
  return n>0 && n<=0x10ffff && !(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
});
function archiveEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length<22 || buffer.readUInt32LE(0)!==0x04034b50) throw Error('Invalid Excel archive.');
  const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(end<0 || end+22>buffer.length)throw Error('Invalid Excel archive.');
  const count=buffer.readUInt16LE(end+10), directory=buffer.readUInt32LE(end+16);
  if(count>2000 || directory>=buffer.length)throw Error('Excel archive exceeds limits.');
  const entries=new Map();let offset=directory;
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length || buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid Excel entry.');
    const method=buffer.readUInt16LE(offset+10), compressed=buffer.readUInt32LE(offset+20), uncompressed=buffer.readUInt32LE(offset+24);
    const n=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
    if(offset+46+n+extra+comment>buffer.length)throw Error('Invalid Excel directory.');
    const name=buffer.toString('utf8',offset+46,offset+46+n);offset+=46+n+extra+comment;
    if(!/^xl\/(sharedStrings\.xml|worksheets\/sheet[0-9]+\.xml)$/.test(name))continue;
    if(uncompressed>MAX_XML || compressed>MAX_XML || ![0,8].includes(method))throw Error('Excel sheet exceeds limits.');
    if(local+30>buffer.length || buffer.readUInt32LE(local)!==0x04034b50)throw Error('Invalid Excel entry header.');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(start+compressed>buffer.length)throw Error('Truncated Excel entry.');
    const bytes=buffer.subarray(start,start+compressed);
    const data=method===8?zlib.inflateRawSync(bytes,{maxOutputLength:MAX_XML}):bytes;
    if(data.length!==uncompressed)throw Error('Excel entry size mismatch.');
    entries.set(name,data.toString('utf8'));
  }
  return entries;
}
function extractXlsxText(buffer){
  const files=archiveEntries(buffer);
  const sheets=[...files.keys()].filter(x=>/^xl\/worksheets\/sheet[0-9]+\.xml$/.test(x)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]));
  if(!sheets.length)throw Error('Excel worksheets missing.');
  const shared=[];
  const strings=files.get('xl/sharedStrings.xml')||'';
  for(const item of strings.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)){
    shared.push(decode([...item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('')));
    if(shared.length>50000)throw Error('Too many shared strings.');
  }
  const lines=[];
  for(const sheet of sheets.slice(0,10)){
    const xml=files.get(sheet);
    for(const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
      const cells=[];
      for(const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const attrs=cell[1], body=cell[2]||'';
        const type=attrs.match(/\bt="([^"]+)"/)?.[1];
        const raw=body.match(/<v>([\s\S]*?)<\/v>/)?.[1]||'';
        const inline=[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('');
        const value=type==='s'?shared[Number(raw)]||'':type==='inlineStr'?decode(inline):decode(raw||inline);
        if(value.trim())cells.push(value.replace(/[\r\n\t]+/g,' ').trim().slice(0,300));
      }
      if(cells.length)lines.push(cells.join(' | '));
      if(lines.length>=300)break;
    }
    if(lines.length>=300)break;
  }
  return {text:lines.join('\n').slice(0,60000),extraction:'xlsx_cells_only'};
}
module.exports={extractXlsxText};
