const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {isTrustedRequestOrigin}=require('./lib/request-origin');

function registerDesignerAccountDeletion({app,db,authDesigner,authAdmin,fail,trustedAppOrigin,clearDesignerSession,designerTokens,imagesDir}){
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  // Only these private, non-financial records can be erased automatically.
  // Any new feature containing an account reference requires an explicit review.
  const removable=new Set(['designer_access_tokens','designer_sessions','designer_identities','designer_terms_acceptances','designer_email_changes','founding_designers','designer_notifications','seller_tool_usage','designer_stories','buyer_favorites','house_ai_usage','support_agent_runs','designer_account_activity','creative_network_preferences','creative_inquiry_blocks']);
  function origin(req,res,next){return isTrustedRequestOrigin(req,trustedAppOrigin(req))?next():fail(res,403,'invalid_origin','This request did not come from House of Briar.');}
  function remove(id,activityId){
    return db.transaction(()=>{
      const profile=db.prepare('SELECT * FROM designer_profiles WHERE id=?').get(id);
      if(!profile)return {status:404,code:'designer_not_found',message:'Designer account not found.'};
      const blocked=()=>({status:409,code:'account_records_require_review',message:'Your account has listings, connected payouts, or shared records that need review before deletion. Contact thee.house.of.briar@gmail.com.'});
      if(db.prepare('SELECT 1 FROM designer_account_activity WHERE designer_id=? AND request_id!=?').get(id,activityId||''))return blocked();
      if(db.prepare('SELECT 1 FROM designer_identities WHERE designer_id=?').get(id)||profile.stripe_account_id||id==='house-of-briar'||Object.values(designerTokens).includes(id)||db.prepare('SELECT 1 FROM reviewer_credentials WHERE account_id=?').get(id))return blocked();
      if(db.prepare("SELECT 1 FROM designer_applications WHERE designer_id=? AND id!=COALESCE(?,'')").get(id,profile.application_id))return blocked();
      const subjects=[`designer:${id}`,...db.prepare('SELECT subject FROM designer_identities WHERE designer_id=?').all(id).map(r=>r.subject)];
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      const matches=[];
      for(const {name} of tables){
        if(['designer_profiles','designer_applications','designer_login_challenges','designer_email_auth_limits','email_outbox','account_passkeys','passkey_users','passkey_challenges'].includes(name))continue;
        const columns=db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name);
        const conditions=[],values=[];
        for(const col of new Set(['designer_id','owner_id','member_id','account_id',...db.prepare('PRAGMA foreign_key_list('+quote(name)+')').all().filter(fk=>fk.table==='designer_profiles').map(fk=>fk.from)]))if(columns.includes(col)){conditions.push(quote(col)+'=?');values.push(id);}
        for(const col of columns.filter(col=>col==='subject'||col.endsWith('_subject')))if(columns.includes(col)){conditions.push(quote(col)+' IN ('+subjects.map(()=>'?').join(',')+')');values.push(...subjects);}
        if(columns.includes('buyer_email')){conditions.push('lower(buyer_email)=?');values.push(profile.email.toLowerCase());}
        if(!conditions.length)continue;
        const where=conditions.join(' OR ');
        if(db.prepare('SELECT 1 FROM '+quote(name)+' WHERE '+where+' LIMIT 1').get(...values)){
          if(!removable.has(name))return blocked();
          matches.push({name,where,values});
        }
      }
      const files=[profile.portrait_storage_key,profile.logo_storage_key,db.prepare('SELECT photo_key FROM designer_stories WHERE designer_id=?').get(id)?.photo_key].filter(Boolean);
      // Reviewer sessions are protected above; remove credential-linked sessions first.
      for(const row of matches)db.prepare('DELETE FROM '+quote(row.name)+' WHERE '+row.where).run(...row.values);
      db.prepare('DELETE FROM designer_login_challenges WHERE lower(email)=?').run(profile.email.toLowerCase());
      db.prepare('DELETE FROM designer_email_auth_limits WHERE email_hash=?').run(crypto.createHash('sha256').update(profile.email.toLowerCase()).digest('hex'));
      // Remove queued/sent private email copies addressed to this account.
      db.prepare('DELETE FROM email_outbox WHERE lower(recipient)=? OR event_key=?').run(profile.email.toLowerCase(),`designer-signup:${profile.application_id}`);
      db.prepare("DELETE FROM passkey_sessions WHERE credential_id IN (SELECT id FROM account_passkeys WHERE kind='designer' AND account_id=?)").run(id);
      for(const table of ['account_passkeys','passkey_users','passkey_challenges'])db.prepare("DELETE FROM "+quote(table)+" WHERE kind='designer' AND account_id=?").run(id);
      db.prepare('DELETE FROM designer_profiles WHERE id=?').run(id);
      if(profile.application_id)db.prepare('DELETE FROM designer_applications WHERE id=?').run(profile.application_id);
      return {files};
    }).immediate();
  }
  async function finish(req,res,id,self=false){
    const result=remove(id,self?req.designerActivityId:null);
    if(result.status)return fail(res,result.status,result.code,result.message);
    if(self)clearDesignerSession(req,res);
    for(const key of result.files){
      if(typeof key==='string'&&path.basename(key)===key)await fs.promises.unlink(path.join(imagesDir,key)).catch(error=>{if(error.code!=='ENOENT')console.error('Deleted designer image cleanup failed:',error.code);});
    }
    return res.set('Cache-Control','no-store').json({deleted:true});
  }
  app.delete('/api/my/designer-account',authDesigner,origin,async(req,res,next)=>{
    try{
      if(req.body?.confirmation!=='DELETE')return fail(res,422,'confirmation_required','Type DELETE to confirm account deletion.');
      const session=req.designerSessionHash&&db.prepare('SELECT created_at,credential_hash FROM designer_sessions WHERE session_hash=? AND designer_id=?').get(req.designerSessionHash,req.designerId);
      if(!session||session.credential_hash||!Number.isFinite(Date.parse(session.created_at))||Date.now()-Date.parse(session.created_at)<0||Date.now()-Date.parse(session.created_at)>15*60*1000)return fail(res,403,'recent_signin_required','For security, sign out and sign in with a fresh email code before deleting your account.');
      return await finish(req,res,req.designerId,true);
    }catch(error){next(error);}
  });
  app.delete('/api/admin/designers/account',authAdmin,origin,async(req,res,next)=>{
    try{
      if(req.body?.confirmation!=='DELETE')return fail(res,422,'confirmation_required','Type DELETE to confirm account deletion.');
      const email=String(req.body?.email||'').trim().toLowerCase();
      if(!email)return fail(res,422,'email_required','Enter the exact designer account email.');
      const profile=db.prepare('SELECT id FROM designer_profiles WHERE lower(email)=?').get(email);
      if(!profile)return fail(res,404,'designer_not_found','Designer account not found.');
      return await finish(req,res,profile.id);
    }catch(error){next(error);}
  });
}
module.exports={registerDesignerAccountDeletion};
