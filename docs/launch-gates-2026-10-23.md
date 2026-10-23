# House of Briar launch gates — October 23, 2026

**Decision: NO-GO for live commerce until the evidence below is signed off.** This document is a checklist, not an assertion that production or staging was tested. Do not paste tokens, cookies, authenticator codes, payment details or customer information into GitHub.

| Gate | Evidence required | Status |
| --- | --- | --- |
| Security incident recovery | Provider-issued replacement credentials in both environments; old credentials revoked; audit review and deploy SHA captured | BLOCKED — operator |
| Admin identity and MFA | Unique named accounts, enrollment, bearer denial, stale-session denial, role 403 and recovery drill on staging | BLOCKED — operator |
| Checkout | Provider-backed test Connect onboarding, checkout, signed webhook, commission calculation and seller ledger reconciliation | BLOCKED — provider |
| Refund and payout | Full/partial refunds, replay, interrupted transfer, hold and release reconciliation against provider records | BLOCKED — provider |
| Shipping and email | Tracking callback verification, label mode boundaries and actual transactional delivery | BLOCKED — provider |
| Data recovery | New backup with valid provider-issued access-key pair and isolated restore after October 21 rotation | BLOCKED — operator |
| Mobile moderation | Creator draft → submit → admin feedback → edit → resubmit → approve, mobile navigation and notification checks | BLOCKED — staging |
| Android and Play | Signed app physical-device journeys, disclosures and Play Console acceptance | BLOCKED — device/console |

## Automated checks

Run `node scripts/check-launch-readiness.js`, `npm ci && npm test`, `npm --prefix apps/default ci && npm --prefix apps/default test && npm --prefix apps/default run typecheck && npm --prefix apps/default run build`, and `npm run test:e2e` in an isolated test environment. CI must be green at the exact release commit. These checks do not clear operator/provider gates.

For every manual gate record environment, commit, date, tester, expected/actual results, redacted evidence and rollback owner. Never change Railway configuration as part of this PR. Do not enable live payouts or loosen holds merely to make a test pass.

## Regression scenarios to preserve

- Anonymous and restricted-role requests cannot approve listings, inspect sensitive orders, refund or release payouts.
- MFA bearer-only access fails when enforcement is enabled; logout invalidates prior sessions.
- Duplicate and out-of-order signed webhooks do not double-transfer, double-refund or release held payouts.
- Standard 7% and eligible 5% commissions exclude extras according to policy; partial refunds reconcile remaining seller balances.
- Mobile admin feedback is actionable, creator can resubmit, and publication happens only after approval.

Open mobile feature PRs should be reviewed for overlap before merging. This checklist deliberately does not claim those UI changes have landed.
