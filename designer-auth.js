const crypto = require('node:crypto');
const {isTrustedRequestOrigin} = require('./lib/request-origin');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function registerDesignerAuth({app,db,fail,rateLimit,trustedAppOrigin,deliverEmail,completeSignup,issueSession,termsVersion}) {
  db.exec(`CREATE TABLE IF NOT EXISTS designer_login_challenges (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pending_signup TEXT,
    code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS designer_email_auth_limits (
    email_hash TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at INTEGER NOT NULL
  )`);
  const requestLimit=rateLimit({windowMs:15*60*1000,max:10,keyPrefix:'designer-email-auth'});
  const verifyLimit=rateLimit({windowMs:15*60*1000,max:30,keyPrefix:'designer-email-auth-verify'});
  const emailLimit=db.transaction(email=>{
    const key=hash(email),now=Date.now();
    const row=db.prepare('SELECT * FROM designer_email_auth_limits WHERE email_hash=?').get(key);
    if(row&&row.reset_at>now&&row.hits>=5)return false;
    db.prepare(`INSERT INTO designer_email_auth_limits VALUES (?,1,?) ON CONFLICT(email_hash)
      DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`).run(key,now+3600000,now,now);
    return true;
  });
  function origin(req,res,next){
    if(!isTrustedRequestOrigin(req,trustedAppOrigin(req)))return fail(res,403,'invalid_origin','This request did not come from House of Briar.');
    return next();
  }
  async function requestCode(req,res,next,signup) {
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(res,422,'validation_error','Enter a valid email address.');
    let pending=null;
    if(signup){
      const displayName=String(req.body?.displayName||'').trim(),brandName=String(req.body?.brandName||'').trim();
      const categories=Array.isArray(req.body?.categories)?[...new Set(req.body.categories.map(v=>String(v).trim()).filter(Boolean))]:[];
      if(!displayName||displayName.length>100||!brandName||brandName.length>120||categories.length<1||categories.length>12||categories.some(v=>v.length>80))return fail(res,422,'validation_error','Add your name, designer or brand name, email, and what you create.');
      if(req.body?.sellerTermsAccepted!==true||req.body?.sellerTermsVersion!==termsVersion)return fail(res,422,'seller_terms_required','Read and agree to the current House of Briar Seller Terms before joining.');
      pending={email,displayName,brandName,categories};
    }
    if(!emailLimit.immediate(email)){res.set('Retry-After','3600');return fail(res,429,'rate_limited','Too many email-code requests. Try again later.');}
    const previous=db.prepare('SELECT created_at FROM designer_login_challenges WHERE email=?').get(email);
    if(previous&&Date.now()-Date.parse(previous.created_at)<60000){res.set('Retry-After','60');return fail(res,429,'rate_limited','Wait a minute before requesting another code.');}
    const id=crypto.randomUUID(),code=crypto.randomInt(0,1000000).toString().padStart(6,'0'),now=new Date().toISOString();
    db.prepare('DELETE FROM designer_login_challenges WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM designer_email_auth_limits WHERE reset_at<=?').run(Date.now());
    db.prepare(`INSERT INTO designer_login_challenges(id,email,pending_signup,code_hash,created_at,expires_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET id=excluded.id,pending_signup=excluded.pending_signup,
      code_hash=excluded.code_hash,attempts=0,created_at=excluded.created_at,expires_at=excluded.expires_at`).run(id,email,pending?JSON.stringify(pending):null,hash(id+':'+code),now,new Date(Date.now()+15*60000).toISOString());
    try {
      // Do not persist raw login codes in the email outbox.
      const delivered=await deliverEmail({to:email,subject:'Your House of Briar designer code',text:`Your designer code is ${code}. It expires in 15 minutes and can be used once. Enter it on House of Briar to verify your email and open your Designer's Room. If you did not request this, ignore this email.`});
      if(!delivered)throw new Error('Delivery unavailable');
      return res.status(202).json({requestId:id,message:'Check your email for a six-digit designer code. If this address can be used, the code will let you continue.'});
    } catch {
      db.prepare('DELETE FROM designer_login_challenges WHERE id=?').run(id);
      return fail(res,503,'verification_email_unavailable','The verification email could not be sent. Please try again later.');
    }
  }
  app.post('/api/designer-applications',origin,requestLimit,(req,res,next)=>requestCode(req,res,next,true));
  app.post('/api/designer/signin-code',origin,requestLimit,(req,res,next)=>requestCode(req,res,next,false));
  app.post('/api/designer/verify-code',origin,verifyLimit,(req,res,next)=>{
    try {
      const requestId=String(req.body?.requestId||''),code=String(req.body?.code||'');
      const result=db.transaction(()=>{
        const row=db.prepare('SELECT * FROM designer_login_challenges WHERE id=?').get(requestId);
        if(!row||row.expires_at<=new Date().toISOString()||row.attempts>=5)return null;
        db.prepare('UPDATE designer_login_challenges SET attempts=attempts+1 WHERE id=?').run(requestId);
        if(!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(hash(requestId+':'+code)),Buffer.from(row.code_hash)))return null;
        const existing=db.prepare('SELECT * FROM designer_profiles WHERE lower(email)=?').get(row.email);
        const designer=existing|| (row.pending_signup?completeSignup(JSON.parse(row.pending_signup)):null);
        db.prepare('DELETE FROM designer_login_challenges WHERE id=?').run(requestId);
        if(!designer||designer.status!=='active')return null;
        const now=new Date().toISOString();
        db.prepare('UPDATE designer_profiles SET email_verified_at=?,bearer_disabled_at=? WHERE id=?').run(now,now,designer.id);
        db.prepare('UPDATE designer_access_tokens SET revoked_at=? WHERE designer_id=?').run(now,designer.id);
        db.prepare('DELETE FROM designer_sessions WHERE designer_id=?').run(designer.id);
        return {designer};
      }).immediate();
      if(!result)return fail(res,401,'invalid_code','That code is invalid, expired, or unavailable. Request a new code.');
      issueSession(req,res,result.designer.id);
      const d=result.designer;
      return res.status(200).json({message:'Email verified. You can continue to your Designer Room.'});
    } catch(error){return next(error);}
  });
}
module.exports={registerDesignerAuth};
