const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const { createApp,SELLER_TERMS_VERSION }=require('../server');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hob-e2e-'));
const { app,db }=createApp({
  dataDir,
  designerTokens:{'e2e-designer-token':'maker'},
  adminToken:'e2e-admin-token',
  connectAccounts:{maker:'acct_e2e_maker'},
  seedProducts:[{id:'e2e-piece',designerId:'maker',title:'Moonlit E2E Piece',price:89.99,category:'fashion',shippingCostCents:0}],
  stripeApi:async(endpoint)=>{
    if(endpoint==='accounts/acct_e2e_maker')return{details_submitted:true,payouts_enabled:true,charges_enabled:true,requirements:{currently_due:[]}};
    throw new Error('Unexpected E2E Stripe request: '+endpoint);
  }
});
db.prepare('UPDATE designer_profiles SET stripe_account_id=? WHERE id=?').run('acct_e2e_maker','maker');
db.prepare('INSERT OR IGNORE INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run('maker',SELLER_TERMS_VERSION,new Date().toISOString(),'e2e-fixture');
const port=Number(process.env.PORT||4173);
const server=app.listen(port,'127.0.0.1',()=>console.log('E2E server listening on '+port));
const close=()=>server.close(()=>{db.close();fs.rmSync(dataDir,{recursive:true,force:true});process.exit(0)});
process.on('SIGINT',close);process.on('SIGTERM',close);
