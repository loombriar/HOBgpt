# Unified Stripe sandbox lifecycle integration test

Opt-in command (run only in a protected test environment):

```sh
RUN_HOB_UNIFIED_SANDBOX_E2E=true \
HOB_STRIPE_TEST_WRITES_ACK=I_AUTHORIZE_TEST_PAYMENTS_AND_REFUNDS \
STRIPE_TEST_SECRET_KEY=sk_test_... \
node --test tests/designer-unified-stripe-sandbox.test.js
```

The test creates a Stripe test-mode PaymentIntent and confirms payment using a Stripe test payment method; creates a disposable House of Briar SQLite order with two designers; signs and delivers a **synthetic** paid Checkout webhook twice; verifies test settlement sales/commissions; creates and retrieves a real Stripe test refund; and applies the verified test refund journal twice to check audit and idempotence. The local server uses an ephemeral port and a temporary database, deleted at the end.

**Not a true hosted Stripe Checkout E2E:** the Checkout session ID and webhook event are synthetic. The test bypasses the real House of Briar Checkout session creation, browser completion, and actual Stripe webhook delivery. It also inserts the local succeeded refund row directly rather than processing a refund webhook. These are explicit remaining gaps before calling the entire real Checkout lifecycle validated.

**Safety:** opt-in only, `sk_test_` required, explicit authorization, `NODE_ENV=production` rejected, Stripe API writes limited to a $2 test PaymentIntent and its refund. No live transfers or international payouts. CI does not exercise the opt-in path without credentials. Test must be executed against real Stripe sandbox and inspected before treating it as validated.
