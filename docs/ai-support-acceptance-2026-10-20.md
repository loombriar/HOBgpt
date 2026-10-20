# AI support acceptance — October 20, 2026

Tester: Codex. Environment: existing House of Briar payment-test website, signed-in test designer session. This is a deployed browser/provider test, not a mocked response.

## Observed result

- Opened Need help, entered `How does shipping work for designers on House of Briar?`, and continued to the account support form.
- Before consent, Ask House support was disabled and the form explained the consent requirement.
- Selected the explicit OpenAI question/order-summary consent. Left order reference empty and support-ticket permission unchecked. Submitted the same general shipping-policy question under the operator's existing AI-support test authorization.
- The UI returned a substantive answer covering free US delivery in the listed price, designer-paid postage and packaging, explicit approval for eligible label purchases, externally purchased postage and tracking, dispatch estimates, and separate designer shipments. It included the current House support email and policy links.
- The observed request did not show the previous generic unavailable fallback. This verifies the general shipping-policy support path after the earlier HTTP 429 billing failure. It does not verify order lookup, refunds, escalation/ticket creation, or other AI features.

## Independent release checks

- Current main commit `9486d2a1803de34baa12ff786f2ebcd0324c55cb`: Node.js CI, Backend safety suite and Docker build verification completed successfully.
- House of Briar production deployment `67471cc2-4d18-497b-a0dc-6426d651de41` and staging deployment `239cef1f-7772-45a3-a61f-1bc73a3681e1`: SUCCESS, each with one running replica, zero crashed replicas, and no pending environment work when checked. The payment-test deployment SHA was not independently established in this browser test; do not infer it from these separate deployment checks.
- Retrieved production backup logs include a verified 10-file snapshot, SQLite integrity verification, 11-object off-site upload and successful completion at `2026-10-19T21:32:10Z`. This is historical backup success, not a new restore drill or proof of current scheduled-backup freshness.

## Remaining gates

- Administrator role enforcement (#482); staging identity/MFA recovery acceptance (#446); remaining runtime/proxy deployment verification (#323).
- Separate staging Connect-button retest and remaining provider-backed payout acceptance.
- Physical signed Android journeys and actual Play production-access/testing gates.
- Other advertised AI features and order-specific support paths retain their separate acceptance requirements.

No production configuration, payment, shipment, refund, payout or account permissions were changed by this review. No support ticket was requested. Overall release signoff remains incomplete.
