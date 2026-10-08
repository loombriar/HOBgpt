const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');

test('public storefront aggregates saved likes, linked badges, available pieces and sold quantities without exposing hidden listings or buyer identities', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'briar-storefront-'));
  const ctx=createApp({dataDir:dir,seedProducts:[],designerTokens:{test:'storefront-designer'}});
  require('./helpers/ready-seller')(ctx.db,'storefront-designer');
  const db=ctx.db,now=new Date().toISOString();
  const insert=db.prepare(`INSERT INTO listings(id,designer_id,title,price,category,status,moderation_status,created_at,updated_at,stock_quantity,production_type) VALUES (?,'storefront-designer',?,50,'Dress',?,?,?, ?,?,?)`);
  insert.run('sf-current','Current','published','approved',now,now,1,'One of a Kind');
  insert.run('sf-sold','Sold','published','approved',now,now,1,'One of a Kind');
  insert.run('sf-partial','Partly sold','published','approved',now,now,5,'Limited Quantity');
  insert.run('sf-hidden','Hidden','draft','pending',now,now,1,'One of a Kind');
  db.prepare(`INSERT INTO orders(id,status,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at) VALUES ('sf-order','paid',10000,1000,9000,?)`).run(now);
  const sold=db.prepare(`INSERT INTO inventory_reservations(listing_id,order_id,status,reserved_at,expires_at,sold_at,quantity) VALUES (?,'sf-order','sold',?,?,?,?)`);
  sold.run('sf-sold',now,now,now,1);sold.run('sf-partial',now,now,now,2);
  const heart=db.prepare('INSERT INTO buyer_favorites VALUES (?,?,?)');
  heart.run('private-shopper-one','sf-current',now);heart.run('private-shopper-two','sf-current',now);heart.run('private-shopper-one','sf-sold',now);heart.run('private-shopper-one','sf-hidden',now);
  db.prepare(`INSERT INTO designer_identities VALUES ('private-maker-subject','storefront-designer','private@example.com',?)`).run(now);
  const badge=db.prepare('INSERT INTO user_badges VALUES (?,?,?,?,?)');
  badge.run('private-maker-subject','supporter','donation','private-donation',now);
  badge.run('private-maker-subject','verified_buyer','order','private-order',now);
  badge.run('unrelated-buyer','supporter','donation','unrelated-donation',now);
  const server=ctx.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const res=await fetch(base+'/api/designers/storefront-designer');assert.equal(res.status,200);const body=await res.json();
    assert.equal(body.designer.totalLikes,3);assert.equal(body.designer.soldCount,3);assert.equal(body.designer.currentListingCount,2);
    assert.deepEqual(body.currentItems.map(i=>i.id).sort(),['sf-current','sf-partial']);assert.deepEqual(body.soldItems.map(i=>i.id).sort(),['sf-partial','sf-sold']);
    assert.deepEqual(body.designer.badges.map(b=>({type:b.type})),[{type:'supporter'},{type:'verified_buyer'},{type:'founding_designer'}]);
    assert.doesNotMatch(JSON.stringify(body),/private-maker-subject|private-shopper|private@example|private-donation|sf-hidden/);
    db.prepare("UPDATE designer_profiles SET status='suspended' WHERE id='storefront-designer'").run();
    assert.equal((await fetch(base+'/api/designers/storefront-designer')).status,404);
  }finally{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
