function mountPostageRefunds({app,db,authDesigner,context,key,providerFetch,publicLabel,saved,accounting}) {
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_label_refunds (transaction_id TEXT PRIMARY KEY,order_id TEXT NOT NULL,designer_id TEXT NOT NULL,refund_id TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const error=message=>Object.assign(new Error(message),{statusCode:409});
  const get=req=>{const label=saved(req);return label?.transaction_id?db.prepare('SELECT * FROM shipping_label_refunds WHERE transaction_id=? AND order_id=? AND designer_id=?').get(label.transaction_id,req.params.orderId,req.designerId):null;};
  const answer=(req,res)=>res.json({label:publicLabel(saved(req)),cancellation:get(req)||null});
  async function read(req,label) {
    const response=await providerFetch(`https://api.goshippo.com/transactions/${encodeURIComponent(label.transaction_id)}/`,{signal:AbortSignal.timeout(20000),headers:{Authorization:`ShippoToken ${key()}`,'SHIPPO-API-VERSION':'2018-02-08'}});
    if(!response.ok)throw error('Carrier status could not be checked. The postage hold remains.');
    const tx=await response.json();
    if(tx.test!==true||tx.object_id!==label.transaction_id||tx.metadata!==`hob-test:${req.params.orderId}:${req.designerId}`.slice(0,100)||(typeof tx.rate==='string'?tx.rate:tx.rate?.object_id)!==label.rate_id)throw error('Carrier response does not match this test label.');
    return tx;
  }
  async function check(req) {
    const label=saved(req),refund=get(req);
    if(!label?.transaction_id||!refund)throw error('No label cancellation request exists.');
    const tx=await read(req,label);
    db.transaction(()=>{
      if(tx.status==='REFUNDED') {
        accounting.refundState(label.transaction_id,'refunded');
        db.prepare("UPDATE shipping_label_refunds SET status='refunded',updated_at=? WHERE transaction_id=?").run(new Date().toISOString(),label.transaction_id);
        db.prepare("UPDATE shipping_labels SET status='cancelled',label_url=NULL WHERE transaction_id=?").run(label.transaction_id);
      }else if(tx.status==='REFUNDREJECTED'&&refund.status!=='refunded') {
        accounting.refundState(label.transaction_id,'charged');
        db.prepare("UPDATE shipping_label_refunds SET status='rejected',updated_at=? WHERE transaction_id=?").run(new Date().toISOString(),label.transaction_id);
      }
    }).immediate();
  }
  app.post('/api/orders/:orderId/postage/cancel',authDesigner,async(req,res,next)=>{
    try{
      context(req,true);
      const label=saved(req);
      if(get(req))return answer(req,res);
      if(req.body?.confirmCancellation!==true)throw error('Confirm that this sample label is unused and should be cancelled.');
      if(!label||label.status!=='ready'||!label.transaction_id)throw error('Only a ready, unused sample label can be cancelled.');
      const tx=await read(req,label);
      if(!['SUCCESS','REFUNDED','REFUNDPENDING'].includes(tx.status)||tx.tracking_status&&!['UNKNOWN','PRE_TRANSIT'].includes(tx.tracking_status))throw error('This label may already be in use or is not eligible for cancellation.');
      const claimed=db.transaction(()=>{
        const inserted=db.prepare("INSERT OR IGNORE INTO shipping_label_refunds VALUES (?,?,?,NULL,'pending',?,?)").run(label.transaction_id,req.params.orderId,req.designerId,new Date().toISOString(),new Date().toISOString());
        if(inserted.changes)accounting.refundState(label.transaction_id,'refund_pending');
        return inserted.changes;
      }).immediate();
      if(!claimed)return answer(req,res);
      if(tx.status==='REFUNDED'||tx.status==='REFUNDPENDING'){await check(req);return answer(req,res);}
      try {
        const response=await providerFetch('https://api.goshippo.com/refunds/',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`ShippoToken ${key()}`,'Content-Type':'application/json','SHIPPO-API-VERSION':'2018-02-08'},body:JSON.stringify({transaction:label.transaction_id,async:false})});
        const refund=await response.json(),transaction=typeof refund.transaction==='string'?refund.transaction:refund.transaction?.object_id;
        if(!response.ok||!refund.object_id||transaction!==label.transaction_id)throw error('Refund outcome needs review.');
        db.prepare('UPDATE shipping_label_refunds SET refund_id=?,updated_at=? WHERE transaction_id=?').run(refund.object_id,new Date().toISOString(),label.transaction_id);
        await check(req);
      }catch(e){db.prepare("UPDATE shipping_label_refunds SET status=CASE WHEN status='refunded' THEN status ELSE 'unknown' END,updated_at=? WHERE transaction_id=?").run(new Date().toISOString(),label.transaction_id);}
      return answer(req,res);
    }catch(e){next(e);}
  });
  app.post('/api/orders/:orderId/postage/cancel/status',authDesigner,async(req,res,next)=>{
    try{context(req,true,true);await check(req);return answer(req,res);}catch(e){next(e);}
  });
}
module.exports={mountPostageRefunds};
