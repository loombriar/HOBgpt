const crypto = require('node:crypto');
const STATUSES = ['Active','Draft','Expired','Sold Out','Inactive'];
function listingStatus(item) {
  if (item.status === 'draft') return 'Draft';
  if (item.expiredAt && item.status === 'archived') return 'Expired';
  if (item.status !== 'published' || item.moderationStatus !== 'approved' || item.pausedByDesigner) return 'Inactive';
  if (item.productionType !== 'Made to Order' && item.availableQuantity === 0 && !item.reservedQuantity) return 'Sold Out';
  return 'Active';
}
function registerStudioOptions({app,db,authDesigner,serializeListing,fail}) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_listing_options (listing_id TEXT PRIMARY KEY REFERENCES listings(id), gift_note_available INTEGER NOT NULL DEFAULT 0, expired_at TEXT);
    CREATE TABLE IF NOT EXISTS studio_shared_access (owner_id TEXT NOT NULL REFERENCES designer_profiles(id), member_id TEXT NOT NULL REFERENCES designer_profiles(id), created_at TEXT NOT NULL, PRIMARY KEY(owner_id,member_id));
    CREATE TABLE IF NOT EXISTS studio_access_audit (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, member_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(order_items)').all().some(c=>c.name==='gift_note'))db.exec('ALTER TABLE order_items ADD COLUMN gift_note TEXT');
  function summary(ownerId) {
    const items=db.prepare("SELECT * FROM listings WHERE designer_id=? AND status!='deleted' ORDER BY updated_at DESC").all(ownerId).map(row=>{
      const item=serializeListing(row,'private');
      const options=db.prepare('SELECT * FROM studio_listing_options WHERE listing_id=?').get(row.id);
      return {...item,expiredAt:options?.expired_at||null,giftNoteAvailable:Boolean(options?.gift_note_available)};
    });
    const counts=Object.fromEntries(STATUSES.map(status=>[status,0]));for(const item of items){item.studioStatus=listingStatus(item);counts[item.studioStatus]++;}
    const since=new Date(Date.now()-30*86400000).toISOString();
    const views=db.prepare(`SELECT COUNT(*) events, COUNT(DISTINCT CASE WHEN e.session_id IS NOT NULL AND e.session_id!='' THEN e.session_id END) sessions FROM analytics_events e JOIN listings l ON l.id=e.listing_id WHERE l.designer_id=? AND e.event_name='view_product' AND e.created_at>=?`).get(ownerId,since);
    const orders=db.prepare(`SELECT o.id,o.status,o.created_at,oi.title,oi.quantity FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE oi.designer_id=? ORDER BY o.created_at DESC LIMIT 100`).all(ownerId);
    const messages=db.prepare('SELECT COUNT(*) n FROM listing_inquiries WHERE designer_id=?').get(ownerId)?.n || 0;
    const ordersCount=db.prepare('SELECT COUNT(DISTINCT order_id) n FROM order_items WHERE designer_id=?').get(ownerId).n;
    return {items,counts,ordersCount,views:{events:views.events,sessions:views.sessions,days:30},orders,messages};
  }
  app.get('/api/my/studio',authDesigner,(req,res)=>{res.set('Cache-Control','no-store');res.json(summary(req.designerId));});
  app.put('/api/listings/:listingId/studio-options',authDesigner,(req,res)=>{
    const row=db.prepare("SELECT id FROM listings WHERE id=? AND designer_id=? AND status!='deleted'").get(req.params.listingId,req.designerId);
    if(!row)return fail(res,404,'listing_not_found','Listing not found.');
    if(typeof req.body?.giftNoteAvailable!=='boolean')return fail(res,422,'validation_error','Choose whether to offer a gift note.');
    db.prepare(`INSERT INTO studio_listing_options(listing_id,gift_note_available) VALUES (?,?) ON CONFLICT(listing_id) DO UPDATE SET gift_note_available=excluded.gift_note_available`).run(row.id,req.body.giftNoteAvailable?1:0);
    res.json({giftNoteAvailable:req.body.giftNoteAvailable});
  });
  app.post('/api/listings/:listingId/expire',authDesigner,(req,res)=>{
    const now=new Date().toISOString();
    const result=db.transaction(()=>{
      const row=db.prepare("SELECT * FROM listings WHERE id=? AND designer_id=? AND status!='deleted'").get(req.params.listingId,req.designerId);if(!row)return false;
      if(db.prepare("SELECT 1 FROM inventory_reservations WHERE listing_id=? AND status='reserved'").get(row.id))return 'reserved';
      db.prepare("UPDATE listings SET status='archived',version=version+1,updated_at=? WHERE id=?").run(now,row.id);
      db.prepare(`INSERT INTO studio_listing_options(listing_id,expired_at) VALUES (?,?) ON CONFLICT(listing_id) DO UPDATE SET expired_at=excluded.expired_at`).run(row.id,now);return true;
    }).immediate();
    if(result==='reserved')return fail(res,409,'listing_reserved','Wait until the active checkout reservation is released.');
    if(!result)return fail(res,404,'listing_not_found','Listing not found.');
    res.json({status:'Expired'});
  });
  app.post('/api/listings/:listingId/renew',authDesigner,(req,res)=>{
    const result=db.transaction(()=>{
      const row=db.prepare("SELECT l.id FROM listings l JOIN studio_listing_options s ON s.listing_id=l.id WHERE l.id=? AND l.designer_id=? AND l.status='archived' AND s.expired_at IS NOT NULL").get(req.params.listingId,req.designerId);
      if(!row)return false;
      db.prepare("UPDATE listings SET status='draft',moderation_status='pending',version=version+1,updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);
      db.prepare('UPDATE studio_listing_options SET expired_at=NULL WHERE listing_id=?').run(row.id);return true;
    }).immediate();
    if(!result)return fail(res,404,'expired_listing_not_found','Expired listing not found.');res.json({status:'Draft'});
  });
  app.get('/api/my/studio/shared-access',authDesigner,(req,res)=>{
    res.set('Cache-Control','no-store');
    const members=db.prepare(`SELECT s.member_id id,p.brand_name name,p.email,s.created_at createdAt FROM studio_shared_access s JOIN designer_profiles p ON p.id=s.member_id WHERE s.owner_id=?`).all(req.designerId);
    const studios=db.prepare(`SELECT s.owner_id id,p.brand_name name FROM studio_shared_access s JOIN designer_profiles p ON p.id=s.owner_id WHERE s.member_id=? AND p.status='active'`).all(req.designerId);
    res.json({members,studios,permission:'read_only'});
  });
  app.post('/api/my/studio/shared-access',authDesigner,(req,res)=>{
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    const member=db.prepare("SELECT p.id FROM designer_profiles p WHERE lower(p.email)=? AND p.status='active' AND EXISTS (SELECT 1 FROM designer_identities i WHERE i.designer_id=p.id)").get(email);
    if(!member)return fail(res,422,'member_unavailable','The helper needs an active designer account with a verified House email.');
    if(member.id===req.designerId)return fail(res,422,'owner_access','You already own this studio.');
    const now=new Date().toISOString();db.transaction(()=>{
      const result=db.prepare('INSERT OR IGNORE INTO studio_shared_access(owner_id,member_id,created_at) VALUES (?,?,?)').run(req.designerId,member.id,now);
      if(result.changes)db.prepare('INSERT INTO studio_access_audit VALUES (?,?,?,?,?)').run(crypto.randomUUID(),req.designerId,member.id,'grant_read_only',now);
    }).immediate();res.status(201).json({memberId:member.id,permission:'read_only'});
  });
  app.delete('/api/my/studio/shared-access/:memberId',authDesigner,(req,res)=>{
    db.transaction(()=>{const result=db.prepare('DELETE FROM studio_shared_access WHERE owner_id=? AND member_id=?').run(req.designerId,req.params.memberId);if(result.changes)db.prepare('INSERT INTO studio_access_audit VALUES (?,?,?,?,?)').run(crypto.randomUUID(),req.designerId,req.params.memberId,'revoke',new Date().toISOString());}).immediate();res.json({revoked:true});
  });
  app.get('/api/my/studio/shared/:ownerId',authDesigner,(req,res)=>{
    const access=db.prepare("SELECT 1 FROM studio_shared_access s JOIN designer_profiles p ON p.id=s.owner_id WHERE s.owner_id=? AND s.member_id=? AND p.status='active'").get(req.params.ownerId,req.designerId);
    if(!access)return fail(res,404,'studio_not_found','Shared studio unavailable.');
    res.set('Cache-Control','no-store');const data=summary(req.params.ownerId);
    // A shared dashboard intentionally has no payment data, buyer address,
    // message content, private fit measurements, notes or mutation permission.
    data.items=data.items.map(i=>({id:i.id,title:i.title,studioStatus:i.studioStatus,giftNoteAvailable:i.giftNoteAvailable}));
    res.json({...data,permission:'read_only'});
  });
}
module.exports={registerStudioOptions,listingStatus,STATUSES};
