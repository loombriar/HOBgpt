# Automated signed Stripe Checkout webhook verification

Run `node --test tests/designer-signed-checkout-webhook-e2e.test.js` after preparing an isolated local application server with a temporary database, `ENABLE_TEST_SETTLEMENT_JOURNAL=true`, and `STRIPE_WEBHOOK_SECRET` set to the same `whsec_` test secret supplied below. **Never use a production database or public staging endpoint.**

Required protected environment variables:
`RUN_HOB_SIGNED_WEBHOOK_E2E=true`,
`HOB_E2E_BASE_URL=http://127.0.0.1:<port>`,
`HOB_E2E_ADMIN_TOKEN`,
`HOB_E2E_ORDER_ID`,
`HOB_E2E_CHECKOUT_SESSION_ID=cs_test_...`,
`HOB_E2E_PAYMENT_INTENT_ID=pi_...`,
`HOB_E2E_WEBHOOK_SECRET=whsec_...`,
`HOB_E2E_CURRENCY=usd`,
`HOB_E2E_CHECKOUT_TOTAL_CENTS`, and
`HOB_E2E_DESIGNER_IDS=id1,id2`.

The pre-created local order must match the test Checkout session, have two designer allocations, and be awaiting payment. The test automatically constructs a Stripe-shaped `checkout.session.completed` payload, signs it using Stripe's timestamped HMAC format, rejects a bad signature, delivers the valid event twice, and checks each designer has exactly one test-mode sale and commission entry. It uses the **existing** webhook route and real database state.

**Scope limits:** This is a signed synthetic event, not an event delivered by Stripe; it does not create/complete a Stripe Checkout session or initiate a refund. The previously added refund verifier remains separate. This PR therefore advances webhook automation but **does not yet achieve a fully self-contained real Stripe Checkout-to-refund E2E test**. No Stripe API writes, live checkout activation, or international payout changes are introduced.
