# House of Briar release acceptance evidence

This checklist is a release gate, not evidence that production integrations have passed. Record tester, date, environment, build SHA, result and redacted evidence for every row. Do not use real payment cards or production customer data.

| Gate | Acceptance evidence | Result |
| --- | --- | --- |
| Shopper email-code signup | New address receives code; invalid, expired, replayed and rate-limited codes rejected; session survives relaunch and logout invalidates it | NOT TESTED |
| Designer signup and Stripe Connect | New seller completes test-mode onboarding; refresh/return works; payouts only enabled after eligibility verification | NOT TESTED |
| Listing moderation | Seller creates, edits, uploads, submits; admin approves; only approved item is public; rejection and isolation verified | NOT TESTED |
| Model/photographer portfolios | Role-scoped uploads, privacy, edits and deletion; free/premium limits; subscription renewal and cancellation | NOT TESTED |
| Checkout and refund | Stripe test-mode checkout, signed webhook, persisted order, email confirmation, refund ledger and payout hold | NOT TESTED |
| Measurements and favorites | Favorites persist across login/relaunch; measurements are NOT persistent (known blocker) | BLOCKED |
| AI features | Validate each advertised feature separately; confirm consent, unavailable provider handling and no fabricated fabric/fit claims | NOT TESTED |
| Privacy and deletion | In-app policy, recent-login deletion, session invalidation, protected-record review, support escalation | NOT TESTED |
| Android device | Complete mobile/ANDROID-DEVICE-TESTS.md on a signed release-equivalent physical phone | NOT TESTED |
| Google Play | Inspect actual Console Data Safety, app access, billing, privacy/deletion, target SDK, signing and version code | NOT TESTED |

## Blocking release dependencies

- Customer measurements currently live only in memory. Do not advertise them as saved between sessions.
- Verify shipping provider credentials and a provider-backed tracking-to-payout journey without bypassing holds.
- Determine compliant Android billing for Premium Portfolio digital subscriptions before publishing purchase entry points.
- Record signed AAB certificate and target SDK; successful unsigned CI does not establish release readiness.
- Do not mark any gate PASS based solely on source review, mock tests, or a build.

## Execution order

1. Use isolated test accounts and Stripe test mode for shopper, seller, listing, purchase, refund and subscription flows.
2. Run physical Android login, Back, picker, external checkout return, offline and rotation checks.
3. Reconcile Play Console declarations against the actual installed release and production providers.
4. Require all release gates to be PASS, with linked evidence, before production rollout.
