// Railway terminates HTTPS upstream and can serve both its hostname and a
// custom domain. Validate the browser origin against the actual request host
// using the configured public scheme, while rejecting spoofed or untrusted
// Host headers from direct clients.
function normalizeRequestHost(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (!host || host.includes('/') || host.includes(' ') || host.includes('@')) return null;
  try {
    const parsed = new URL(`http://${host}`);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || parsed.username || parsed.password || parsed.port) return null;
    return hostname;
  } catch {
    return null;
  }
}

function trustedHostnames(configuredOrigin) {
  const hosts = new Set();
  try {
    const configured = new URL(configuredOrigin);
    if (configured.hostname) hosts.add(configured.hostname.toLowerCase());
  } catch {
    // Ignore invalid configured origins; callers should already reject them.
  }
  for (const entry of String(process.env.ALLOWED_HOSTS || '').split(',')) {
    const candidate = normalizeRequestHost(entry);
    if (candidate) hosts.add(candidate);
  }
  return hosts;
}

function isTrustedRequestOrigin(req, configuredOrigin) {
  const origin = req.get('origin');
  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') return false;
  const configured = (() => {
    try { return new URL(configuredOrigin); } catch { return null; }
  })();
  if (!configured) return false;
  const host = normalizeRequestHost(req.get('host'));
  const permittedHosts = trustedHostnames(configuredOrigin);
  if (host && !permittedHosts.has(host)) return false;
  if (!origin) return fetchSite === 'same-origin' && Boolean(host && permittedHosts.has(host));
  if (origin === 'null') return false;
  try {
    const incoming = new URL(origin);
    if (incoming.origin !== origin) return false;
    if (incoming.origin === configured.origin) return true;
    if (!host || !permittedHosts.has(host)) return false;
    const serving = new URL(configured.protocol + '//' + host);
    if (serving.host !== host || serving.username || serving.password) return false;
    return incoming.origin === serving.origin;
  } catch {
    return false;
  }
}
module.exports = { isTrustedRequestOrigin };
