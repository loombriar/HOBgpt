const crypto=require('node:crypto');
const {dailyTraffic}=require('./lib/daily-traffic');
const COOKIE='hob_customer_session';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createCustomerAccounts({app,db,fail,authAdmin,sendEmail,trustedAppOrigin,clearDesignerSession}){
 db.exec(`CREATE TABLE IF NOT EXISTS customer_accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,created_at TEXT NOT NULL,rules_accepted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_login_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,code_hash TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_sessions(session_hash TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customer_accounts(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_auth_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS customer_accounts_created ON customer_accounts(created_at);`);
 function cookie(req){const part=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));return part?part.slice(COOKIE.length+1):'';}
 function authenticate(req){const token=cookie(req);if(!token)return null;const row=db.prepare('SELECT a.*,s.expires_at FROM customer_sessions s JOIN customer_accounts a ON a.id=s.customer_id WHERE s.session_hash=?').get(hash(token));return row&&row.expires_at>new Date().toISOString()?{sub:'customer:'+row.id,email:row.email,name:row.display_name,customerId:row.id,email_verified:true}:null;}
 function origin(req,res,next){if(req.get('origin')!==trustedAppOrigin(req))return fail(res,403,'invalid_origin','This request did not come from House of Briar.');return next();}
 function clearSession(req,res){const token=cookie(req);if(!token)return;db.prepare('DELETE FROM customer_sessions WHERE session_hash=?').run(hash(token));res.cookie(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/',maxAge:0});}
 const consume=db.transaction((key,max)=>{const now=Date.now(),row=db.prepare('SELECT hits,reset_at FROM customer_auth_limits WHERE key=?').get(key);if(!row||row.reset_at<=now){db.prepare('INSERT INTO customer_auth_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=1,reset_at=excluded.reset_at').run(key,now+3600000);return true;}if(row.hits>=max)return false;db.prepare('UPDATE customer_auth_limits SET hits=hits+1 WHERE key=?').run(key);return true;});
 app.post('/api/customer/signin-code',origin,async(req,res,next)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length>80)return fail(res,422,'invalid_email','Enter a valid email and a name of 80 characters or fewer.');
  if(!consume.immediate(hash('email:'+email),5)||!consume.immediate(hash('ip:'+req.ip),40)){res.set('Retry-After','3600');return fail(res,429,'rate_limited','Too many sign-in requests. Try again later.');}
  if(req.body?.acceptedRules!==true)return fail(res,422,'rules_required','Agree to the House rules before continuing.');
  const previous=db.prepare('SELECT created_at FROM customer_login_challenges WHERE email=?').get(email);
  if(previous&&Date.now()-Date.parse(previous.created_at)<60000){res.set('Retry-After','60');return fail(res,429,'rate_limited','Wait a minute before requesting another code.');}
  const id=crypto.randomUUID(),code=crypto.randomInt(0,1000000).toString().padStart(6,'0'),now=new Date().toISOString();
  db.prepare('INSERT INTO customer_login_challenges (id,email,display_name,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET id=excluded.id,display_name=excluded.display_name,code_hash=excluded.code_hash,attempts=0,created_at=excluded.created_at,expires_at=excluded.expires_at').run(id,email,name||'House guest',hash(id+':'+code),now,new Date(Date.now()+15*60000).toISOString());
  try{await sendEmail({to:email,subject:'Your House of Briar sign-in code',text:`Your code is ${code}. It expires in 15 minutes. Use it to sign in or finish creating your optional customer account. If you did not request this, ignore this email.`,eventKey:'customer-signin:'+id});return res.set('Cache-Control','no-store').status(202).json({requestId:id,message:'Check your email for a six-digit code. Delivery may take a few minutes.'});}catch(error){db.prepare('DELETE FROM customer_login_challenges WHERE id=?').run(id);return next(error);}
 });
 app.post('/api/customer/verify-code',origin,(req,res)=>{
  if(!consume.immediate(hash('verify-ip:'+req.ip),100))return fail(res,429,'rate_limited','Too many attempts. Try again later.');
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
  if(req.body?.confirmation!=='DELETE')return fail(res,422,'confirmation_required','Type DELETE to confirm account deletion.');
  const subject='customer:'+identity.customerId;
  // Financial and correspondence records must be reviewed rather than silently orphaned.
  const protectedTables=['orders','donations','collector_notes','listing_inquiries','support_messages','special_order_offers'];
  for(const table of protectedTables){
    const columns=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
    const conditions=[];const values=[];
    for(const col of ['buyer_subject','sender_subject'])if(columns.includes(col)){conditions.push(col+'=?');values.push(subject);}
    for(const col of ['buyer_email'])if(columns.includes(col)){conditions.push(col+'=?');values.push(identity.email);}
    if(conditions.length&&db.prepare('SELECT 1 FROM '+table+' WHERE '+conditions.join(' OR ')+' LIMIT 1').get(...values))
      return fail(res,409,'account_records_require_review','Your account has orders, donations, or messages that need a privacy review before deletion. Contact House of Briar support.');
  }
  db.transaction(()=>{
    db.prepare('DELETE FROM buyer_favorites WHERE buyer_subject=?').run(subject);
    db.prepare('DELETE FROM user_badges WHERE buyer_subject=?').run(subject);
    db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(identity.customerId);
    db.prepare('DELETE FROM customer_login_challenges WHERE email=?').run(identity.email);
    db.prepare('DELETE FROM customer_accounts WHERE id=?').run(identity.customerId);
  }).immediate();
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
 return {authenticate,hasCookie:req=>Boolean(cookie(req)),clearSession,origin};
}
module.exports={createCustomerAccounts};
