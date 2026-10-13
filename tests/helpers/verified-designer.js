const crypto=require('node:crypto');
// Tests control their local mailbox challenge instead of using real email.
async function verifiedSignup(origin,db,body){
  const response=await fetch(origin+'/api/designer-applications',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const pending=await response.json();
  if(response.status!==202)return {response,body:pending};
  const code='123456';
  db.prepare('UPDATE designer_login_challenges SET code_hash=? WHERE id=?').run(crypto.createHash('sha256').update(pending.requestId+':'+code).digest('hex'),pending.requestId);
  const verified=await fetch(origin+'/api/designer/verify-code',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId:pending.requestId,code})});
  return {response:verified,body:await verified.json(),cookie:(verified.headers.get('set-cookie')||'').split(';')[0]};
}
module.exports={verifiedSignup};
