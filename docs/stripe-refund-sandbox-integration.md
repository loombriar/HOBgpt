# Opt-in Stripe test-mode refund integration

Run `npm test` for normal backend coverage. The live Stripe sandbox integration test is skipped by default and performs **GET only** against Stripe's test API. It never creates a charge, refund, transfer, or webhook.

For an existing **succeeded** Stripe test refund whose metadata includes `order_id` and `refund_scope=full`, provide the following as environment variables in a protected test runner (never commit values):

- `RUN_STRIPE_REFUND_SANDBOX_TESTS=true`
- `STRIPE_TEST_SECRET_KEY=sk_test_...`
- `STRIPE_TEST_REFUND_ID=re_...`
- `STRIPE_TEST_CHECKOUT_SESSION_ID=cs_test_...`
- `STRIPE_TEST_ORDER_ID=...`
- `STRIPE_TEST_REFUND_AMOUNT_CENTS=...`
- `STRIPE_TEST_REFUND_CURRENCY` is **not used**; set `STRIPE_TEST_CURRENCY=usd`
- `STRIPE_TEST_REFUND_SCOPE=full` (optional)

Then run `node --test tests/designer-stripe-sandbox-integration.test.js`.

The test retrieves real provider evidence, creates an isolated in-memory two-designer accounting fixture, applies the refund twice to confirm idempotence, checks audit entries and zero available earnings, and injects a failed provider response to assert fail-closed behavior. It does **not** verify the app's Checkout, signed webhook delivery, persisted real order records, or actual refund creation. Those remain separate deployment-environment E2E milestones. The fixture's split and fee percentages are synthetic and do not prove actual seller allocations for the provider transaction.

When explicitly enabled, missing configuration fails the test; it is not silently skipped. No production or international payout functionality is activated.
