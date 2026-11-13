// School affiliation is optional and never used for commission eligibility.
function registerSchoolDirectory({app,db,authDesigner,fail}) {
  db.exec(`CREATE TABLE IF NOT EXISTS designer_school_affiliations (
    designer_id TEXT PRIMARY KEY REFERENCES designer_profiles(id) ON DELETE CASCADE,
    school_name TEXT NOT NULL,
    public_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(public_opt_in IN (0,1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const publicSchool = id => db.prepare('SELECT school_name FROM designer_school_affiliations WHERE designer_id=? AND public_opt_in=1').get(id)?.school_name || null;
  app.get('/api/my/school-affiliation', authDesigner, (req,res) => {
    res.set('Cache-Control','no-store');
    const row=db.prepare('SELECT school_name,public_opt_in FROM designer_school_affiliations WHERE designer_id=?').get(req.designerId);
    return res.json({schoolName:row?.school_name||'',publicOptIn:row?.public_opt_in===1});
  });
  app.put('/api/my/school-affiliation', authDesigner, (req,res) => {
    const schoolName=req.body?.schoolName;
    const publicOptIn=req.body?.publicOptIn;
    if(typeof schoolName!=='string'||schoolName.trim().length>160||typeof publicOptIn!=='boolean'||(publicOptIn&&!schoolName.trim()))
      return fail(res,422,'invalid_school_affiliation','Enter a school name and choose whether to display it.');
    const name=schoolName.trim().replace(/\s+/g,' ');
    if(!name)db.prepare('DELETE FROM designer_school_affiliations WHERE designer_id=?').run(req.designerId);
    else db.prepare(`INSERT INTO designer_school_affiliations(designer_id,school_name,public_opt_in)
      VALUES(?,?,?) ON CONFLICT(designer_id) DO UPDATE SET school_name=excluded.school_name,
      public_opt_in=excluded.public_opt_in,updated_at=CURRENT_TIMESTAMP`).run(req.designerId,name,Number(publicOptIn));
    res.set('Cache-Control','no-store');
    return res.json({schoolName:name,publicOptIn:!!name&&publicOptIn});
  });
  app.get('/api/schools', (_req,res) => {
    const schools=db.prepare(`SELECT a.school_name name,COUNT(*) designerCount
      FROM designer_school_affiliations a JOIN designer_profiles d ON d.id=a.designer_id
      WHERE a.public_opt_in=1 AND d.status='active' GROUP BY a.school_name
      ORDER BY a.school_name COLLATE NOCASE`).all();
    res.set('Cache-Control','no-store').json({schools});
  });
  app.get('/api/schools/designers', (req,res) => {
    const name=typeof req.query.school==='string'?req.query.school:'';
    if(!name||name.length>160)return fail(res,422,'invalid_school','Choose a school.');
    const designers=db.prepare(`SELECT d.id,d.display_name displayName,d.brand_name brandName,d.bio,
      d.portrait_storage_key portraitKey
      FROM designer_school_affiliations a JOIN designer_profiles d ON d.id=a.designer_id
      WHERE a.public_opt_in=1 AND d.status='active' AND a.school_name=? ORDER BY COALESCE(d.brand_name,d.display_name)`).all(name).map(d=>({id:d.id,displayName:d.displayName,brandName:d.brandName,bio:d.bio||'',portraitUrl:d.portraitKey?'/media/designers/'+encodeURIComponent(d.id)+'/portrait':null}));
    res.set('Cache-Control','no-store').json({schoolName:name,designers});
  });
  return {publicSchool};
}
module.exports={registerSchoolDirectory};
