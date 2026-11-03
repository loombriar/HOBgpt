# PayPal marketplace sandbox — approval-gated preparation

**Status:** PayPal marketplace application submitted; marketplace approval and delayed-disbursement capabilities have **not** been verified. This PR is planning and preflight only. It does not enable checkout, seller onboarding, transfers, holds, or refunds.

## Existing integrations to preserve

- Donations use `/api/paypal/donations/order`, verified capture/recovery and optional verified webhooks.
- Merchandise PayPal endpoints `/api/paypal/checkout/order` and `/api/paypal/checkout/capture` deliberately return unavailable.
- Stripe Connect remains the merchandise payment and designer-transfer rail. Keep existing payout holds, shipping verification, refunds, historic order reconciliation, and outstanding balances untouched.
- Digital subscriptions in the Android app require a separate Google Play billing policy review.

## Provider questions before implementation

1. Is House of Briar approved as a PayPal marketplace/commerce platform, not merely a verified business?
2. Which partner onboarding, seller account permissions and API products are enabled in **sandbox and live**?
3. Can House of Briar retain its commission at capture, and what are the supported fee/split mechanics?
4. Are delayed disbursements supported for this account, for how long, and with which restrictions and failure modes?
5. What is the authorized flow for multi-designer carts, partial refunds, chargebacks, seller disputes and payout reversals?
6. What are the required webhooks, signature checks, idempotency rules, reporting and reconciliation identifiers?

Do not assume that the existing donation credentials grant partner/marketplace capabilities. Do not reuse live secrets in sandbox.

## Proposed implementation phases (separate reviewed PRs)

1. Confirm written provider approval and API product documentation; record exact permissions without secrets.
2. Add a **separate sandbox-only** marketplace client with explicit feature gating, validated seller identities, and mockable provider calls. Do not alter donations.
3. Implement sandbox seller onboarding and order mapping, with atomic records and idempotency; retain Stripe as default.
4. Implement commission calculation and provider-supported delayed payouts behind verified shipping/order completion, with failure-safe holds.
5. Implement refunds, partial cancellations, disputes, reversals, reconciliation and operational alerts.
6. Test mixed-designer orders, retries, duplicate events, delivery holds, refunds and payment failures end-to-end before any production rollout.

## Current preflight

`lib/paypal-marketplace-readiness.js` reports whether a sandbox environment and credentials are configured, and whether approval has been explicitly marked. **It always reports transactions disabled**; it is intentionally not wired to the server and never contacts PayPal.

Run `node --test tests/paypal-marketplace-readiness.test.js` (or the full `npm test` suite) locally or in CI.
