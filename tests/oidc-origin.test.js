const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const http = require('node:http');
// Send an explicit Host even on Node versions whose fetch ignores Host overrides.
function localFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: options.headers }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({status:response.statusCode, json:async()=>JSON.parse(body)}));
    }); request.on('error', reject);
  });
}
const { createApp } = require('../server');

async function withApp(options, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-oidc-origin-'));
  const ctx = createApp({ dataDir: dir, seedProducts: [], designerTokens: {}, ...options });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await callback(base); }
  finally {
    await new Promise(resolve => server.close(resolve));
    ctx.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('OIDC never performs discovery from an attacker-controlled Host when APP_ORIGIN is absent', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => { requests.push(url); throw new Error('Unexpected outbound discovery'); };
  try {
    await withApp({ appOrigin: '' }, async base => {
      const response = await localFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-oidc-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 400);
      assert.equal(requests.length, 0);
    });
  } finally { global.fetch = originalFetch; }
});

test('unknown bearer credentials cannot trigger external identity lookups', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async url => { requests.push(url); throw new Error('Unexpected external identity lookup'); };
  try {
    await withApp({ appOrigin: 'https://trusted.example' }, async base => {
      const response = await localFetch(base + '/api/my/designer-profile', {
        headers: { Authorization: 'Bearer unrecognized-token', Host: 'trusted.example' }
      });
      assert.equal(response.status, 401);
    });
    assert.equal(requests.length, 0);
  } finally { global.fetch = originalFetch; }
});

test('Host admission allows configured domains and rejects untrusted forwarding headers', async () => {
  await withApp({appOrigin:'https://trusted.example',allowedHosts:['custom.example']},async base=>{
    for(const host of ['trusted.example','TRUSTED.EXAMPLE','custom.example']) {
      assert.equal((await localFetch(base+'/api/health',{headers:{Host:host}})).status,200);
    }
    for(const host of ['attacker.example','trusted.example.evil','trusted.example:444','trusted.example@evil.example']) {
      assert.equal((await localFetch(base+'/api/health',{headers:{Host:host,'X-Forwarded-Host':'trusted.example'}})).status,400);
    }
  });
  await withApp({appOrigin:''},async base=>{
    assert.equal((await localFetch(base+'/api/health')).status,200);
  });
});

test('Railway healthcheck Host is accepted only for GET /api/health',async()=>{
  const previous=process.env.RAILWAY_PROJECT_ID;process.env.RAILWAY_PROJECT_ID='local-test';
  try{await withApp({appOrigin:'https://trusted.example'},async base=>{
    assert.equal((await localFetch(base+'/api/health',{headers:{Host:'healthcheck.railway.app'}})).status,200);
    assert.equal((await localFetch(base+'/api/gallery',{headers:{Host:'healthcheck.railway.app'}})).status,400);
  });}finally{if(previous===undefined)delete process.env.RAILWAY_PROJECT_ID;else process.env.RAILWAY_PROJECT_ID=previous;}
});
