const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {isTrustedRequestOrigin} = require('./lib/request-origin');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function initReviewerAuth(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS reviewer_credentials (
    role TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL,
    salt TEXT NOT NULL, password_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
  ); CREATE TABLE IF NOT EXISTS reviewer_sessions (
    session_hash TEXT PRIMARY KEY, role TEXT NOT NULL, password_hash TEXT NOT NULL
  );`);
}
function validReviewerSession(db, sessionHash) {
  const row = db.prepare(`SELECT s.password_hash,c.password_hash current_hash,c.enabled
    FROM reviewer_sessions s LEFT JOIN reviewer_credentials c ON c.role=s.role WHERE s.session_hash=?`).get(sessionHash);
  return !row || Boolean(row.enabled && row.password_hash === row.current_hash);
}
function registerReviewerAuth({app,db,fail,rateLimit,trustedAppOrigin,customerAccounts,authDesigner,issueDesignerSession,clearDesignerSession,email=''}) {
  const allowedEmail = String(email).trim().toLowerCase();
  // Removing/changing the allowlist disables old credentials and their sessions.
  db.prepare('UPDATE reviewer_credentials SET enabled=0 WHERE email<>? OR ?=\'\'').run(allowedEmail,allowedEmail);
  const origin=(req,res,next)=>isTrustedRequestOrigin(req,trustedAppOrigin(req))?next():fail(res,403,'invalid_origin','Use House of Briar to sign in.');
  const limit=rateLimit({windowMs:15*60*1000,max:10,keyPrefix:'reviewer-signin'});
  const roleOf=req=>['customer','designer'].includes(req.body?.role)?req.body.role:null;
  const tokenOf=(req,name)=>String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';
  app.get('/api/reviewer/status',(_req,res)=>res.set('Cache-Control','no-store').json({enabled:Boolean(allowedEmail),roles:['customer','designer']}));
  app.post('/api/reviewer/enroll',origin,limit,(req,res,next)=>req.body?.role==='designer'?authDesigner(req,res,next):next(),async(req,res,next)=>{
    try {
      const role=roleOf(req),password=req.body?.password;
      if(!role||typeof password!=='string'||password.length<16||password.length>128)return fail(res,422,'invalid_input','Choose a role and an app-only password of 16–128 characters.');
      let account,session;
      if(role==='customer') {
        const identity=customerAccounts.authenticate(req);
        if(identity) {
          account={id:identity.customerId,email:identity.email};
          session=db.prepare('SELECT created_at FROM customer_sessions WHERE session_hash=?').get(hash(tokenOf(req,'hob_customer_session')));
        }
      } else {
        // Only mailbox-verified cookie sessions can enroll; legacy tokens cannot.
        if(req.designerAuthMethod==='session') {
          account=db.prepare('SELECT id,email,email_verified_at FROM designer_profiles WHERE id=? AND status=\'active\'').get(req.designerId);
          session=db.prepare('SELECT created_at,credential_hash FROM designer_sessions WHERE session_hash=?').get(req.designerSessionHash);
          if(!account?.email_verified_at||session?.credential_hash)account=null;
        }
      }
      const cookieHash=hash(tokenOf(req,role==='customer'?'hob_customer_session':'hob_designer_session'));
      if(!allowedEmail||account?.email?.toLowerCase()!==allowedEmail||!session||Date.now()-Date.parse(session.created_at)>15*60000||db.prepare('SELECT 1 FROM reviewer_sessions WHERE session_hash=?').get(cookieHash))
        return fail(res,403,'verification_required','Sign in with the configured reviewer email using a fresh email code before setting a reviewer password.');
      const salt=crypto.randomBytes(16).toString('hex');
      const derived=await scrypt(password,salt,64);
      // The credential is bound to this verified account ID, never to an arbitrary email lookup.
      db.prepare(`INSERT INTO reviewer_credentials VALUES (?,?,?,?,?,1) ON CONFLICT(role) DO UPDATE SET account_id=excluded.account_id,email=excluded.email,salt=excluded.salt,password_hash=excluded.password_hash,enabled=1`).run(role,account.id,allowedEmail,salt,derived.toString('hex'));
      return res.set('Cache-Control','no-store').json({ok:true,role});
    }catch(error){next(error);}
  });
  app.post('/api/reviewer/signin',origin,limit,async(req,res,next)=>{
    try {
      const role=roleOf(req),email=String(req.body?.email||'').trim().toLowerCase(),password=req.body?.password;
      if(!role||typeof password!=='string'||password.length>128)return fail(res,401,'invalid_credentials','Reviewer sign-in failed. Check the account and password.');
      const row=db.prepare('SELECT * FROM reviewer_credentials WHERE role=?').get(role);
      const derived=await scrypt(password,row?.salt||'reviewer-unconfigured',64);
      const expected=row?Buffer.from(row.password_hash,'hex'):Buffer.alloc(64);
      if(!crypto.timingSafeEqual(derived,expected)||!row?.enabled||!allowedEmail||email!==allowedEmail||row.email!==allowedEmail)
        return fail(res,401,'invalid_credentials','Reviewer sign-in failed. Check the account and password.');
      if(role==='designer') {
        const account=db.prepare('SELECT email,email_verified_at,status FROM designer_profiles WHERE id=?').get(row.account_id);
        if(!account?.email_verified_at||account.status!=='active'||account.email.toLowerCase()!==email)return fail(res,401,'invalid_credentials','Reviewer sign-in failed.');
        const sessionHash=issueDesignerSession(req,res,row.account_id);
        db.prepare('INSERT INTO reviewer_sessions VALUES (?,?,?)').run(sessionHash,role,row.password_hash);
      } else {
        const account=db.prepare('SELECT email FROM customer_accounts WHERE id=?').get(row.account_id);
        if(account?.email!==email)return fail(res,401,'invalid_credentials','Reviewer sign-in failed.');
        clearDesignerSession(req,res);customerAccounts.clearSession(req,res);
        const token=crypto.randomBytes(32).toString('base64url'),now=new Date().toISOString();
        db.prepare('INSERT INTO customer_sessions VALUES (?,?,?,?)').run(hash(token),row.account_id,now,new Date(Date.now()+86400000).toISOString());
        db.prepare('INSERT INTO reviewer_sessions VALUES (?,?,?)').run(hash(token),role,row.password_hash);
        res.cookie('hob_customer_session',token,{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:86400000});
      }
      return res.set('Cache-Control','no-store').json({ok:true,redirect:role==='designer'?'/designers/room':'/'});
    }catch(error){next(error);}
  });
}
module.exports={initReviewerAuth,validReviewerSession,registerReviewerAuth};
