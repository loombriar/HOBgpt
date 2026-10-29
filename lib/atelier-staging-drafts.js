'use strict';
const DESIGNER_ID='atelier-emine-draft';
const PLACEHOLDER_EMAIL='atelier-emine@draft.houseofbriar.invalid';
function setupAtelierDrafts(db,{environment,catalog}={}) {
  db.exec(`CREATE TABLE IF NOT EXISTS supplier_catalog_drafts (
    listing_id TEXT PRIMARY KEY REFERENCES listings(id),
    supplier TEXT NOT NULL, source_json TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending_seller_review',
    review_notes TEXT NOT NULL DEFAULT '', imported_at TEXT NOT NULL
  )`);
  if(environment!=='staging')return {imported:0,skipped:true};
  const ids=new Set();
  if(!catalog||!Array.isArray(catalog.products)||catalog.products.length!==89)throw Error('Expected complete Atelier Emine catalog');
  for(const product of catalog.products){
    if(!/^ATELIEREMINE?\d+$/.test(product.sku)||ids.has(product.sku)||!product.title||!/^\d+\.\d{2}$/.test(product.price_usd)||!Number.isFinite(Number(product.price_usd)))throw Error('Invalid supplier record');
    ids.add(product.sku);
    if(!Array.isArray(product.image_urls)||!product.image_urls.length)throw Error('Supplier photo links required');
    for(const value of product.image_urls){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='www.atelieremine.com'||url.username||url.password)throw Error('Unexpected supplier photo host');}
  }
  return db.transaction(()=>{
    const existing=db.prepare('SELECT * FROM designer_profiles WHERE id=?').get(DESIGNER_ID);
    if(existing&&existing.email!==PLACEHOLDER_EMAIL)throw Error('Draft identity already reassigned; import requires review');
    const collision=db.prepare("SELECT id FROM designer_profiles WHERE lower(brand_name)=lower(?) AND id!=?").get('Atelier Emine',DESIGNER_ID);
    if(collision)throw Error('Atelier Emine already has a different profile; review before importing');
    const now=new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO designer_profiles (id,email,display_name,brand_name,status,created_at,bio,location,production_method,categories,portfolio_url,social_url)
      VALUES (?,?,?,?,'suspended',?,?,?,?,?,?,?)`).run(DESIGNER_ID,PLACEHOLDER_EMAIL,'Atelier Emine','Atelier Emine',now,catalog.profile.bio,catalog.profile.location,'Made to Order',JSON.stringify(['Accessories']),catalog.profile.website,catalog.profile.instagram);
    let imported=0;
    for(const product of catalog.products){
      const id='atelier-emine-'+product.sku.toLowerCase();
      const row=db.prepare('SELECT designer_id FROM listings WHERE id=?').get(id);
      const prior=db.prepare('SELECT listing_id FROM supplier_catalog_drafts WHERE listing_id=?').get(id);
      if(row){if(row.designer_id!==DESIGNER_ID||!prior)throw Error('Supplier listing identity collision');continue;}
      if(db.prepare('SELECT id FROM listings WHERE designer_id=? AND sku=?').get(DESIGNER_ID,product.sku))throw Error('Supplier SKU collision');
      db.prepare(`INSERT INTO listings (id,designer_id,title,description,price,category,style,presentation,care_instructions,status,moderation_status,legacy_image_url,created_at,updated_at,production_type,availability,sku,stock_quantity,shipping_cost_cents,handling_days_min,handling_days_max,international_shipping,moderation_reason)
        VALUES (?,?,?,?,?,'accessories','Purses & Bags','womenswear',?,'draft','pending',?,?,?,'Made to Order','floor',?,0,0,1,5,1,?)`).run(id,DESIGNER_ID,product.title,product.description,Number(product.price_usd),product.care,product.image_urls[0],now,now,product.sku,'Seller confirmation and approved payout route required. '+(product.photo_review_status.startsWith('blocked_')?'Identical supplier gallery shared with another product.':''));
      db.prepare('INSERT INTO supplier_catalog_drafts (listing_id,supplier,source_json,imported_at) VALUES (?,?,?,?)').run(id,'atelier-emine',JSON.stringify(product),now);
      imported++;
    }
    return {imported,total:89,designerId:DESIGNER_ID};
  }).immediate();
}
function registerAtelierDraftReview({app,db,authAdmin,fail,environment,catalog,importError}){
  app.get('/api/admin/atelier-emine/drafts',authAdmin,(_req,res)=>{
    if(environment!=='staging')return fail(res,404,'not_found','Staging collection review is unavailable.');
    res.set('Cache-Control','no-store');
    if(importError)return fail(res,409,'supplier_import_requires_review','The supplier import needs staff review before drafts can be loaded. Existing records have been preserved.');
    const profile=db.prepare('SELECT id,brand_name,bio,location,status,portfolio_url,social_url FROM designer_profiles WHERE id=?').get(DESIGNER_ID);
    const rows=db.prepare(`SELECT l.id,l.title,l.description,l.price,l.status,l.moderation_status,s.source_json,s.review_status,s.review_notes FROM listings l JOIN supplier_catalog_drafts s ON s.listing_id=l.id WHERE s.supplier='atelier-emine' AND l.status!='deleted' ORDER BY l.title`).all();
    return res.json({profile,pricing:catalog.pricing_policy,logoDataUrl:catalog.logoDataUrl,items:rows.map(({source_json,...row})=>{const source=JSON.parse(source_json);return {...row,source,sellerReview:require('./atelier-seller-review').reviewFor(db,row,source)};}),salesEnabled:false});
  });
  app.patch('/api/admin/atelier-emine/drafts/:listingId/notes',authAdmin,(req,res)=>{
    if(environment!=='staging')return fail(res,404,'not_found','Staging collection review is unavailable.');
    if(typeof req.body?.notes!=='string'||req.body.notes.length>4000)return fail(res,422,'invalid_notes','Use review notes up to 4,000 characters.');
    const result=db.prepare("UPDATE supplier_catalog_drafts SET review_notes=? WHERE listing_id=? AND supplier='atelier-emine'").run(req.body.notes,req.params.listingId);
    if(!result.changes)return fail(res,404,'not_found','Supplier draft not found.');
    return res.json({saved:true,reviewStatus:'pending_seller_review'});
  });
}
module.exports={setupAtelierDrafts,registerAtelierDraftReview,DESIGNER_ID};
