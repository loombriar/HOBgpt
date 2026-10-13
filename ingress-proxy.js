'use strict';
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const {isIP} = require('node:net');

function createIngressProxy({upstream,secret,now=()=>Date.now(),nonce=()=>crypto.randomBytes(16).toString('hex')}={}) {
  if (!upstream || !/^https?:$/.test(new URL(upstream).protocol)) throw new Error('INGRESS_UPSTREAM_URL must be an HTTP URL');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('INGRESS_HMAC_SECRET must be at least 32 characters');
  const target=new URL(upstream);
  return http.createServer((req,res)=>{
    // Only the Railway public edge should be able to supply X-Real-IP.
    // Do not expose this proxy to untrusted callers on the private network.
    const ip=String(req.headers['x-real-ip']||'').trim().replace(/^::ffff:/,'');
    if (!isIP(ip)) {res.writeHead(403);res.end('Unverified ingress');return;}
    const timestamp=String(now());
    const id=nonce();
    const path=req.url;
    const payload=[timestamp,id,req.method,path,ip].join('\n');
    const signature=crypto.createHmac('sha256',secret).update(payload).digest('hex');
    const headers={...req.headers,
      host:req.headers.host,
      'x-hob-ingress-timestamp':timestamp,
      'x-hob-ingress-nonce':id,
      'x-hob-ingress-client-ip':ip,
      'x-hob-ingress-signature':signature};
    // Never forward client-provided internal identity or proxy-chain headers.
    for(const key of Object.keys(headers)) if(key.startsWith('x-forwarded-')||key==='x-real-ip'||key==='forwarded') delete headers[key];
    const transport=target.protocol==='https:'?https:http;
    const upstreamReq=transport.request({hostname:target.hostname,port:target.port||undefined,
      path:target.pathname.replace(/\/$/,'')+path,method:req.method,headers},upstreamRes=>{
      res.writeHead(upstreamRes.statusCode||502,upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstreamReq.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Upstream unavailable');});
    req.pipe(upstreamReq);
  });
}
if(require.main===module) {
  const server=createIngressProxy({upstream:process.env.INGRESS_UPSTREAM_URL,secret:process.env.INGRESS_HMAC_SECRET});
  server.listen(Number(process.env.PORT||3000),'0.0.0.0');
}
module.exports={createIngressProxy};
