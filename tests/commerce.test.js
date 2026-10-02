const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');

// Commerce regression suite: intentionally credential-free so GitHub Actions can run it on every push.

const DESIGNER_TOKEN='designer-token-a', OTHER_TOKEN='designer-token-b', ADMIN_TOKEN='admin-token';
let server, context, baseUrl, tempDir;
before(async()=>{tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-commerce-'));context=createApp({dataDir:tempDir,seedProducts:[],designerTokens:{[DESIGNER_TOKEN]:'designer-a',[OTHER_TOKEN]:'designer-b'},adminToken:ADMIN_TOKEN,reviewRequired:true});server=context.app.listen(0,'127.0.0.1');await once(server,'listening');baseUrl='http://127.0.0.1:'+server.address().port;});
after(async()=>{if(server?.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));context?.db.close();if(tempDir)fs.rmSync(tempDir,{recursive:true,force:true});});
async function json(route,options={}){const response=await fetch(baseUrl+route,options);let body={};try{body=await response.json();}catch{}return{response,body};}

test('admin operations require admin credentials',async()=>{assert.equal((await json('/api/admin/operations')).response.status,401);assert.equal((await json('/api/admin/operations',{headers:{Authorization:'Bearer '+DESIGNER_TOKEN}})).response.status,403);});

test('seller orders isolate each designer',async()=>{const now=new Date().toISOString();context.db.prepare("INSERT INTO orders (id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?)").run('isolation-order','paid','usd',10000,1000,9000,now,now);const insert=context.db.prepare("INSERT INTO order_items (id,order_id,listing_id,designer_id,title,unit_amount_cents,quantity,line_total_cents,platform_fee_cents,designer_amount_cents) VALUES (?,?,?,?,?,?,?,?,?,?)");insert.run('item-a','isolation-order','listing-a','designer-a','Private A',6000,1,6000,600,5400);insert.run('item-b','isolation-order','listing-b','designer-b','Private B',4000,1,4000,400,3600);const result=await json('/api/my/orders',{headers:{Authorization:'Bearer '+DESIGNER_TOKEN}});assert.equal(result.response.status,200);const order=result.body.orders.find(x=>x.id==='isolation-order');assert.ok(order);assert.deepEqual(order.items.map(x=>x.title),['Private A']);assert.equal(order.earningsCents,5400);});

test('paid orders cannot be canceled or inventory-released',async()=>{const headers={Authorization:'Bearer '+ADMIN_TOKEN};assert.equal((await json('/api/admin/orders/isolation-order/cancel',{method:'POST',headers})).response.status,409);assert.equal((await json('/api/admin/orders/isolation-order/inventory/release',{method:'POST',headers})).response.status,409);});

test('admin detail omits buyer email',async()=>{context.db.prepare("UPDATE orders SET buyer_email=? WHERE id=?").run('buyer@example.test','isolation-order');const result=await json('/api/admin/orders/isolation-order',{headers:{Authorization:'Bearer '+ADMIN_TOKEN}});assert.equal(result.response.status,200);assert.equal(Object.hasOwn(result.body.order,'buyer_email'),false);assert.deepEqual(result.body.items.map(x=>x.designer_id).sort(),['designer-a','designer-b']);});

test('tracking policy requires carrier movement',()=>{const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');assert.match(source,/new Set\(\['in_transit','out_for_delivery','delivered','available_for_pickup'\]\)/);assert.doesNotMatch(source,/new Set\(\['pre_transit','in_transit'/);});

test('EasyPost webhook uses HMAC signature and tracker.updated',()=>{const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');assert.match(source,/req\.get\('x-hmac-signature'\)/);assert.match(source,/description !== 'tracker\.updated'/);assert.doesNotMatch(source,/x-hob-easypost-secret/);});

test('refund reverses transfers before refund and uses idempotency',()=>{const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');const reversal=source.indexOf('/reversals');const refund=source.indexOf("stripeApi('refunds'");assert.ok(reversal>-1&&refund>reversal);assert.match(source,/hob-refund-reversal-/);assert.match(source,/hob-refund-/);});
