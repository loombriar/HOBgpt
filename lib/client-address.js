const {isIP}=require('node:net');

// Railway's public HTTP edge overwrites X-Real-IP. Express req.ip is the
// immediate proxy address unless trust proxy is configured. Never enable
// blanket trust proxy or accept X-Forwarded-For from arbitrary callers.
//
// TRUSTED_PROXY_IPS must list the exact immediate ingress peer IPs. If absent,
// fall back to the socket address rather than trusting a forgeable header.
// Do not allowlist an entire private network: private service callers may forge headers.
function clientAddress(req,{railway=Boolean(process.env.RAILWAY_PROJECT_ID),trustedProxyIps=process.env.TRUSTED_PROXY_IPS||''}={}){
  // A Railway environment flag alone does not authenticate the immediate peer.
  // Only honor forwarded identity when the socket peer is explicitly allowlisted.
  const peers=Array.isArray(trustedProxyIps)?trustedProxyIps:String(trustedProxyIps).split(',');
  const normalized=ip=>String(ip||'').replace(/^::ffff:/,'');
  const socketIp=normalized(req.socket?.remoteAddress||'unknown');
  const trusted=railway&&peers.some(ip=>isIP(ip.trim())&&normalized(ip.trim())===socketIp);
  const edgeHeader=trusted&&typeof req.get==='function'?req.get('x-real-ip'):null;
  const edgeIp=typeof edgeHeader==='string'?edgeHeader.trim():'';
  const ip=isIP(edgeIp)?edgeIp:socketIp;
  return ip.startsWith('::ffff:')?ip.slice(7):ip;
}
module.exports={clientAddress};
