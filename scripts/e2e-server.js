const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// This key is fixture-only; it encrypts disposable E2E data.
process.env.MEASUREMENT_ENCRYPTION_KEY=require('node:crypto').randomBytes(32).toString('hex');
const { createApp,SELLER_TERMS_VERSION }=require('../server');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-e2e-'));
const designerCodes=new Map();
const customerCodes=new Map();
const { app:houseApp,db }=createApp({
  dataDir,
  designerTokens:{'e2e-designer-token':'maker'},
  adminToken:'e2e-admin-token',
  sendEmail:async message=>{if(message.subject==='Your House of Briar designer code')designerCodes.set(message.to,message.text.match(/\b\d{6}\b/)[0]);if(message.subject==='Your House of Briar sign-in code')customerCodes.set(message.to,message.text.match(/\b\d{6}\b/)[0]);return true;},
  connectAccounts:{maker:'acct_e2e_maker'},
  seedProducts:[{id:'e2e-piece',designerId:'maker',title:'Moonlit E2E Piece',price:89.99,category:'fashion',shippingCostCents:0}],
  stripeApi:async(endpoint)=>{
    if(endpoint==='accounts/acct_e2e_maker')return{details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
    throw new Error('Unexpected E2E Stripe request: '+endpoint);
  }
});
db.prepare('UPDATE designer_profiles SET stripe_account_id=?,stripe_details_submitted=1,stripe_payouts_enabled=1,stripe_status_checked_at=CURRENT_TIMESTAMP WHERE id=?').run('acct_e2e_maker','maker');
db.prepare('INSERT OR IGNORE INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker',SELLER_TERMS_VERSION,new Date().toISOString(),'e2e-fixture');
const app=require('express')();
// This endpoint exists only in the isolated E2E fixture; never mount it in server.js.
app.get('/__test/customer-count',(req,res)=>res.json({count:db.prepare('SELECT COUNT(*) count FROM customer_accounts WHERE email=?').get(String(req.query.email||'')).count}));
app.get('/__test/customer-code', (req,res)=>{
  const code=customerCodes.get(String(req.query.email||''));if(!code)return res.status(404).json({});return res.json({code});
});
app.get('/__test/designer-code',(req,res)=>{const code=designerCodes.get(String(req.query.email||''));return code?res.json({code}):res.status(404).json({});});
app.use(houseApp);
const port=Number(process.env.PORT||4173);
const server=app.listen(port,'127.0.0.1',()=>console.log('E2E server listening on '+port));
const close=()=>server.close(()=>{db.close();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0)});
process.on('SIGINT',close);process.on('SIGTERM',close);
