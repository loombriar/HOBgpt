# Real Stripe sandbox payment and refund API smoke test

This test **creates and refunds an actual Stripe test-mode PaymentIntent** (not a Checkout Session) using Stripe's `pm_card_visa` test payment method. It performs real **test API writes** but no live payments or payouts.

Run in a protected, isolated development environment only:

```sh
RUN_HOB_STRIPE_MUTATION_TESTS=true \
HOB_STRIPE_TEST_WRITES_ACK=I_AUTHORIZE_TEST_PAYMENTS_AND_REFUNDS \
STRIPE_TEST_SECRET_KEY=sk_test_... \
node --test tests/stripe-real-test-payment-refund.test.js
```

Optional `HOB_STRIPE_TEST_AMOUNT_CENTS` must be 100–1000 (default 200). Keep keys in protected secrets, not committed files. The test refuses production `NODE_ENV`, non-test keys, missing explicit authorization, and larger amounts. It creates and confirms a test PaymentIntent, issues a full test refund, repeats the same refund request with an idempotency key, and retrieves the resulting refund.

**Known limits:** This is a Stripe API smoke test, not the requested fully automated House of Briar Checkout-to-refund E2E. It does not create House of Briar orders, deliver real Stripe webhooks, exercise Checkout Sessions, or validate the application ledger. PR #571 covers signed synthetic webhook replay; PR #570 verifies a pre-prepared application refund fixture. Integration of all stages into one disposable self-contained test is still pending. Do not enable international payouts or production checkout on the basis of these tests.
