'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const FIXTURE_ID='staging-launch-checkout-2026-10-29';
const SOURCE_TITLE='STAGING ONLY — Shipping Label Test Piece';
function registerStagingCheckoutFixture({app,db,authAdmin,fail,environment,imagesDir,serializeListing}) {
  // Both checks are required on every request, including after configuration changes.
  const enabled=()=>environment==='staging'&&/^sk_test_/.test(process.env.STRIPE_SECRET_KEY||'');
  app.get('/api/admin/staging/checkout-fixture',authAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!enabled())return res.json({enabled:false});
    const row=db.prepare('SELECT * FROM listings WHERE id=?').get(FIXTURE_ID);
    return res.json({enabled:true,item:row?serializeListing(row,'admin'):null});
  });
  app.post('/api/admin/staging/checkout-fixture',authAdmin,async(req,res,next)=>{
    if(!enabled())return fail(res,404,'not_found','Staging test tools are unavailable.');
    if(req.body?.confirmTestOnly!==true)return fail(res,422,'test_confirmation_required','Confirm this is a disposable test listing.');
    const existing=db.prepare('SELECT * FROM listings WHERE id=?').get(FIXTURE_ID);
    if(existing)return res.json({item:serializeListing(existing,'admin'),reused:true});
    // Reuse only the owner of the explicitly named existing test fixture. Never
    // activate a seller, create credentials, accept terms, or alter payout readiness.
    const source=db.prepare("SELECT l.designer_id FROM listings l JOIN designer_profiles d ON d.id=l.designer_id WHERE l.title=? AND l.status='published' AND d.status='active' ORDER BY l.created_at LIMIT 1").get(SOURCE_TITLE);
    if(!source)return fail(res,409,'test_seller_required','The existing staging test seller is unavailable.');
    const imageId=crypto.randomUUID(),storageKey=imageId+'.png';
    const filename=path.join(imagesDir,storageKey);
    try {
      const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#f4eee4"/><rect x="80" y="80" width="640" height="640" rx="30" fill="#453344"/><text x="400" y="330" text-anchor="middle" font-family="sans-serif" font-size="52" fill="white">STAGING TEST ONLY</text><text x="400" y="430" text-anchor="middle" font-family="sans-serif" font-size="34" fill="white">No physical shipment</text></svg>')).png().toBuffer();
      fs.writeFileSync(filename,image,{flag:'wx'});
      const result=db.transaction(()=>{
        // A second simultaneous click must not create another listing or overwrite history.
        const duplicate=db.prepare('SELECT * FROM listings WHERE id=?').get(FIXTURE_ID);
        if(duplicate)return {row:duplicate,reused:true};
        const now=new Date().toISOString();
        db.prepare(`INSERT INTO listings(id,designer_id,title,description,price,category,style,production_type,availability,stock_quantity,shipping_cost_cents,handling_days_min,handling_days_max,status,moderation_status,created_at,updated_at)
          VALUES(?,?,?, ?,5,'apparel','Other','One of a Kind','floor',1,0,1,2,'pending_review','pending',?,?)`)
          .run(FIXTURE_ID,source.designer_id,'STAGING ONLY — Launch Checkout Test','Disposable staging checkout test. No physical garment will be shipped. Use Stripe test mode only; never enter real payment details.',now,now);
        db.prepare(`INSERT INTO listing_images(id,listing_id,client_image_key,storage_key,position,mime_type,size_bytes,width,height,checksum,upload_status,created_at) VALUES(?,?,?,?,0,'image/png',?,800,800,?,'ready',?)`)
          .run(imageId,FIXTURE_ID,'staging-test-label',storageKey,image.length,crypto.createHash('sha256').update(image).digest('hex'),now);
        return {row:db.prepare('SELECT * FROM listings WHERE id=?').get(FIXTURE_ID),reused:false};
      }).immediate();
      if(result.reused)fs.unlinkSync(filename);
      return res.status(result.reused?200:201).json({item:serializeListing(result.row,'admin'),reused:result.reused});
    }catch(error){fs.rmSync(filename,{force:true});return next(error);}
  });
}
module.exports={registerStagingCheckoutFixture,FIXTURE_ID};
