'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const express=require('express');
const mountMessages=require('../creative-messages');
const mountBookings=require('../creative-bookings');
function setup(){
 const db=new Database(':memory:');
 db.exec("CREATE TABLE creative_inquiries(id TEXT PRIMARY KEY,status TEXT,designer_id TEXT,recipient_subject TEXT);CREATE TABLE creative_inquiry_blocks(recipient_subject TEXT,designer_id TEXT);");
 db.prepare("INSERT INTO creative_inquiries VALUES('q1','accepted','designer1','creative1')").run();
 const app=express();app.use(express.json());
 const authBuyer=(req,res,next)=>{req.buyerSubject=req.get('x-test-owner')||'creative1';next();};
 const authDesigner=(req,res,next)=>{req.designerId=req.get('x-test-owner')||'designer1';next();};
 mountMessages({app,db,authBuyer,authDesigner});
 mountBookings({app,db,authBuyer,authDesigner});
 return {db,app};
}
async function serve(app,fn){const server=app.listen(0);try{await new Promise(resolve=>server.once('listening',resolve));return await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
test('same-second messages after marking read remain unread',async()=>{
 const {db,app}=setup();
 await serve(app,async url=>{
  const send=()=>fetch(url+'/api/creative-house/designer-messages/q1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Hello'})});
  assert.equal((await send()).status,201);
  assert.equal((await fetch(url+'/api/creative-house/creative-messages/q1/read',{method:'POST'})).status,200);
  assert.equal((await send()).status,201);
  const data=await (await fetch(url+'/api/creative-house/creative-messages/unread')).json();
  assert.equal(data.unread,1);
 });
 db.close();
});
test('booking list excludes blocked collaborations',async()=>{
 const {db,app}=setup();
 db.prepare("INSERT INTO creative_bookings(id,inquiry_id,proposed_by,starts_at,ends_at,timezone,location,compensation,status) VALUES('b1','q1','designer','2027-01-01T10:00:00Z','2027-01-01T12:00:00Z','UTC','Studio','$100','confirmed')").run();
 await serve(app,async url=>{
  let data=await (await fetch(url+'/api/creative-house/creative-bookings')).json();
  assert.equal(data.bookings.length,1);
  db.prepare("INSERT INTO creative_inquiry_blocks VALUES('creative1','designer1')").run();
  data=await (await fetch(url+'/api/creative-house/creative-bookings')).json();
  assert.equal(data.bookings.length,0);
  assert.equal((await fetch(url+'/api/creative-house/creative-bookings/q1')).status,403);
 });
 db.close();
});
