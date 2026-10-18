const crypto=require('node:crypto');
const {dailyTraffic}=require('./lib/daily-traffic');
const {isTrustedRequestOrigin}=require('./lib/request-origin');
const {clientAddress}=require('./lib/client-address');
const COOKIE='hob_customer_session';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createCustomerAccounts({app,db,fail,authAdmin,deliverEmail,trustedAppOrigin,clearDesignerSession,imagesDir}){
 db.exec(`CREATE TABLE IF NOT EXISTS customer_accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,created_at TEXT NOT NULL,rules_accepted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_login_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,code_hash TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_sessions(session_hash TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customer_accounts(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_auth_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS customer_accounts_created ON customer_accounts(created_at);`);

 // Encryption key must be a stable 32-byte hex secret, distinct from session keys.
 const measurementKeyHex=process.env.MEASUREMENT_ENCRYPTION_KEY||'';
 const measurementKey=/^[0-9a-fA-F]{64}$/.test(measurementKeyHex)?Buffer.from(measurementKeyHex,'hex'):null;
 db.exec(`CREATE TABLE IF NOT EXISTS customer_measurement_profiles (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
  encrypted_payload TEXT NOT NULL, created_at TEXT NOT NULL
 ); CREATE INDEX IF NOT EXISTS customer_measurement_owner ON customer_measurement_profiles(customer_id);`);
 if(process.env.NODE_ENV==='production'&&!measurementKey)throw new Error('MEASUREMENT_ENCRYPTION_KEY must be configured as 64 hex characters in production.');
 function encryptProfile(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',measurementKey,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
 }
 function decryptProfile(encoded){
  const raw=Buffer.from(encoded,'base64'),iv=raw.subarray(0,12),tag=raw.subarray(12,28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',measurementKey,iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8'));
 }
 function validateProfile(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const label=typeof body.label==='string'?body.label.trim():'';
  if(!label||label.length>80)return null;
  const profile={label};
  for(const key of ['bust','waist','hips','height',...(body.inseam!==undefined?['inseam']:[])]){
   const raw=body[key]==null?'':String(body[key]).trim();
   if(raw&&(!/^\d+(?:\.\d{1,2})?$/.test(raw)||Number(raw)<=0||Number(raw)>150))return null;
   profile[key]=raw;
  }
  if(typeof body.notes!=='string'&&body.notes!=null)return null;
  profile.notes=(body.notes||'').trim();
  if(profile.notes.length>500)return null;
  return profile;
 }
 function measurementAccess(req,res){
  const identity=authenticate(req);
  if(!identity){fail(res,401,'unauthorized','Sign in to manage saved measurements.');return null;}
  if(!measurementKey){fail(res,503,'measurements_unavailable','Secure measurement storage is not configured.');return null;}
  return identity;
 }
 app.get('/api/customer/measurements',(req,res)=>{
  const identity=measurementAccess(req,res);if(!identity)return;
  const rows=db.prepare('SELECT id,encrypted_payload FROM customer_measurement_profiles WHERE customer_id=? ORDER BY created_at,id').all(identity.customerId);
  return res.set('Cache-Control','no-store').json({profiles:rows.map(row=>({id:row.id,...decryptProfile(row.encrypted_payload)}))});
 });
 app.post('/api/customer/measurements',origin,(req,res)=>{
  const identity=measurementAccess(req,res);if(!identity)return;
  const profile=validateProfile(req.body);if(!profile)return fail(res,422,'invalid_measurements','Enter a profile name and valid measurements.');
  if(db.prepare('SELECT COUNT(*) AS n FROM customer_measurement_profiles WHERE customer_id=?').get(identity.customerId).n>=20)return fail(res,422,'profile_limit','A maximum of 20 profiles is allowed.');
  const id=crypto.randomUUID();
  db.prepare('INSERT INTO customer_measurement_profiles(id,customer_id,encrypted_payload,created_at) VALUES(?,?,?,?)').run(id,identity.customerId,encryptProfile(profile),new Date().toISOString());
  return res.set('Cache-Control','no-store').status(201).json({profile:{id,...profile}});
 });
 app.delete('/api/customer/measurements/:id',origin,(req,res)=>{
  const identity=measurementAccess(req,res);if(!identity)return;
  const result=db.prepare('DELETE FROM customer_measurement_profiles WHERE id=? AND customer_id=?').run(req.params.id,identity.customerId);
  if(!result.changes)return fail(res,404,'profile_not_found','Measurement profile not found.');
  return res.set('Cache-Control','no-store').json({ok:true});
 });
 function cookie(req){const part=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));return part?part.slice(COOKIE.length+1):'';}
 function authenticate(req){const token=cookie(req);if(!token)return null;const row=db.prepare('SELECT a.*,s.expires_at FROM customer_sessions s JOIN customer_accounts a ON a.id=s.customer_id WHERE s.session_hash=?').get(hash(token));return row&&row.expires_at>new Date().toISOString()&&require('./reviewer-auth').validReviewerSession(db,hash(token))&&require('./passkeys').sessionIsValid(db,hash(token))?{sub:'customer:'+row.id,email:row.email,name:row.display_name,customerId:row.id,email_verified:true}:null;}
 function origin(req,res,next){if(!isTrustedRequestOrigin(req,trustedAppOrigin(req)))return fail(res,403,'invalid_origin','This request did not come from House of Briar.');return next();}
 function clearSession(req,res){const token=cookie(req);if(!token)return;db.prepare('DELETE FROM customer_sessions WHERE session_hash=?').run(hash(token));res.cookie(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:0});}
 function issuePasskeySession(req,res,accountId){
  if(!db.prepare('SELECT 1 FROM customer_accounts WHERE id=?').get(accountId))return null;
  clearDesignerSession(req,res);clearSession(req,res);
  const token=crypto.randomBytes(32).toString('base64url'),sessionHash=hash(token),now=new Date().toISOString();
  db.prepare('INSERT INTO customer_sessions VALUES (?,?,?,?)').run(sessionHash,accountId,now,new Date(Date.now()+7*86400000).toISOString());
  res.cookie(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:7*86400000});
  return sessionHash;
 }
 function passkeyIdentity(req){
  const a=authenticate(req);if(!a)return null;const sessionHash=hash(cookie(req));
  if(db.prepare('SELECT 1 FROM reviewer_sessions WHERE session_hash=?').get(sessionHash))return null;
  const session=db.prepare('SELECT created_at FROM customer_sessions WHERE session_hash=?').get(sessionHash);
  return {id:a.customerId,email:a.email,name:a.name,createdAt:session.created_at,sessionHash,verified:true};
 }
 const consume=db.transaction((key,max)=>{const now=Date.now(),row=db.prepare('SELECT hits,reset_at FROM customer_auth_limits WHERE key=?').get(key);if(!row||row.reset_at<=now){db.prepare('INSERT INTO customer_auth_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=1,reset_at=excluded.reset_at').run(key,now+3600000);return true;}if(row.hits>=max)return false;db.prepare('UPDATE customer_auth_limits SET hits=hits+1 WHERE key=?').run(key);return true;});
 app.post('/api/customer/signin-code',origin,async(req,res,next)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length>80)return fail(res,422,'invalid_email','Enter a valid email and a name of 80 characters or fewer.');
  if(!consume.immediate(hash('email:'+email),5)||!consume.immediate(hash('ip:'+clientAddress(req)),40)){res.set('Retry-After','3600');return fail(res,429,'rate_limited','Too many sign-in requests. Try again later.');}
  if(req.body?.acceptedRules!==true)return fail(res,422,'rules_required','Agree to the House rules before continuing.');
  const previous=db.prepare('SELECT created_at FROM customer_login_challenges WHERE email=?').get(email);
  if(previous&&Date.now()-Date.parse(previous.created_at)<60000){res.set('Retry-After','60');return fail(res,429,'rate_limited','Wait a minute before requesting another code.');}
  const id=crypto.randomUUID(),code=crypto.randomInt(0,1000000).toString().padStart(6,'0'),now=new Date().toISOString();
  db.prepare('INSERT INTO customer_login_challenges (id,email,display_name,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET id=excluded.id,display_name=excluded.display_name,code_hash=excluded.code_hash,attempts=0,created_at=excluded.created_at,expires_at=excluded.expires_at').run(id,email,name||'House guest',hash(id+':'+code),now,new Date(Date.now()+15*60000).toISOString());
  try{
   const delivered=await deliverEmail({to:email,subject:'Your House of Briar sign-in code',text:`Your code is ${code}. It expires in 15 minutes. Use it to sign in or finish creating your optional customer account. If you did not request this, ignore this email.`,idempotencyKey:'customer-signin:'+id});
   if(!delivered)throw new Error('Delivery unavailable');
   return res.set('Cache-Control','no-store').status(202).json({requestId:id,message:'Check your email for a six-digit code. Delivery may take a few minutes.'});
  }catch{
   db.prepare('DELETE FROM customer_login_challenges WHERE id=?').run(id);
   return fail(res,503,'verification_email_unavailable','The verification email could not be sent. Please try again later.');
  }
 });
 app.post('/api/customer/verify-code',origin,(req,res)=>{
  if(!consume.immediate(hash('verify-ip:'+clientAddress(req)),100))return fail(res,429,'rate_limited','Too many attempts. Try again later.');
  const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';const code=typeof req.body?.code==='string'?req.body.code:'';
  const result=db.transaction(()=>{
   const challenge=db.prepare('SELECT * FROM customer_login_challenges WHERE id=?').get(requestId);
   if(!challenge||challenge.expires_at<=new Date().toISOString()||challenge.attempts>=5)return null;
   db.prepare('UPDATE customer_login_challenges SET attempts=attempts+1 WHERE id=?').run(requestId);
   if(!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(hash(requestId+':'+code)),Buffer.from(challenge.code_hash)))return null;
   const now=new Date().toISOString();const created=db.prepare('INSERT OR IGNORE INTO customer_accounts VALUES (?,?,?,?,?)').run(crypto.randomUUID(),challenge.email,challenge.display_name,now,now).changes;
   const account=db.prepare('SELECT * FROM customer_accounts WHERE email=?').get(challenge.email);
   db.prepare('DELETE FROM customer_login_challenges WHERE id=?').run(requestId);
   const token=crypto.randomBytes(32).toString('base64url');
   const old=cookie(req);if(old)db.prepare('DELETE FROM customer_sessions WHERE session_hash=?').run(hash(old));
   db.prepare('INSERT INTO customer_sessions VALUES (?,?,?,?)').run(hash(token),account.id,now,new Date(Date.now()+7*86400000).toISOString());
   db.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').run(now);db.prepare('DELETE FROM customer_login_challenges WHERE expires_at<=?').run(now);db.prepare('DELETE FROM customer_auth_limits WHERE reset_at<=?').run(Date.now());
   return {account,token,created:Boolean(created)};
  }).immediate();
  if(!result)return fail(res,401,'invalid_code','That code is invalid or expired. Request a new code.');
  clearDesignerSession(req,res);
  res.cookie(COOKIE,result.token,{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:7*86400000});
  return res.set('Cache-Control','no-store').json({customer:{id:result.account.id,name:result.account.display_name,email:result.account.email},created:result.created});
 });
 app.get('/api/customer/session',(req,res)=>{const identity=authenticate(req);res.set('Cache-Control','no-store');if(!identity)return fail(res,401,'unauthorized','Sign in to your customer account.');return res.json({customer:{id:identity.customerId,name:identity.name,email:identity.email}});});
 app.delete('/api/customer/session',origin,(req,res)=>{clearSession(req,res);return res.set('Cache-Control','no-store').json({ok:true});});
 app.delete('/api/customer/account',origin,(req,res)=>{
  const identity=authenticate(req);
  if(!identity)return fail(res,401,'unauthorized','Sign in before deleting your account.');
  const session=db.prepare('SELECT created_at FROM customer_sessions WHERE session_hash=? AND customer_id=?').get(hash(cookie(req)),identity.customerId);
  if(!session||Date.now()-Date.parse(session.created_at)>15*60*1000)return fail(res,403,'recent_signin_required','For security, sign out and sign in again before deleting your account.');
  if(req.body?.confirmation!=='DELETE')return fail(res,422,'confirmation_required','Type DELETE to confirm account deletion.');
  const subject='customer:'+identity.customerId;
  if(db.prepare("SELECT 1 FROM portfolio_billing WHERE owner_subject=? AND (subscription_id IS NOT NULL OR checkout_id IS NOT NULL)").get(subject))return fail(res,409,'subscription_requires_review','Cancel your subscription and contact House support to close billing records before deleting your account.');
  // Financial and correspondence records must be reviewed rather than silently orphaned.
  const protectedTables=['orders','donations','collector_notes','listing_inquiries','support_messages','special_order_offers','creative_inquiries'];
  for(const table of protectedTables){
    const columns=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
    const conditions=[];const values=[];
    for(const col of ['buyer_subject','sender_subject','recipient_subject'])if(columns.includes(col)){conditions.push(col+'=?');values.push(subject);}
    for(const col of ['buyer_email'])if(columns.includes(col)){conditions.push(col+'=?');values.push(identity.email);}
    if(conditions.length&&db.prepare('SELECT 1 FROM '+table+' WHERE '+conditions.join(' OR ')+' LIMIT 1').get(...values))
      return fail(res,409,'account_records_require_review','Your account has orders, donations, or messages that need a privacy review before deletion. Contact House of Briar support.');
  }
  const portfolioFiles=db.prepare('SELECT storage_key FROM portfolio_images WHERE owner_subject=?').all(subject);
  db.transaction(()=>{
    db.prepare('DELETE FROM portfolio_images WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM portfolio_settings WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM portfolio_views WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM portfolio_billing WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM creative_profiles WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM creative_event_profiles WHERE owner_subject=?').run(subject);
    db.prepare('DELETE FROM buyer_favorites WHERE buyer_subject=?').run(subject);
    db.prepare('DELETE FROM customer_measurement_profiles WHERE customer_id=?').run(identity.customerId);
    db.prepare('DELETE FROM user_badges WHERE buyer_subject=?').run(subject);
    db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(identity.customerId);
    db.prepare('DELETE FROM customer_login_challenges WHERE email=?').run(identity.email);
    db.prepare("DELETE FROM reviewer_sessions WHERE role='customer' AND EXISTS(SELECT 1 FROM reviewer_credentials WHERE role='customer' AND account_id=?)").run(identity.customerId);
    db.prepare("DELETE FROM reviewer_credentials WHERE role='customer' AND account_id=?").run(identity.customerId);
    db.prepare("DELETE FROM passkey_sessions WHERE credential_id IN (SELECT id FROM account_passkeys WHERE kind='customer' AND account_id=?)").run(identity.customerId);
    db.prepare("DELETE FROM account_passkeys WHERE kind='customer' AND account_id=?").run(identity.customerId);
    db.prepare("DELETE FROM passkey_users WHERE kind='customer' AND account_id=?").run(identity.customerId);
    db.prepare("DELETE FROM passkey_challenges WHERE kind='customer' AND account_id=?").run(identity.customerId);
    db.prepare('DELETE FROM customer_accounts WHERE id=?').run(identity.customerId);
  }).immediate();
  for(const image of portfolioFiles)if(imagesDir)require('node:fs').unlink(require('node:path').join(imagesDir,image.storage_key),()=>{});
  res.cookie(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:0});
  return res.set('Cache-Control','no-store').json({ok:true});
 });
 app.get('/api/admin/customer-signups',authAdmin,(_req,res)=>{
  const rows=db.prepare('SELECT id,created_at FROM customer_accounts WHERE created_at>=?').all(new Date(Date.now()-31*86400000).toISOString());
  const started=db.prepare('SELECT MIN(created_at) started FROM customer_accounts').get().started;
  const calendar=dailyTraffic(rows.map(r=>({...r,session_id:r.id})),new Date(),30,started||new Date());
  const daily=calendar.daily.map(r=>({day:r.day,signups:r.views}));
  return res.set('Cache-Control','no-store').json({customers:{total:db.prepare('SELECT COUNT(*) n FROM customer_accounts').get().n,today:calendar.today.views,last30Days:daily.reduce((sum,r)=>sum+r.signups,0),timeZone:calendar.timeZone,daily}});
 });
 return {authenticate,hasCookie:req=>Boolean(cookie(req)),clearSession,origin,issuePasskeySession,passkeyIdentity};
}
module.exports={createCustomerAccounts};
