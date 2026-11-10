# Admin-only PayPal sandbox test orders

This is an **isolated operator smoke test**, not a storefront payment method. It is layered on top of the sandbox helper in PR #719. Stripe, donations, real merchandise orders, inventory, designer earnings, payouts and fulfillment are untouched.

## Gate

Requires sandbox PayPal credentials, `PAYPAL_ENVIRONMENT=sandbox`, and `PAYPAL_SINGLE_SELLER_SANDBOX_ENABLED=true`. Disabled in production except explicitly named Railway staging. Use only PayPal sandbox buyer accounts and never set this flag in production. The endpoints require an authenticated House of Briar owner/operator session or permitted admin bearer token; admin MFA policy applies. Browser requests must pass the existing admin origin checks.

## Test order flow

1. POST `/api/admin/paypal-sandbox/test-orders` with authenticated admin credentials. The request body is ignored. The server persists a **fixed USD $1.00 test item**, then creates one sandbox PayPal order and stores its ID. The response includes the PayPal sandbox approval URL.
2. Approve with a sandbox buyer account. The return URL is informational only: it never captures or fulfills anything automatically.
3. POST `/api/admin/paypal-sandbox/test-orders/:id/capture` using the **same authenticated admin actor**. The server reloads the persisted order, checks the remote PayPal order's ID, reference, currency and amount, and captures only an approved order. A previously completed matching remote capture can be reconciled after a crash. A completed local capture returns idempotently.
4. GET `/api/admin/paypal-sandbox/test-orders/:id` reads the persisted test status, restricted to its creating admin actor.

Test orders are stored in `paypal_sandbox_test_orders` (SQLite), not in the merchandise `orders` table. The feature does not reserve inventory, publish items, trigger shipping, or award payouts. It does not implement marketplace splits, webhooks, refunds, or automatic scheduled reconciliation. Failed or uncertain remote results must be investigated manually before retries.

Run `node --test tests/paypal-single-seller-sandbox.test.js tests/paypal-sandbox-test-orders.test.js` and the full `npm test` suite before merging. Real PayPal sandbox smoke testing and GitHub CI still need to be completed.
