// Customer links come only from EasyPost's public tracking service.
function safeTrackingUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'track.easypost.com' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
module.exports = { safeTrackingUrl };
