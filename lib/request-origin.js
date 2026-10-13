// Railway terminates HTTPS upstream and can serve both its hostname and a
// custom domain. Validate the browser origin against the actual request host
// using the configured public scheme, rather than trusting forwarded headers.
function isTrustedRequestOrigin(req, configuredOrigin) {
  const origin=req.get('origin');
  const fetchSite=String(req.get('sec-fetch-site')||'').toLowerCase();
  if(fetchSite==='cross-site')return false;
  if(!origin)return fetchSite==='same-origin';
  if(origin==='null')return false;
  try {
    const incoming=new URL(origin),configured=new URL(configuredOrigin);
    if(incoming.origin!==origin)return false;
    if(incoming.origin===configured.origin)return true;
    const host=req.get('host');
    const serving=new URL(configured.protocol+'//'+host);
    if(serving.host!==host||serving.username||serving.password)return false;
    return incoming.origin===serving.origin;
  } catch { return false; }
}
module.exports={isTrustedRequestOrigin};
