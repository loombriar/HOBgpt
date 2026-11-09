'use strict';
// Railway production rebuild trigger after merging the scoped healthcheck fix.
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const {isIP} = require('node:net');

function normalizeHostname(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (!host || host.includes('/') || host.includes(' ')) return null;
  const candidate = host.replace(/\[(.*)\]/, '$1');
  if (candidate.startsWith(':')) return null;
  const withoutPort = candidate.replace(/:\d+$/, '');
  if (!withoutPort) return null;
  if (!/^(localhost|\[[0-9a-f:]+\]|[a-z0-9.-]+|\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/.test(withoutPort)) return null;
  return withoutPort;
}

function allowedHostnames() {
  const names = new Set(['localhost', '127.0.0.1', '::1']);
  const add = value => {
    if (!value) return;
    const host = normalizeHostname(value);
    if (host) names.add(host);
  };
  add(process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).hostname : null);
  for (const entry of (process.env.ALLOWED_HOSTS || '').split(',')) add(entry);
  return names.size > 0 ? names : null;
}

function createIngressProxy({upstream,secret,edgeToken=process.env.HOB_REPORT_EDGE_TOKEN,now=()=>Date.now(),nonce=()=>crypto.randomBytes(16).toString('hex')}={}) {
  if (!upstream || !/^https?:$/.test(new URL(upstream).protocol)) throw new Error('INGRESS_UPSTREAM_URL must be an HTTP URL');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('INGRESS_HMAC_SECRET must be at least 32 characters');
  if (edgeToken && !/^[a-f0-9]{64}$/.test(edgeToken)) throw new Error('HOB_REPORT_EDGE_TOKEN must be 32 random bytes encoded as hex');
  const visitorMode = process.env.HOB_VISITOR_RATE_LIMITS === 'true';
  const signVisitor = id => crypto.createHmac('sha256', secret).update('visitor:' + id).digest('hex');
  const readVisitor = raw => {
    const match = String(raw || '').match(/(?:^|;\s*)hob_visitor=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/);
    if (!match) return null;
    return crypto.timingSafeEqual(Buffer.from(signVisitor(match[1]), 'hex'), Buffer.from(match[2], 'hex')) ? match[1] : null;
  };
  const target=new URL(upstream);
  const allowedHosts = allowedHostnames();
  return http.createServer((req,res)=>{
    // Authenticate the actual connection peer, never a caller-supplied header.
    // Railway edge requests may share this identity. Keep conservative shared
    // throttling until an authenticated edge can supply individual client IPs.
    const suppliedToken=req.headers['x-hob-edge-token'];
    const edgeIp=req.headers['x-hob-edge-client-ip'];
    const verifiedEdge=Boolean(edgeToken && typeof suppliedToken==='string' &&
      /^[a-f0-9]{64}$/.test(suppliedToken) && isIP(edgeIp||'') &&
      crypto.timingSafeEqual(Buffer.from(edgeToken,'hex'),Buffer.from(suppliedToken,'hex')));
    const ip=String(verifiedEdge?edgeIp:req.socket.remoteAddress||'').replace(/^::ffff:/,'');
    if (!isIP(ip)) {res.writeHead(403);res.end('Unverified ingress');return;}
    const host = normalizeHostname(req.headers.host);
    if (!host) {res.writeHead(400);res.end('Invalid Host');return;}
    // Railway probes this exact path using its own healthcheck hostname.
    // Do not trust that hostname for any other endpoint.
    const railwayHealthcheck = host === 'healthcheck.railway.app' && req.method === 'GET' && req.url === '/api/health';
    if (allowedHosts && !allowedHosts.has(host) && !railwayHealthcheck) {res.writeHead(400);res.end('Invalid Host');return;}
    const visitorId = visitorMode ? (readVisitor(req.headers.cookie) || crypto.randomBytes(16).toString('hex')) : null;
    const timestamp=String(now());
    const id=nonce();
    const path=req.url;
    const payload=[timestamp,id,req.method,path,ip,verifiedEdge?'edge':'peer',...(visitorId?[visitorId]:[])].join('\n');
    const signature=crypto.createHmac('sha256',secret).update(payload).digest('hex');
    const headers={...req.headers,
      host:req.headers.host,
      'x-hob-ingress-timestamp':timestamp,
      'x-hob-ingress-nonce':id,
      'x-hob-ingress-client-ip':ip,
      'x-hob-ingress-identity':verifiedEdge?'edge':'peer',
      ...(visitorId?{'x-hob-ingress-visitor':visitorId}:{}),
      'x-hob-ingress-signature':signature};
    // Never forward client-provided internal identity or proxy-chain headers.
    for(const key of Object.keys(headers)) if(key.startsWith('x-hob-edge-')||key.startsWith('x-forwarded-')||key==='x-real-ip'||key==='forwarded') delete headers[key];
    const transport=target.protocol==='https:'?https:http;
    const upstreamReq=transport.request({hostname:target.hostname,port:target.port||undefined,
      path:target.pathname.replace(/\/$/,'')+path,method:req.method,headers},upstreamRes=>{
      if (visitorId) {
        const cookie = 'hob_visitor=' + visitorId + '.' + signVisitor(visitorId) +
          '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' +
          (process.env.NODE_ENV === 'production' ? '; Secure' : '');
        const existing = upstreamRes.headers['set-cookie'];
        upstreamRes.headers['set-cookie'] = existing ? [...(Array.isArray(existing)?existing:[existing]),cookie] : [cookie];
      }
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
