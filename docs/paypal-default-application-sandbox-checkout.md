# PayPal Default Application: sandbox checkout draft

**Status:** isolated example code only. This is not wired to the storefront or production checkout, and it does not replace Stripe. Existing merchandise routes remain unavailable until a reviewed payment/payout design is approved.

## What this draft does

`lib/paypal-single-seller-sandbox.js` creates one PayPal Orders v2 purchase unit and provides a guarded capture helper. It requires all of the following before it will call the injected API client:

- `PAYPAL_ENVIRONMENT=sandbox`
- sandbox `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
- `PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED=true`

The example only supports USD and a single recipient. It intentionally has no `payee`, platform-fee, split, seller-onboarding, or payout fields. It is suitable for a basic sandbox checkout smoke test, not a multi-designer marketplace integration. Do not use it to test or claim commission splits or seller payouts.

## Safe caller requirements

The amount passed to `createSandboxOrder` must be calculated on the server from the current catalog/cart and persisted order. Never accept a price or currency from the browser as authoritative. Store the internal reference and returned PayPal order ID before redirecting the buyer to the sandbox approval URL.

After the buyer returns, call `captureSandboxOrder` with the stored PayPal order ID, internal reference, and stored server-calculated amount. The helper first retrieves the order and refuses to capture unless it is `APPROVED`, has exactly one purchase unit, and the reference, amount, and currency match. It then captures idempotently and reports success only for a completed matching capture. The caller must still implement authenticated order ownership, inventory safety, reconciliation, refund handling, and fulfilment; a successful sandbox capture does not authorize production fulfilment.

## Example call shape

```js
const {createSandboxOrder, captureSandboxOrder} = require('../lib/paypal-single-seller-sandbox');

// amountCents and referenceId must come from trusted server-side order data.
const order = await createSandboxOrder({
  env: process.env,
  paypalApi, // reuse the server's existing PayPal API wrapper
  referenceId: persistedOrder.id,
  description: 'House of Briar sandbox checkout',
  amountCents: persistedOrder.totalCents,
  currency: 'USD',
  returnUrl: `${appOrigin}/?checkout=paypal-sandbox-return`,
  cancelUrl: `${appOrigin}/?checkout=paypal-sandbox-cancel`,
});
// Redirect the test buyer to order.approvalUrl.

// On the return path, look up persistedOrder from the authenticated server-side session.
const result = await captureSandboxOrder({
  env: process.env,
  paypalApi,
  orderId: storedPaypalOrderId,
  referenceId: persistedOrder.id,
  amountCents: persistedOrder.totalCents,
  currency: 'USD',
});
// Only result.status === 'COMPLETED' indicates a completed sandbox capture.
```

Do not add `PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED=true` to any production environment. Do not set `PAYPAL_MARKETPLACE_APPROVED=true` as a workaround. The Default Application's successful OAuth handshake is not evidence of PayPal marketplace approval or seller/payout permissions; those must be enabled on the dedicated Platform Partner App by PayPal.
