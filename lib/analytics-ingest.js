const crypto=require('node:crypto');
const fs=require('node:fs');
const {isTrustedRequestOrigin}=require('./request-origin');
const COOKIE='hob_analytics_guard';
const ALLOWED=new Set(['page_view','view_designer','view_product','search','add_to_wishlist','remove_from_wishlist','add_to_cart','remove_from_cart','view_cart','begin_checkout','checkout_abandoned','purchase']);
const LIMITS={sessionId:100,listingId:100,listingName:300,designer:200,currency:12,query:300,orderId:100,source:100,path:500,referrer:1000,utmSource:200,utmMedium:200,utmCampaign:300,designerId:100,deviceCategory:20};
function validateEvent(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||!ALLOWED.has(body.event))return {error:'Unknown commerce event.'};
  const value={event:body.event};
  const fields=body.event==='purchase'?['sessionId','orderId','utmSource','utmMedium','utmCampaign']:Object.keys(LIMITS);
  for(const key of fields){
    if(body[key]==null)continue;
    if(typeof body[key]!=='string'||body[key].length>LIMITS[key]||/[\u0000-\u001f\u007f]/.test(body[key]))return {error:'Send valid, bounded analytics fields.'};
    value[key]=body[key];
  }
  if(body.event==='purchase')return value.orderId?{value}:{error:'A paid order reference is required.'};
  if(!value.sessionId)return {error:'An analytics session identifier is required.'};
  if(value.path){if(!value.path.startsWith('/')||value.path.startsWith('//'))return {error:'Send a local page path.'};value.path=value.path.split(/[?#]/)[0];}
  if(value.deviceCategory&&!['mobile','tablet','desktop'].includes(value.deviceCategory))return {error:'Unknown device category.'};
  for(const key of ['value','resultCount','itemCount']){
    if(body[key]==null)continue;
    if(typeof body[key]!=='number'||!Number.isFinite(body[key])||body[key]<0||body[key]>(key==='value'?1e9:100000)||(key!=='value'&&!Number.isInteger(body[key])))return {error:'Send valid analytics numbers.'};
    value[key]=body[key];
  }
  if(['view_product','add_to_cart','remove_from_cart','add_to_wishlist','remove_from_wishlist'].includes(value.event)&&!value.listingId)return {error:'A piece reference is required.'};
  if(value.event==='view_designer'&&!value.designerId)return {error:'A designer reference is required.'};
  return {value};
}

function createAnalyticsIngest({db,dataDir,trustedAppOrigin,options={}}){
  const now=options.now||Date.now;
  const maxRows=Math.min(100000,Math.max(1,options.maxRows||100000));
  const dailyLimit=Math.min(6000,Math.max(1,options.dailyLimit||6000));
  const minuteLimit=Math.min(600,Math.max(1,options.minuteLimit||600));
  const sessionLimit=Math.min(60,Math.max(1,options.sessionLimit||60));
  const maxQueue=Math.min(256,Math.max(1,options.maxQueue||256));
  const maxKeys=2048;
  const secret=crypto.createHmac('sha256',options.cookieKey||process.env.MEASUREMENT_ENCRYPTION_KEY||crypto.randomBytes(32)).update('house-analytics-abuse-guard-v1').digest();
  const digest=value=>crypto.createHmac('sha256',secret).update(value).digest('hex');
  const sign=value=>crypto.createHmac('sha256',secret).update(value).digest('base64url');
  const buckets=new Map(),duplicates=new Map(),queue=[];
  let flushTimer=null,freeSpace=null,closed=false;
  const stats={stored:0,dropped:0,duplicates:0,batches:0};
  db.exec(`CREATE TABLE IF NOT EXISTS analytics_ingestion_budget (
    id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, daily_count INTEGER NOT NULL,
    minute INTEGER NOT NULL, minute_count INTEGER NOT NULL, stored_rows INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS analytics_anonymous_created ON analytics_events(created_at,id) WHERE event_name!='purchase';
  INSERT OR IGNORE INTO analytics_ingestion_budget VALUES (1,'',0,0,0,0);
  CREATE TRIGGER IF NOT EXISTS analytics_budget_insert AFTER INSERT ON analytics_events WHEN NEW.event_name!='purchase'
    BEGIN UPDATE analytics_ingestion_budget SET stored_rows=stored_rows+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS analytics_budget_delete AFTER DELETE ON analytics_events WHEN OLD.event_name!='purchase'
    BEGIN UPDATE analytics_ingestion_budget SET stored_rows=stored_rows-1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS analytics_budget_event_change AFTER UPDATE OF event_name ON analytics_events
    BEGIN UPDATE analytics_ingestion_budget SET stored_rows=stored_rows+(CASE WHEN NEW.event_name!='purchase' THEN 1 ELSE 0 END)-(CASE WHEN OLD.event_name!='purchase' THEN 1 ELSE 0 END) WHERE id=1; END;`);
  db.transaction(()=>db.prepare("UPDATE analytics_ingestion_budget SET stored_rows=(SELECT COUNT(*) FROM analytics_events WHERE event_name!='purchase') WHERE id=1").run()).immediate();
  function consume(key,max,time){
    let bucket=buckets.get(key);
    if(!bucket||bucket.until<=time){
      if(buckets.size>=maxKeys){for(const [k,v] of buckets){if(v.until<=time)buckets.delete(k);}if(buckets.size>=maxKeys)return false;}
      bucket={count:0,until:time+60000};buckets.set(key,bucket);
    }
    if(bucket.count>=max)return false;
    bucket.count++;return true;
  }
  function gate(req,res,next){
    if(Number(req.get('content-length'))>16*1024)return res.status(413).json({error:{code:'request_too_large',message:'This analytics request is too large.'}});
    if(!isTrustedRequestOrigin(req,trustedAppOrigin(req)))return res.status(403).json({error:{code:'invalid_origin',message:'This analytics request did not come from House of Briar.'}});
    const time=now();
    // Never trust caller-supplied forwarding headers. The transport bucket is
    // generous enough for a shared proxy; signed browser identities have their own cap.
    const peer=digest('peer:'+String(req.socket?.remoteAddress||'unknown'));
    if(!consume('global',minuteLimit,time)||!consume(peer,minuteLimit,time))return limited(res);
    const raw=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
    let token='';
    if(/^[A-Za-z0-9_-]{24}\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(raw)){
      const parts=raw.split('.'),issued=Number(parts[1])*1000,signed=parts[0]+'.'+parts[1];
      if(issued<=time+60000&&issued>time-15*60000&&crypto.timingSafeEqual(Buffer.from(sign(signed)),Buffer.from(parts[2])))token=raw;
    }
    if(!token){const signed=crypto.randomBytes(18).toString('base64url')+'.'+Math.floor(time/1000);token=signed+'.'+sign(signed);res.cookie(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:trustedAppOrigin(req).startsWith('https:'),path:'/api/analytics',maxAge:15*60000});}
    const browser=digest('browser:'+token);
    if(!consume(browser,sessionLimit,time))return limited(res);
    req.analyticsBrowser=browser;next();
  }
  function limited(res){stats.dropped++;res.set('Retry-After','60');return res.status(429).json({accepted:false,error:{code:'rate_limited',message:'Optional analytics temporarily limited.'}});}
  function storageAvailable(){
    const time=now();
    if(freeSpace&&time-freeSpace.at<60000)return freeSpace.ok;
    try{const bytes=options.freeBytes?options.freeBytes():(()=>{const s=fs.statfsSync(dataDir);return s.bavail*s.bsize;})();freeSpace={at:time,ok:bytes>=64*1024*1024};}catch{freeSpace={at:time,ok:false};}
    return freeSpace.ok;
  }
  function enqueue({browser,event,write,purchase=false}){
    if(closed||!db.open||queue.length>=maxQueue||!storageAvailable()){stats.dropped++;return Promise.resolve(false);}
    const time=now();
    if(!purchase&&['page_view','view_designer','view_product'].includes(event.event)){
      const key=digest(browser+':'+JSON.stringify(event));
      if((duplicates.get(key)||0)>time){stats.duplicates++;return Promise.resolve(false);}
      if(duplicates.size>=maxKeys){for(const [k,until] of duplicates){if(until<=time)duplicates.delete(k);}if(duplicates.size>=maxKeys){stats.dropped++;return Promise.resolve(false);}}
      duplicates.set(key,time+2000);
    }
    return new Promise(resolve=>{
      queue.push({write,purchase,resolve});
      if(!flushTimer){flushTimer=setTimeout(flush,50);flushTimer.unref();}
    });
  }
  function withoutWaiting(run){
    const previous=db.pragma('busy_timeout',{simple:true});
    try{db.pragma('busy_timeout=0');return run();}
    finally{if(db.open)db.pragma('busy_timeout='+previous);}
  }
  function flush(){
    if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}
    const batch=queue.splice(0,maxQueue);if(!batch.length)return;
    let results=batch.map(()=>false);
    if(!closed&&db.open&&storageAvailable())try{
      results=withoutWaiting(()=>db.transaction(()=>{
        const time=now(),day=new Date(time).toISOString().slice(0,10),minute=Math.floor(time/60000);
        let budget=db.prepare('SELECT * FROM analytics_ingestion_budget WHERE id=1').get();
        let daily=budget.day===day?budget.daily_count:0,perMinute=budget.minute===minute?budget.minute_count:0,rows=budget.stored_rows;
        const accepted=[];
        for(const job of batch){
          if(daily>=dailyLimit||perMinute>=minuteLimit||(!job.purchase&&rows>=maxRows)){accepted.push(false);continue;}
          job.write();daily++;perMinute++;if(!job.purchase)rows++;accepted.push(true);
        }
        if(accepted.some(Boolean))db.prepare('UPDATE analytics_ingestion_budget SET day=?,daily_count=?,minute=?,minute_count=? WHERE id=1').run(day,daily,minute,perMinute);
        return accepted;
      }).immediate());stats.batches++;
    }catch{/* Telemetry failure never propagates into commerce. */}
    results.forEach((accepted,i)=>{if(accepted)stats.stored++;else stats.dropped++;batch[i].resolve(accepted);});
  }
  function sweep(){
    if(!db.open){clearInterval(retentionTimer);return 0;}
    try{return withoutWaiting(()=>db.transaction(()=>{
      const cutoff=new Date(now()-90*86400000).toISOString();
      let removed=db.prepare("DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE event_name!='purchase' AND created_at<? ORDER BY created_at,id LIMIT 1000)").run(cutoff).changes;
      const count=db.prepare('SELECT stored_rows FROM analytics_ingestion_budget WHERE id=1').get().stored_rows;
      if(count>=maxRows)removed+=db.prepare("DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE event_name!='purchase' ORDER BY created_at,id LIMIT ?)").run(Math.min(1000,maxRows,Math.max(1,count-maxRows+Math.min(1000,maxRows)))).changes;
      return removed;
    }).immediate());}catch{return 0;}
  }
  const retentionTimer=setInterval(sweep,60000);retentionTimer.unref();sweep();
  function close(){closed=true;clearInterval(retentionTimer);if(flushTimer)clearTimeout(flushTimer);flushTimer=null;for(const job of queue.splice(0))job.resolve(false);}
  return {gate,enqueue,flush,sweep,close,stats,retentionDays:90};
}
module.exports={createAnalyticsIngest,validateEvent};
