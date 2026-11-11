'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {extractXlsxText}=require('../lib/collection-xlsx-text');
function makeZip(name,xml){
 const data=Buffer.from(xml), filename=Buffer.from(name);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,6);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
 const start=Buffer.concat([local,filename,data]),entry=Buffer.concat([central,filename]),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(entry.length,12);end.writeUInt32LE(start.length,16);
 return Buffer.concat([start,entry,end]);
}
test('extracts inline garment data from XLSX worksheet into reviewable text',()=>{
 const xml='<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Garment</t></is></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Blue Dress</t></is></c><c r="B2"><v>89.99</v></c></row></sheetData></worksheet>';
 const result=extractXlsxText(makeZip('xl/worksheets/sheet1.xml',xml));
 assert.equal(result.extraction,'xlsx_cells_only');
 assert.match(result.text,/Garment \| Price/);
 assert.match(result.text,/Blue Dress \| 89\.99/);
});
test('rejects invalid spreadsheet archives',()=>assert.throws(()=>extractXlsxText(Buffer.from('not an excel file'))));

test('rejects worksheets with more than 300 nonempty rows instead of silently dropping products',()=>{
 const header='<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c></row>';
 const rows=Array.from({length:300},(_,i)=>'<row r="'+(i+2)+'"><c r="A'+(i+2)+'" t="inlineStr"><is><t>Product '+i+'</t></is></c><c r="B'+(i+2)+'"><v>10</v></c></row>').join('');
 assert.throws(()=>extractXlsxText(makeZip('xl/worksheets/sheet1.xml','<worksheet><sheetData>'+header+rows+'</sheetData></worksheet>')),/exceeds 300/);
});
test('accepts a worksheet at the documented row boundary',()=>{
 const header='<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c></row>';
 const rows=Array.from({length:299},(_,i)=>'<row r="'+(i+2)+'"><c r="A'+(i+2)+'" t="inlineStr"><is><t>Product '+i+'</t></is></c><c r="B'+(i+2)+'"><v>10</v></c></row>').join('');
 const result=extractXlsxText(makeZip('xl/worksheets/sheet1.xml','<worksheet><sheetData>'+header+rows+'</sheetData></worksheet>'));
 assert.equal(result.text.split('\n').length,300);
});
