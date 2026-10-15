// Durable requests retain exact parameters and the original key. Replays stop
// before Stripe's minimum 24-hour idempotency retention window can lapse.
function createStripeOperations({db, stripeApi, applyResult, onRejected = () => {}, now = () => Date.now()}) {
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_operations (
    operation_key TEXT PRIMARY KEY, kind TEXT NOT NULL, reference_id TEXT NOT NULL,
    endpoint TEXT NOT NULL, request_body TEXT NOT NULL, created_at TEXT NOT NULL,
    state TEXT NOT NULL, response_json TEXT, updated_at TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0
  )`);
  if(!db.prepare('PRAGMA table_info(stripe_operations)').all().some(c=>c.name==='attempt_count'))db.exec('ALTER TABLE stripe_operations ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0');
  const active = new Set();
  const windowMs = 23 * 60 * 60 * 1000;
  const rejected = error => !error.providerOutcomeUnknown && (error.checkoutNotCreated === true || [400,401,403,404].includes(error.providerStatus));
  async function execute(operation) {
    if(active.has(operation.operation_key))throw Object.assign(new Error('Payment operation is being resolved.'),{statusCode:409});
    active.add(operation.operation_key);
    try {
      if(operation.response_json) {
        const result=JSON.parse(operation.response_json);
        await applyResult(operation,result);
        db.prepare("UPDATE stripe_operations SET state='applied',updated_at=? WHERE operation_key=?").run(new Date(now()).toISOString(),operation.operation_key);
        return result;
      }
      if(operation.state==='rejected')throw Object.assign(new Error('Payment request was rejected; operator review is required.'),{statusCode:409,checkoutNotCreated:true});
      if(now()-Date.parse(operation.created_at)>=windowMs){
        db.prepare("UPDATE stripe_operations SET state='review_required',updated_at=? WHERE operation_key=?").run(new Date(now()).toISOString(),operation.operation_key);
        throw Object.assign(new Error('Unresolved payment requires provider review. Holds remain in place.'),{statusCode:409});
      }
      let result;
      // Persist the attempt before leaving the process. Any earlier attempt,
      // including one interrupted by a crash, makes an auth/validation rejection
      // on a later replay insufficient proof that the original did not happen.
      db.prepare("UPDATE stripe_operations SET attempt_count=attempt_count+1,state='unknown',updated_at=? WHERE operation_key=?").run(new Date(now()).toISOString(),operation.operation_key);
      try {
        result=await stripeApi(operation.endpoint,{method:'POST',body:operation.request_body,idempotencyKey:operation.operation_key});
        if(!result || typeof result.id!=='string' || !result.id)throw new Error('Payment provider returned no operation reference.');
      }catch(error){
        if(operation.attempt_count>0)error.providerOutcomeUnknown=true;
        db.prepare('UPDATE stripe_operations SET state=?,updated_at=? WHERE operation_key=?').run(rejected(error)?'rejected':'unknown',new Date(now()).toISOString(),operation.operation_key);
        if(rejected(error))onRejected(operation);
        throw error;
      }
      // Save the provider result before changing domain state: interrupted writes
      // can be completed without initiating another monetary operation.
      db.prepare("UPDATE stripe_operations SET state='received',response_json=?,updated_at=? WHERE operation_key=?").run(JSON.stringify(result),new Date(now()).toISOString(),operation.operation_key);
      await applyResult(operation,result);
      db.prepare("UPDATE stripe_operations SET state='applied',updated_at=? WHERE operation_key=?").run(new Date(now()).toISOString(),operation.operation_key);
      return result;
    }finally{active.delete(operation.operation_key);}
  }
  function claim(kind,referenceId,endpoint,{body,idempotencyKey}) {
    const timestamp=new Date(now()).toISOString();
    db.transaction(()=>{
      db.prepare("INSERT OR IGNORE INTO stripe_operations(operation_key,kind,reference_id,endpoint,request_body,created_at,state,response_json,updated_at) VALUES (?,?,?,?,?,?,'initiating',NULL,?)").run(idempotencyKey,kind,referenceId,endpoint,body,timestamp,timestamp);
      if(kind==='payout')db.prepare('UPDATE designer_transfers SET payout_in_flight=1 WHERE id=?').run(referenceId);
    }).immediate();
    const operation=db.prepare('SELECT * FROM stripe_operations WHERE operation_key=?').get(idempotencyKey);
    if(operation.kind!==kind||operation.reference_id!==referenceId||operation.endpoint!==endpoint||operation.request_body!==body)throw Object.assign(new Error('Payment retry parameters changed; operator review is required.'),{statusCode:409});
    return operation;
  }
  async function request(kind,referenceId,endpoint,options) {
    return execute(claim(kind,referenceId,endpoint,options));
  }
  let running=false;
  async function reconcile() {
    if(running)return {busy:true};
    running=true;
    const summary={checked:0,resolved:0,errors:0};
    try {
      const rows=db.prepare("SELECT * FROM stripe_operations WHERE state IN ('initiating','unknown','received') ORDER BY updated_at LIMIT 50").all();
      for(const operation of rows){
        if(active.has(operation.operation_key))continue;
        summary.checked++;
        try{await execute(operation);summary.resolved++;}catch{summary.errors++;}
      }
      return summary;
    }finally{running=false;}
  }
  return {claim,request,reconcile,rejected};
}
module.exports={createStripeOperations};
