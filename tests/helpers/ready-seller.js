const {SELLER_TERMS_VERSION}=require('../../server');
module.exports = function readySeller(db, id) {
  db.prepare("UPDATE designer_profiles SET stripe_account_id=?,stripe_details_submitted=1,stripe_payouts_enabled=1,stripe_requirements_due='[]',stripe_status_checked_at=? WHERE id=?").run('acct_fixture_'+id,new Date().toISOString(),id);
  db.prepare('INSERT OR IGNORE INTO designer_terms_acceptances (designer_id,terms_version,accepted_at,acceptance_source) VALUES (?,?,?,?)').run(id,SELLER_TERMS_VERSION,new Date().toISOString(),'test-fixture');
};
