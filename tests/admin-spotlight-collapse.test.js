'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('admin designer spotlight editor can collapse without changing its form',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const start=html.indexOf('<section id="admin-spotlight"');
 const end=html.indexOf('<div id="admin-overview"',start);
 assert.ok(start>=0&&end>start);
 const section=html.slice(start,end);
 assert.match(section,/<details id="admin-spotlight-details">/);
 assert.match(section,/<summary id="admin-spotlight-title"/);
 assert.match(section,/<form id="admin-spotlight-form"/);
 assert.match(section,/<\/form><\/details><\/section>/);
 assert.doesNotMatch(section,/<details id="admin-spotlight-details" open/);
});
test('admin spotlight navigation expands its collapsed editor',()=>{
 const js=fs.readFileSync(path.join(root,'script.js'),'utf8');
 assert.match(js,/dataset\.roomTarget==='admin-spotlight'\)byId\('admin-spotlight-details'\)\?\.setAttribute\('open', ''\)/);
});
