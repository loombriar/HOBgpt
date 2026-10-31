const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');

test('admin and designer inventory edits preserve sold/reserved commitments and stale saves cannot overwrite adjustments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-inventory-coordination-'));
  const ctx = createApp({ dataDir: dir, seedProducts: [], designerTokens: { seller: 'designer-a' }, adminToken: 'admin' });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, token, method = 'GET', body) => {
    const response = await fetch(origin + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const input = { title: 'Batch', category: 'apparel', price: 20, productionType: 'Limited Quantity', stockQuantity: 10, lowStockThreshold: 0 };
    const created = await call('/api/listings', 'seller', 'POST', input);
    assert.equal(created.status, 201);
    const id = created.body.item.id, now = new Date().toISOString();
    for (const [order, status, quantity] of [['sold-order','sold',6],['reserved-order','reserved',2]]) {
      ctx.db.prepare("INSERT INTO orders(id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES (?,'pending',2000,200,1800,?)").run(order,now);
      ctx.db.prepare('INSERT INTO inventory_reservations(listing_id,order_id,status,reserved_at,expires_at,quantity) VALUES (?,?,?,?,?,?)').run(id,order,status,now,now,quantity);
    }
    const before = (await call(`/api/listings/${id}`, 'seller')).body.item;
    assert.equal(before.availableQuantity, 2);
    assert.equal(before.lowStock, false);
    const blocked = await call(`/api/admin/listings/${id}/inventory/adjust`, 'admin', 'POST', { delta:-8, reason:'Physical recount' });
    assert.equal(blocked.status,409);
    assert.equal(blocked.body.error.code,'reserved_inventory');
    assert.equal((await call(`/api/admin/listings/${id}/inventory/history`, 'admin')).body.items.length,0);
    const adjusted = await call(`/api/admin/listings/${id}/inventory/adjust`, 'admin', 'POST', { delta:-2, reason:'Physical recount' });
    assert.equal(adjusted.status,200);
    assert.equal(adjusted.body.item.stockQuantity,8);
    assert.equal(adjusted.body.item.availableQuantity,0);
    assert.equal(adjusted.body.item.lowStock,true);
    const stale = await call(`/api/listings/${id}`, 'seller', 'PUT', { ...input, expectedVersion:before.version });
    assert.equal(stale.status,409);
    assert.equal(stale.body.error.code,'stale_listing');
    const below = await call(`/api/listings/${id}`, 'seller', 'PUT', { ...input, stockQuantity:7, expectedVersion:adjusted.body.item.version });
    assert.equal(below.status,409);
    const toOrder = await call(`/api/listings/${id}`, 'seller', 'PUT', { ...input, productionType:'Made to Order', stockQuantity:0, expectedVersion:adjusted.body.item.version });
    assert.equal(toOrder.status,409);
    const restock = await call(`/api/listings/${id}`, 'seller', 'PUT', { ...input, stockQuantity:12, expectedVersion:adjusted.body.item.version });
    assert.equal(restock.status,200);
    assert.equal(restock.body.item.availableQuantity,4);
    const history = (await call(`/api/admin/listings/${id}/inventory/history`, 'admin')).body.items;
    assert.equal(history.length,2);
    assert.ok(history.some(x=>x.actor_type==='designer' && x.actor_id==='designer-a' && x.delta===4));
    assert.equal((await call(`/api/admin/listings/${id}/inventory/adjust`, 'admin', 'POST', {delta:100000,reason:'Overflow'})).status,409);

    for (const productionType of ['One of a Kind','Limited Quantity']) {
      const listing = await call('/api/listings','seller','POST',{title:productionType,category:'apparel',price:20,productionType,stockQuantity:1});
      const zero = await call(`/api/admin/listings/${listing.body.item.id}/inventory/adjust`, 'admin', 'POST', {delta:-1,reason:'Unavailable offline'});
      assert.equal(zero.status,200);
      const edited = await call(`/api/listings/${listing.body.item.id}`, 'seller', 'PUT', {title:'Description edit',category:'apparel',price:20,expectedVersion:zero.body.item.version});
      assert.equal(edited.status,200);
      assert.equal(edited.body.item.stockQuantity,0);
      assert.equal(edited.body.item.availableQuantity,0);
    }
  } finally {
    await new Promise(resolve=>server.close(resolve)); ctx.db.close(); fs.rmSync(dir,{recursive:true,force:true});
  }
});
