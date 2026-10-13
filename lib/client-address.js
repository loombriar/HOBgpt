const {isIP}=require('node:net');

// Railway's public HTTP edge overwrites X-Real-IP. Express req.ip is the
// immediate proxy address unless trust proxy is configured. Never enable
// blanket trust proxy or accept X-Forwarded-For from arbitrary callers.
//
// This header is authoritative ONLY for public-edge traffic. Deployments
// that also expose this listener over Railway private networking must isolate
// that access or use a separate authenticated endpoint: private peers can
// supply their own X-Real-IP headers.
function clientAddress(req,{railway=Boolean(process.env.RAILWAY_PROJECT_ID)}={}){
  const edgeHeader=railway&&typeof req.get==='function'?req.get('x-real-ip'):null;
  const edgeIp=typeof edgeHeader==='string'?edgeHeader.trim():'';
  const socketIp=String(req.socket?.remoteAddress||'unknown');
  const ip=isIP(edgeIp)?edgeIp:socketIp;
  return ip.startsWith('::ffff:')?ip.slice(7):ip;
}
module.exports={clientAddress};
