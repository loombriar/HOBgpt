'use strict';

const crypto = require('node:crypto');

const API_ROOT = '/v2/checkout/orders';
const CURRENCY = 'USD';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSandboxEnabled(env) {
  if (String(env.PAYPAL_ENVIRONMENT || '').toLowerCase() !== 'sandbox') {
    throw fail('paypal_sandbox_only', 'This checkout helper is available only in PayPal sandbox mode.');
  }
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw fail('paypal_credentials_required', 'PayPal sandbox credentials are required.');
  }
  if (env.PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED !== 'true') {
    throw fail('paypal_sandbox_feature_disabled', 'The single-seller PayPal sandbox feature flag is not enabled.');
  }
}

function validateReferenceId(value) {
  const referenceId = String(value || '');
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(referenceId)) {
    throw fail('paypal_invalid_reference', 'A valid internal checkout reference is required.');
  }
  return referenceId;
}

function validateOrderId(value) {
  const orderId = String(value || '');
  if (!/^[A-Za-z0-9-]{5,64}$/.test(orderId)) {
    throw fail('paypal_invalid_order_id', 'A valid PayPal order ID is required.');
  }
  return orderId;
}

function validateAmount(amountCents, currency = CURRENCY) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) {
    throw fail('paypal_invalid_amount', 'The server-calculated checkout amount is invalid.');
  }
  if (String(currency).toUpperCase() !== CURRENCY) {
    throw fail('paypal_unsupported_currency', 'This sandbox example currently supports USD only.');
  }
  return {currency_code: CURRENCY, value: (amountCents / 100).toFixed(2)};
}

function validateRedirectUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw fail('paypal_invalid_redirect', 'A valid checkout return and cancel URL is required.');
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) {
    throw fail('paypal_invalid_redirect', 'Checkout redirects must use HTTPS (HTTP is allowed only on localhost).');
  }
  return url.toString();
}

function requestId(kind, key) {
  return crypto.createHash('sha256').update(`hob-paypal-sandbox:${kind}:${key}`).digest('hex').slice(0, 32);
}

function approvalUrl(order) {
  const href = order?.links?.find(link => ['approve', 'payer-action'].includes(link.rel))?.href;
  if (!href) throw fail('paypal_approval_link_missing', 'PayPal did not return a sandbox approval link.');
  let parsed;
  try { parsed = new URL(href); } catch { throw fail('paypal_approval_link_invalid', 'PayPal returned an invalid approval link.'); }
  if (parsed.protocol !== 'https:' || !['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(parsed.hostname)) {
    throw fail('paypal_approval_link_invalid', 'PayPal returned a non-sandbox approval link.');
  }
  return parsed.toString();
}

function matchingPurchaseUnit(order, referenceId, expectedAmount) {
  const units = order?.purchase_units;
  if (!Array.isArray(units) || units.length !== 1) return null;
  const unit = units[0];
  if (unit.reference_id !== referenceId && unit.custom_id !== referenceId) return null;
  if (unit.amount?.currency_code !== expectedAmount.currency_code || unit.amount?.value !== expectedAmount.value) return null;
  return unit;
}

/**
 * Draft for a one-recipient checkout smoke test. The caller must compute amountCents
 * from trusted server-side catalog/order data; never pass a browser-supplied price.
 * This helper does not split funds, set a payee, retain a platform fee, or fulfill orders.
 */
async function createSandboxOrder({env = process.env, paypalApi, referenceId, description, amountCents, currency = CURRENCY, returnUrl, cancelUrl}) {
  assertSandboxEnabled(env);
  if (typeof paypalApi !== 'function') throw fail('paypal_api_required', 'A PayPal API client is required.');
  const reference = validateReferenceId(referenceId);
  const amount = validateAmount(amountCents, currency);
  const itemDescription = String(description || '').trim();
  if (!itemDescription || itemDescription.length > 127) {
    throw fail('paypal_invalid_description', 'The checkout description must be 1 to 127 characters.');
  }
  const successUrl = validateRedirectUrl(returnUrl);
  const cancel = validateRedirectUrl(cancelUrl);
  const response = await paypalApi(API_ROOT, {
    method: 'POST',
    idempotencyKey: requestId('create', reference),
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: reference,
        custom_id: reference,
        description: itemDescription,
        amount,
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'House of Briar',
            user_action: 'PAY_NOW',
            return_url: successUrl,
            cancel_url: cancel,
            shipping_preference: 'GET_FROM_FILE',
          },
        },
      },
    },
  });
  const orderId = validateOrderId(response?.id);
  return Object.freeze({orderId, status: String(response.status || 'CREATED'), approvalUrl: approvalUrl(response)});
}

/**
 * Capture only the exact, previously created sandbox order after approval.
 * A successful capture is reported, but fulfillment remains the caller's job.
 */
async function captureSandboxOrder({env = process.env, paypalApi, orderId, referenceId, amountCents, currency = CURRENCY}) {
  assertSandboxEnabled(env);
  if (typeof paypalApi !== 'function') throw fail('paypal_api_required', 'A PayPal API client is required.');
  const order = validateOrderId(orderId);
  const reference = validateReferenceId(referenceId);
  const expectedAmount = validateAmount(amountCents, currency);
  const orderPath = `${API_ROOT}/${encodeURIComponent(order)}`;
  const stored = await paypalApi(orderPath);
  if (stored?.id !== order || stored?.status !== 'APPROVED' || !matchingPurchaseUnit(stored, reference, expectedAmount)) {
    throw fail('paypal_order_not_approved_or_mismatched', 'The PayPal order is not approved or does not match this checkout.');
  }
  const response = await paypalApi(`${orderPath}/capture`, {
    method: 'POST',
    idempotencyKey: requestId('capture', `${reference}:${order}`),
  });
  const capture = response?.purchase_units?.[0]?.payments?.captures?.[0];
  if (response?.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' ||
      capture?.amount?.currency_code !== expectedAmount.currency_code || capture?.amount?.value !== expectedAmount.value) {
    throw fail('paypal_capture_unverified', 'PayPal did not return a completed capture matching this checkout.');
  }
  return Object.freeze({status: 'COMPLETED', captureId: String(capture.id || '')});
}

module.exports = {createSandboxOrder, captureSandboxOrder};
