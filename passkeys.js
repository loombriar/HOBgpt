const crypto=require('node:crypto');
const webauthn=require('@simplewebauthn/server');
const {isTrustedRequestOrigin}=require('./lib/request-origin');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const COOKIE='hob_passkey_challenge';
function sessionIsValid(db,sessionHash){
 const entry=db.prepare('SELECT p.id FROM passkey_sessions s LEFT JOIN account_passkeys p ON p.id=s.credential_id WHERE s.session_hash=?').get(sessionHash);
 return !entry||Boolean(entry.id);
}
function registerPasskeys({app,db,fail,rateLimit,trustedAppOrigin,identity,issueSession}){
 db.exec(`CREATE TABLE IF NOT EXISTS passkey_users(kind TEXT NOT NULL,account_id TEXT NOT NULL,handle TEXT NOT NULL UNIQUE,PRIMARY KEY(kind,account_id));
 CREATE TABLE IF NOT EXISTS account_passkeys(id TEXT PRIMARY KEY,kind TEXT NOT NULL,account_id TEXT NOT NULL,user_handle TEXT NOT NULL,public_key BLOB NOT NULL,counter INTEGER NOT NULL,transports TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT,rp_id TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS passkey_owner ON account_passkeys(kind,account_id);
 CREATE TABLE IF NOT EXISTS passkey_challenges(id_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,purpose TEXT NOT NULL,account_id TEXT,session_hash TEXT,challenge TEXT NOT NULL,origin TEXT NOT NULL,rp_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS passkey_sessions(session_hash TEXT PRIMARY KEY,credential_id TEXT NOT NULL);`);
 const limit=rateLimit({windowMs:15*60000,max:30,keyPrefix:'passkeys'});
 function origin(req,res,next){
  res.set('Cache-Control','no-store');
  if(!isTrustedRequestOrigin(req,trustedAppOrigin(req)))return fail(res,403,'invalid_origin','This request did not come from House of Briar.');
  const configured=new URL(trustedAppOrigin(req)), incoming=new URL(req.get('origin')||configured.origin);
  if(configured.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(configured.hostname))return fail(res,503,'passkeys_unavailable','Passkeys require a secure connection.');
  // The RP comes from server configuration, never an arbitrary Host or forwarded header.
  if(incoming.hostname!==configured.hostname&&!incoming.hostname.endsWith('.'+configured.hostname))return fail(res,403,'invalid_origin','Use the main House of Briar address for passkeys.');
  req.passkeyOrigin=incoming.origin;req.passkeyRP=configured.hostname;
  next();
 }
 function kind(req,res,next){if(!['customer','designer'].includes(req.params.kind))return fail(res,404,'not_found','Account type not found.');next();}
 const route='/api/passkeys/:kind';
 function account(req,res,recent=false){
  const a=identity(req,req.params.kind);
  if(!a)return fail(res,401,'signin_required','Sign in by email before managing passkeys.'),null;
  if(recent&&(!a.verified||Date.now()-Date.parse(a.createdAt)>15*60000))return fail(res,403,'recent_signin_required','Sign out and sign in again by email before changing passkeys.'),null;
  return a;
 }
 function saveChallenge(req,res,purpose,options,a){
  const token=crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM passkey_challenges WHERE expires_at<=?').run(Date.now());
  db.prepare('INSERT INTO passkey_challenges VALUES (?,?,?,?,?,?,?,?,?)').run(hash(token),req.params.kind,purpose,a?.id||null,a?.sessionHash||null,options.challenge,req.passkeyOrigin,req.passkeyRP,Date.now()+300000);
  res.cookie(COOKIE,token,{httpOnly:true,secure:req.passkeyOrigin.startsWith('https:'),sameSite:'strict',path:'/api/passkeys',maxAge:300000});
  return res.json({options});
 }
 function consume(req,res,purpose,a){
  const token=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const row=db.transaction(()=>{const r=db.prepare('SELECT * FROM passkey_challenges WHERE id_hash=?').get(hash(token));db.prepare('DELETE FROM passkey_challenges WHERE id_hash=?').run(hash(token));return r;}).immediate();
  res.cookie(COOKIE,'',{httpOnly:true,secure:req.passkeyOrigin.startsWith('https:'),sameSite:'strict',path:'/api/passkeys',maxAge:0});
  if(!row||row.expires_at<=Date.now()||row.kind!==req.params.kind||row.purpose!==purpose||row.origin!==req.passkeyOrigin||row.rp_id!==req.passkeyRP|| (a&&(row.account_id!==a.id||row.session_hash!==a.sessionHash)))return null;
  return row;
 }
 function error(res){return fail(res,400,'passkey_failed','Passkey verification could not complete. Try again or sign in by email.');}
 app.get(route,kind,(req,res)=>{
  res.set('Cache-Control','no-store');const a=account(req,res);if(!a)return;
  return res.json({items:db.prepare('SELECT id,name,created_at AS createdAt,last_used_at AS lastUsedAt FROM account_passkeys WHERE kind=? AND account_id=? ORDER BY created_at').all(req.params.kind,a.id)});
 });
 app.post(route+'/register/options',kind,origin,limit,async(req,res,next)=>{
  const a=account(req,res,true);if(!a)return;
  if(db.prepare('SELECT COUNT(*) n FROM account_passkeys WHERE kind=? AND account_id=?').get(req.params.kind,a.id).n>=10)return fail(res,422,'passkey_limit','Remove an old passkey before adding another.');
  try{
   db.prepare('INSERT OR IGNORE INTO passkey_users VALUES (?,?,?)').run(req.params.kind,a.id,crypto.randomBytes(32).toString('base64url'));
   const {handle}=db.prepare('SELECT handle FROM passkey_users WHERE kind=? AND account_id=?').get(req.params.kind,a.id);
   const options=await webauthn.generateRegistrationOptions({rpName:'House of Briar',rpID:req.passkeyRP,userID:Buffer.from(handle,'base64url'),userName:a.email,userDisplayName:(a.name||a.email)+' · '+(req.params.kind==='designer'?'Designer':'Customer'),attestationType:'none',supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:db.prepare('SELECT id,transports FROM account_passkeys WHERE kind=? AND account_id=? AND rp_id=?').all(req.params.kind,a.id,req.passkeyRP).map(p=>({id:p.id,transports:JSON.parse(p.transports)}))});
   return saveChallenge(req,res,'register',options,a);
  }catch(e){next(e);}
 });
 app.post(route+'/register/verify',kind,origin,limit,async(req,res)=>{
  const a=account(req,res,true);if(!a)return;const challenge=consume(req,res,'register',a);if(!challenge)return error(res);
  try{
   const result=await webauthn.verifyRegistrationResponse({response:req.body?.response,expectedChallenge:challenge.challenge,expectedOrigin:[challenge.origin,...require('./android-passkey-association').origins(challenge.rp_id)],expectedRPID:challenge.rp_id,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
   if(!result.verified||!result.registrationInfo)return error(res);
   const {credential}=result.registrationInfo;
   const user=db.prepare('SELECT handle FROM passkey_users WHERE kind=? AND account_id=?').get(req.params.kind,a.id);
   const name=String(req.body?.name||'My passkey').trim().slice(0,80)||'My passkey';
   db.transaction(()=>{
    const current=identity(req,req.params.kind);if(!current||current.id!==a.id||current.sessionHash!==a.sessionHash||!current.verified)throw Error('session changed');
    if(db.prepare('SELECT COUNT(*) n FROM account_passkeys WHERE kind=? AND account_id=?').get(req.params.kind,a.id).n>=10)throw Error('limit');
    db.prepare('INSERT INTO account_passkeys VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(credential.id,req.params.kind,a.id,user.handle,Buffer.from(credential.publicKey),credential.counter,JSON.stringify(credential.transports||[]),name,new Date().toISOString(),null,challenge.rp_id);
   }).immediate();
   return res.status(201).json({ok:true});
  }catch{return error(res);}
 });
 app.post(route+'/signin/options',kind,origin,limit,async(req,res,next)=>{
  try{const options=await webauthn.generateAuthenticationOptions({rpID:req.passkeyRP,userVerification:'required',allowCredentials:[]});return saveChallenge(req,res,'signin',options);}catch(e){next(e);}
 });
 app.post(route+'/signin/verify',kind,origin,limit,async(req,res)=>{
  const challenge=consume(req,res,'signin');if(!challenge)return error(res);
  try{
   const response=req.body?.response;
   const p=db.prepare('SELECT * FROM account_passkeys WHERE id=? AND kind=? AND rp_id=?').get(response?.id||'',req.params.kind,challenge.rp_id);
   if(!p||response?.response?.userHandle!==p.user_handle)return error(res);
   const result=await webauthn.verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:[challenge.origin,...require('./android-passkey-association').origins(challenge.rp_id)],expectedRPID:challenge.rp_id,requireUserVerification:true,credential:{id:p.id,publicKey:new Uint8Array(p.public_key),counter:p.counter,transports:JSON.parse(p.transports)}});
   if(!result.verified)return error(res);
   const issued=db.transaction(()=>{
    const updated=db.prepare('UPDATE account_passkeys SET counter=?,last_used_at=? WHERE id=? AND counter=?').run(result.authenticationInfo.newCounter,new Date().toISOString(),p.id,p.counter);
    if(updated.changes!==1)return false;
    const sessionHash=issueSession(req,res,req.params.kind,p.account_id);if(!sessionHash)throw Error('account unavailable');
    db.prepare('INSERT INTO passkey_sessions VALUES (?,?)').run(sessionHash,p.id);return true;
   }).immediate();
   if(!issued)return error(res);
   return res.json({ok:true});
  }catch{return error(res);}
 });
 app.delete(route+'/:credentialId',kind,origin,limit,(req,res)=>{
  const a=account(req,res,true);if(!a)return;
  const removed=db.transaction(()=>{
   const key=db.prepare('SELECT id FROM account_passkeys WHERE id=? AND kind=? AND account_id=?').get(req.params.credentialId,req.params.kind,a.id);if(!key)return false;
   const sessions=req.params.kind==='customer'?'customer_sessions':'designer_sessions';
   db.prepare('DELETE FROM '+sessions+' WHERE session_hash IN (SELECT session_hash FROM passkey_sessions WHERE credential_id=?)').run(key.id);
   db.prepare('DELETE FROM passkey_sessions WHERE credential_id=?').run(key.id);
   db.prepare('DELETE FROM account_passkeys WHERE id=?').run(key.id);return true;
  }).immediate();
  if(!removed)return fail(res,404,'not_found','Passkey not found.');
  return res.json({ok:true});
 });
}
module.exports={registerPasskeys,sessionIsValid};
