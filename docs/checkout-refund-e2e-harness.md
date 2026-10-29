# Local-only Checkout-to-refund sandbox verification harness

This opt-in harness verifies a **pre-provisioned** Stripe test Checkout/refund lifecycle against the application's existing admin ledger and audit endpoints. It does not create Checkout sessions, deliver signed webhooks, initiate refunds, or provision designers. Those steps must first be performed in an isolated disposable application instance with Stripe test credentials and two test designer order items.

## Required fixture preparation (manual)

1. Start a **disposable local** House of Briar server on loopback, backed by a temporary database and test-only Stripe configuration. Do not use a production database, production proxy, or live Stripe keys.
2. Create a two-designer order through the existing Checkout flow, complete a Stripe test-mode payment, and deliver the real signed Checkout webhook using the Stripe CLI or configured sandbox webhook endpoint. Confirm the paid order and original test journal sale/commission entries.
3. Create a full succeeded Stripe test refund through the existing authorized test refund flow, and deliver/confirm refund webhook processing. Ensure Stripe refund metadata includes `order_id` and `refund_scope=full`, and that the local `order_refunds` row references the same refund. Use a full item-gross refund with no shipping, paid transfers, or overlapping refund scopes.
4. Supply `RUN_HOB_CHECKOUT_REFUND_E2E=true`, `HOB_E2E_BASE_URL=http://127.0.0.1:<port>`, `HOB_E2E_ADMIN_TOKEN`, `HOB_E2E_ORDER_ID`, `HOB_E2E_DESIGNER_IDS=id1,id2`, `HOB_E2E_REFUND_ID`, and `STRIPE_TEST_SECRET_KEY=sk_test_...` to a protected local test process.
5. Run `node --test tests/designer-checkout-refund-e2e.test.js`.

The harness fetches actual Stripe refund evidence, checks allocation previews, explicitly applies the test-only refund journal twice to verify idempotence, then verifies the ledger and audit history for both designers. It is skipped in ordinary CI; enabling without configuration fails closed.

**Limitations:** The test does not itself execute Checkout or webhook delivery, so it is a fixture-driven integration verifier, not yet a self-contained E2E runner. It cannot prove webhook signatures or event replay unless fixture preparation separately checks those steps. It makes no Stripe mutations but **does write to the local test ledger**; never run it against a real database. International checkout and payouts remain disabled.
