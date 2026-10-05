  app.get('/api/my/favorites', authBuyer, (req,res) => {
    const rows=db.prepare(`SELECT l.*,COALESCE(dp.brand_name,dp.display_name,l.designer_id) designer_name
      FROM buyer_favorites bf
      JOIN listings l ON l.id=bf.listing_id
      JOIN designer_profiles dp ON dp.id=l.designer_id AND dp.status='active'
      WHERE bf.buyer_subject=? AND l.status='published' AND l.moderation_status='approved'
      ORDER BY bf.created_at DESC`).all(req.buyerSubject);
    return res.json({ids:rows.map(row=>row.id),items:rows.map(row=>serializeListing(row,'public'))});
  });
