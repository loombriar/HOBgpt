// Railway terminates HTTPS upstream and can serve both its hostname and a
// custom domain. Validate the browser origin against the actual request host
// using the configured public scheme and a strict allowlist of trusted hosts,
// rather than trusting forwarded headers or caller-controlled Host values.
function normalizeHost(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (!host || host.includes('/') || host.includes(' ') || host.includes('@')) return null;
  try {
    const parsed = new URL('http://' + host);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || parsed.username || parsed.password || parsed.port) return null;
    return hostname;
  } catch {
    return null;
  }
}

function trustedHosts(configuredOrigin) {
  const hosts = new Set();
  try {
    const configured = new URL(configuredOrigin);
    if (configured.hostname) hosts.add(configured.hostname.toLowerCase());
  } catch {
    // A bad configured origin is already invalid and should fail closed.
  }
  for (const entry of String(process.env.ALLOWED_HOSTS || '').split(',')) {
    const host = normalizeHost(entry);
    if (host) hosts.add(host);
  }
  return hosts;
}

function isTrustedRequestOrigin(req, configuredOrigin) {
  const origin = req.get('origin');
  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') return false;

  let configured;
  try {
    configured = new URL(configuredOrigin);
  } catch {
    return false;
  }

  const host = normalizeHost(req.get('host'));
  const allowedHosts = trustedHosts(configuredOrigin);
  if (host && !allowedHosts.has(host)) return false;

  if (!origin) {
    return fetchSite === 'same-origin' && Boolean(host && allowedHosts.has(host));
  }
  if (origin === 'null') return false;

  try {
    const incoming = new URL(origin);
    if (incoming.origin !== origin) return false;
    if (incoming.origin === configured.origin) return true;
    if (!host || !allowedHosts.has(host)) return false;

    const serving = new URL(configured.protocol + '//' + host);
    if (serving.host !== host || serving.username || serving.password) return false;
    return incoming.origin === serving.origin;
  } catch {
    return false;
  }
}

module.exports = { isTrustedRequestOrigin };
