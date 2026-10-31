const crypto = require('node:crypto');
const { isIP } = require('node:net');

function createIngressGate({ secret, now = () => Date.now(), maxAgeMs = 60000 } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('INGRESS_HMAC_SECRET must contain at least 32 characters');
  const seen = new Map();
  return (req, res, next) => {
    // Railway's platform health probe cannot provide application HMAC headers.
    if (req.method === 'GET' && req.url === '/api/health') return next();
    const timestamp = req.get('x-hob-ingress-timestamp');
    const nonce = req.get('x-hob-ingress-nonce');
    const ip = req.get('x-hob-ingress-client-ip');
    const signature = req.get('x-hob-ingress-signature');
    const time = Number(timestamp);
    const current = now();
    if (!/^[0-9]{13}$/.test(timestamp || '') || !Number.isSafeInteger(time) || Math.abs(current - time) > maxAgeMs ||
        !/^[a-f0-9]{32}$/.test(nonce || '') || !isIP(ip || '') || !/^[a-f0-9]{64}$/.test(signature || '')) {
      return res.status(403).json({ error: 'untrusted_ingress' });
    }
    // Bind the signature to the HTTP method, original request target, and identity.
    const payload = [timestamp, nonce, req.method, req.originalUrl || req.url, ip].join('\n');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    const supplied = Buffer.from(signature, 'hex');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(403).json({ error: 'untrusted_ingress' });
    }
    for (const [key, expiry] of seen) if (expiry <= current) seen.delete(key);
    if (seen.has(nonce)) return res.status(403).json({ error: 'replayed_ingress' });
    seen.set(nonce, current + maxAgeMs);
    req.authenticatedIngressIp = ip;
    next();
  };
}
module.exports = { createIngressGate };
