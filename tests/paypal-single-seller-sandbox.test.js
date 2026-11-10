'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createSandboxOrder, captureSandboxOrder} = require('../lib/paypal-single-seller-sandbox');

const env = {
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox-client-id',
  PAYPAL_CLIENT_SECRET: 'sandbox-client-secret',
  PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED: 'true',
};
const base = {
  env,
  referenceId: 'test-order-123',
  description: 'Sandbox test item',
  amountCents: 2599,
  returnUrl: 'http://localhost:3000/paypal/success',
  cancelUrl: 'http://localhost:3000/paypal/cancel',
};

test('creates one sandbox purchase unit with server amount and no marketplace split', async () => {
  let call;
  const result = await createSandboxOrder({...base, paypalApi: async (...args) => {
    call = args;
    return {id: 'ORDER12345', status: 'CREATED', links: [{rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'}]};
  }});
  assert.deepEqual(result, {orderId: 'ORDER12345', status: 'CREATED', approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'});
  assert.equal(call[0], '/v2/checkout/orders');
  assert.equal(call[1].method, 'POST');
  assert.equal(call[1].body.purchase_units.length, 1);
  assert.equal(call[1].body.purchase_units[0].amount.value, '25.99');
  assert.equal(call[1].body.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(call[1].body.purchase_units[0].reference_id, 'test-order-123');
  assert.equal('payee' in call[1].body.purchase_units[0], false);
  assert.equal('payment_instruction' in call[1].body, false);
  assert.equal(call[1].idempotencyKey.length, 32);
});

test('requires sandbox mode, credentials, and explicit sandbox feature flag', async () => {
  const invoke = overrides => createSandboxOrder({...base, env: {...env, ...overrides}, paypalApi: async () => { throw new Error('must not call API'); }});
  await assert.rejects(invoke({PAYPAL_ENVIRONMENT: 'live'}), {code: 'paypal_sandbox_only'});
  await assert.rejects(invoke({PAYPAL_CLIENT_SECRET: ''}), {code: 'paypal_credentials_required'});
  await assert.rejects(invoke({PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED: 'false'}), {code: 'paypal_sandbox_feature_disabled'});
});

test('rejects invalid amounts, currencies, and non-HTTPS remote redirect URLs', async () => {
  const api = async () => { throw new Error('must not call API'); };
  await assert.rejects(createSandboxOrder({...base, amountCents: 0, paypalApi: api}), {code: 'paypal_invalid_amount'});
  await assert.rejects(createSandboxOrder({...base, currency: 'TRY', paypalApi: api}), {code: 'paypal_unsupported_currency'});
  await assert.rejects(createSandboxOrder({...base, returnUrl: 'http://example.com/return', paypalApi: api}), {code: 'paypal_invalid_redirect'});
});

test('captures only an approved matching sandbox order and validates completed capture amount', async () => {
  const calls = [];
  const result = await captureSandboxOrder({
    env,
    paypalApi: async (path, options = {}) => {
      calls.push({path, options});
      if (calls.length === 1) return {
        id: 'ORDER12345', status: 'APPROVED',
        purchase_units: [{reference_id: 'test-order-123', amount: {currency_code: 'USD', value: '25.99'}}],
      };
      return {
        id: 'ORDER12345', status: 'COMPLETED',
        purchase_units: [{payments: {captures: [{id: 'CAPTURE12345', status: 'COMPLETED', amount: {currency_code: 'USD', value: '25.99'}}]}}],
      };
    },
    orderId: 'ORDER12345', referenceId: 'test-order-123', amountCents: 2599,
  });
  assert.deepEqual(result, {status: 'COMPLETED', captureId: 'CAPTURE12345'});
  assert.equal(calls[0].path, '/v2/checkout/orders/ORDER12345');
  assert.equal(calls[1].path, '/v2/checkout/orders/ORDER12345/capture');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.idempotencyKey.length, 32);
});

test('does not capture an unapproved, wrong-reference, wrong-amount, or multi-unit order', async t => {
  for (const order of [
    {id: 'ORDER12345', status: 'CREATED', purchase_units: [{reference_id: 'test-order-123', amount: {currency_code: 'USD', value: '25.99'}}]},
    {id: 'ORDER12345', status: 'APPROVED', purchase_units: [{reference_id: 'other-order', amount: {currency_code: 'USD', value: '25.99'}}]},
    {id: 'ORDER12345', status: 'APPROVED', purchase_units: [{reference_id: 'test-order-123', amount: {currency_code: 'USD', value: '26.00'}}]},
    {id: 'ORDER12345', status: 'APPROVED', purchase_units: [
      {reference_id: 'test-order-123', amount: {currency_code: 'USD', value: '25.99'}},
      {reference_id: 'other', amount: {currency_code: 'USD', value: '1.00'}},
    ]},
  ]) {
    await t.test(`rejects ${order.status} order with ${order.purchase_units.length} unit(s)`, async () => {
      const calls = [];
      await assert.rejects(captureSandboxOrder({env, orderId: 'ORDER12345', referenceId: 'test-order-123', amountCents: 2599,
        paypalApi: async (path, options = {}) => { calls.push({path, options}); return order; }}), {code: 'paypal_order_not_approved_or_mismatched'});
      assert.equal(calls.length, 1);
      assert.equal(calls[0].path, '/v2/checkout/orders/ORDER12345');
    });
  }
});

test('rejects a non-sandbox PayPal approval URL', async () => {
  await assert.rejects(createSandboxOrder({...base, paypalApi: async () => ({
    id: 'ORDER12345', status: 'CREATED', links: [{rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=ORDER12345'}],
  })}), {code: 'paypal_approval_link_invalid'});
});
