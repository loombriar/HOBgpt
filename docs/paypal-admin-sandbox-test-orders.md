# Admin-only PayPal sandbox test orders

This is an isolated staging smoke test, **not a storefront payment method**. It does not change the public catalog, cart, merchandise order table, Stripe checkout, designer earnings, inventory, refunds, shipping, or fulfillment.

## Enable on Railway staging only

Set the following in the Railway **staging environment variables** using the PayPal **Default Application sandbox** credentials:

```dotenv
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=<Default Application sandbox Client ID>
PAYPAL_CLIENT_SECRET=<Default Application sandbox Secret>
PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED=true
PAYPAL_MARKETPLACE_APPROVED=false
```

The API also checks `RAILWAY_ENVIRONMENT_NAME`. In production mode it is enabled only when this equals `staging`; a normal production environment is denied. Confirm the actual Railway environment name matches exactly before testing. Never add these sandbox credentials to the production environment, and never substitute live PayPal credentials.

The public test panel appears only in the private admin dashboard after an owner/operator has authenticated, and only when the environment gate is active. The backend routes separately authenticate the admin and require the `owner` or `operator` role. The list response is limited to the creating admin actor.

## Test flow

1. In the staging admin page, create a fixed USD $1.00 test order.
2. Open the returned PayPal sandbox approval link in a new tab and use a PayPal sandbox buyer account only.
3. Return to the staging admin page and explicitly capture the approved test order.
4. Refresh status; only a verified matching sandbox capture is recorded.

Return from PayPal never captures automatically. The API ignores client-supplied prices, currency, seller, and redirect targets. Test rows are stored separately in `paypal_sandbox_test_orders`, never in the merchandise `orders` table.

## Local verification

Run:

```sh
node --test tests/paypal-single-seller-sandbox.test.js tests/paypal-sandbox-test-orders.test.js
npm --prefix apps/default test
npm --prefix apps/default run typecheck
npm --prefix apps/default run build
```

A mock-backed test pass does not replace the final manual sandbox test. Do not test with a live buyer account or real payment details.
