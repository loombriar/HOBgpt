const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createPostageAccounting}=require('../lib/postage-accounting');
function fixture(testMode=false){
  const db=new Database(':memory:');
  db.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,payment_provider TEXT,stripe_session_id TEXT,refund_status TEXT);
    CREATE TABLE order_items(order_id TEXT,designer_id TEXT,line_total_cents INTEGER,platform_fee_cents INTEGER,designer_amount_cents INTEGER);
    CREATE TABLE designer_transfers(id TEXT PRIMARY KEY,order_id TEXT,designer_id TEXT,status TEXT,amount_cents INTEGER,payout_in_flight INTEGER DEFAULT 0);
    CREATE TABLE order_refunds(order_id TEXT,scope TEXT,status TEXT);
    CREATE TABLE shipping_labels(order_id TEXT,designer_id TEXT,transaction_id TEXT,cost_cents INTEGER,status TEXT,test_mode INTEGER,created_at INTEGER);`);
  db.prepare('INSERT INTO orders(id,payment_provider,stripe_session_id) VALUES (?,?,?)').run('order',testMode?'test_fixture':'stripe',testMode?'cs_test_fixture':'cs_live_fixture');
  db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)').run('order','designer',10000,900,9100);
  db.prepare('INSERT INTO designer_transfers(id,order_id,designer_id,status,amount_cents) VALUES (?,?,?,?,?)').run('transfer','order','designer','pending',9100);
  return {db,accounting:createPostageAccounting(db)};
}
test('live postage is deducted exactly once and payout freezes at net',()=>{
  const {db,accounting:a}=fixture();
  try{
    const c={transactionId:'live-tx',orderId:'order',designerId:'designer',costCents:425,testMode:false};
    a.charge(c);a.charge(c);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM postage_charges').get().n,1);
    assert.equal(a.summary('order','designer').netEarningsCents,8675);
    assert.equal(a.freezePayout('order','designer'),8675);
    assert.equal(db.prepare('SELECT amount_cents FROM designer_transfers').get().amount_cents,8675);
    assert.throws(()=>a.charge({...c,transactionId:'another'}));
  }finally{db.close();}
});
test('pending refund holds payout; confirmed refund restores earnings',()=>{
  const {db,accounting:a}=fixture();
  try{
    a.charge({transactionId:'tx',orderId:'order',designerId:'designer',costCents:425,testMode:false});
    a.refundState('tx','refund_pending');
    assert.equal(a.summary('order','designer').postageHold,true);
    assert.throws(()=>a.freezePayout('order','designer'));
    a.refundState('tx','refunded');
    assert.equal(a.summary('order','designer').netEarningsCents,9100);
    assert.equal(a.freezePayout('order','designer'),9100);
  }finally{db.close();}
});
test('live label cannot be imported into test ledger',()=>{
  const {db}=fixture();
  try{
    db.prepare('INSERT INTO shipping_labels VALUES (?,?,?,?,?,?,?)').run('order','designer','live-tx',500,'ready',0,Date.now());
    const a=createPostageAccounting(db);
    assert.equal(a.summary('order','designer').postageCents,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM postage_charges').get().n,0);
  }finally{db.close();}
});
test('test postage cannot reduce live order payout',()=>{
  const {db,accounting:a}=fixture();
  try{
    a.charge({transactionId:'test-tx',orderId:'order',designerId:'designer',costCents:500,testMode:true});
    assert.equal(a.summary('order','designer').netEarningsCents,9100);
  }finally{db.close();}
});
