const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');

const TEST_KEY = 'shippo_test_webhook_regression';
const WEBHOOK_SECRET = 'shippo_webhook_regression_secret';

async function fixture() {
  const prior = {
    SHIPPO_API_KEY: process.env.SHIPPO_API_KEY,
    SHIPPO_WEBHOOK_SECRET: process.env.SHIPPO_WEBHOOK_SECRET
  };
  process.env.SHIPPO_API_KEY = TEST_KEY;
  process.env.SHIPPO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-shippo-webhook-'));
  const stripeCalls = [];
  const providerRequests = [];
  const ctx = createApp({
    dataDir,
    seedProducts: [],
    adminToken: 'test-admin',
    stripeApi: async (...args) => { stripeCalls.push(args); throw new Error('Payout must not run from a Shippo webhook'); },
    fetch: async (url, options) => {
      providerRequests.push({url:String(url),authorization:options?.headers?.Authorization});
      return new Response(JSON.stringify({
        tracking_number:'SHIPPO_TRANSIT',
        tracking_status:{status:'TRANSIT'},
        test:true
      }), {status:200,headers:{'Content-Type':'application/json'}});
    }
  });
  const server = ctx.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    ctx,
    stripeCalls,
    providerRequests,
    async webhook(event, secret = WEBHOOK_SECRET) {
      return fetch(`${origin}/api/shippo/webhook`, {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-shippo-webhook-secret':secret},
        body: JSON.stringify(event)
      });
    },
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      ctx.db.close();
      fs.rmSync(dataDir, {recursive:true,force:true});
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  };
}

function seedPendingTransfer(db, trackingNumber = 'SHIPPO_TRANSIT') {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO orders
    (id,status,currency,subtotal_cents,platform_fee_cents,designer_amount_cents,created_at)
    VALUES ('shippo-test-order','paid','usd',10000,900,9100,?)`).run(now);
  db.prepare(`INSERT INTO designer_transfers
    (id,order_id,designer_id,stripe_account_id,amount_cents,status,created_at,tracking_carrier,tracking_number)
    VALUES ('shippo-test-transfer','shippo-test-order','test-designer','acct_test',9100,'pending',?,'shippo',?)`)
    .run(now, trackingNumber);
}

test('authenticated Shippo test webhook updates its matched transfer and cannot trigger payout', async () => {
  const f = await fixture();
  try {
    seedPendingTransfer(f.ctx.db);
    const response = await f.webhook({event:'track_updated',data:{carrier:'shippo',tracking_number:'SHIPPO_TRANSIT'}});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{received:true,updated:1,simulated:true});
    assert.deepEqual(f.providerRequests,[{
      url:'https://api.goshippo.com/tracks/shippo/SHIPPO_TRANSIT',
      authorization:`ShippoToken ${TEST_KEY}`
    }]);
    const transfer = f.ctx.db.prepare("SELECT status,tracking_status,tracking_verified_at FROM designer_transfers WHERE id='shippo-test-transfer'").get();
    assert.equal(transfer.status,'pending');
    assert.equal(transfer.tracking_status,'test_transit');
    assert.equal(transfer.tracking_verified_at,null);
    assert.equal(f.stripeCalls.length,0);
  } finally {
    await f.close();
  }
});

test('unmatched Shippo mock tracker is acknowledged but does not call Shippo or change transfers', async () => {
  const f = await fixture();
  try {
    const response = await f.webhook({event:'track_updated',data:{carrier:'shippo',tracking_number:'SHIPPO_TRANSIT'}});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{received:true,ignored:true});
    assert.equal(f.ctx.db.prepare('SELECT COUNT(*) AS n FROM designer_transfers').get().n,0);
    assert.equal(f.providerRequests.length,0);
  } finally {
    await f.close();
  }
});
