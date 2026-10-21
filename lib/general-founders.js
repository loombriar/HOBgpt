'use strict';
function installGeneralFounders({app,db,authAdmin,requireAdminRequestOrigin}) {
  app.post('/api/founding-schools/admin/general-founders/assign',authAdmin,requireAdminRequestOrigin,(req,res)=>{
    if(req.adminRole!=='owner')return res.status(403).json({error:'owner_required'});
    const creatorId=typeof req.body?.creatorId==='string'?req.body.creatorId.trim():'';
    if(!creatorId||creatorId.length>100)return res.status(400).json({error:'invalid_creator'});
    try{
      const result=db.transaction(()=>{
        if(!db.prepare('SELECT id FROM designer_profiles WHERE id=?').get(creatorId))throw Error('creator_not_found');
        if(db.prepare('SELECT creator_id FROM founding_school_commissions WHERE creator_id=?').get(creatorId))throw Error('already_school_founder');
        const existing=db.prepare('SELECT founder_number FROM founding_creator_assignments WHERE creator_id=?').get(creatorId);
        if(existing)return {founderNumber:existing.founder_number,alreadyAssigned:true};
        const numbers=new Set(db.prepare('SELECT founder_number FROM founding_creator_assignments').all().map(row=>row.founder_number));
        let slot=1;while(slot<=50&&numbers.has(slot))slot++;
        if(slot>50)throw Error('founder_slots_full');
        db.prepare('INSERT INTO founding_creator_assignments(creator_id,founder_number,assigned_at,assigned_by) VALUES(?,?,?,?)').run(creatorId,slot,new Date().toISOString(),req.adminActor||'owner');
        return {founderNumber:slot,alreadyAssigned:false};
      })();
      return res.status(result.alreadyAssigned?200:201).json({...result,creatorId,rateBasisPoints:500});
    }catch(error){return res.status(409).json({error:error.message||'assignment_failed'});}
  });
}
module.exports={installGeneralFounders};
