'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'account-deletion.html'),'utf8');
const privacy=fs.readFileSync(path.join(root,'privacy.html'),'utf8');
test('public account deletion page identifies both account types and an unauthenticated request channel',()=>{
 assert.match(page,/<title>Request account deletion \| House of Briar<\/title>/);
 assert.match(page,/Customers:/);
 assert.match(page,/Designers:/);
 assert.match(page,/mailto:thee\.house\.of\.briar@gmail\.com/);
 assert.match(page,/cannot access your account/);
 assert.match(page,/Do not send passwords/);
});
test('account deletion instructions explain retained transaction records and privacy policy',()=>{
 assert.match(page,/payout/);
 assert.match(page,/legally required records/);
 assert.match(page,/href="\/privacy\.html"/);
 assert.match(privacy,/href="\/account-deletion\.html"/);
});
