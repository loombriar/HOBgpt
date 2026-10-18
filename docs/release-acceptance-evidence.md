# House of Briar release acceptance evidence

Updated October 17, 2026 (America/New_York). Assessed application commit: `6834dd0cbb8e8c4df9428b5024c2a0946a24a6e4` (PR #432).

**Overall release signoff: INCOMPLETE.** Automated tests, production observations, and operator-reported results are separate evidence levels. A passing build or mocked provider test does not prove a complete Stripe/Shippo transaction, physical Android behavior, or Play Console approval.

## Verified automated and deployment evidence

- [Node.js CI on the assessed main commit](https://github.com/loombriar/HOBgpt/actions/runs/39080382742): successful. Final PR-head logs record 351 backend tests, 52 frontend tests and 107 browser tests passing, including mobile designer signup through deletion. Dependency audits, TypeScript and production build passed.
- [Android unsigned verification](https://github.com/loombriar/HOBgpt/actions/runs/39080382705): successful. This is build evidence, not physical-device or signed-release acceptance.
- [Docker verification](https://github.com/loombriar/HOBgpt/actions/runs/39080382646): successful.
- Production deployment `ce35fd86-7473-4504-a1fa-326963a570e4` reached SUCCESS with the assessed commit. Live health returned HTTP 200 with database/storage/build readiness; deletion routes rejected unauthenticated requests with HTTP 401.
- Production logs at 2026-10-17 23:55:07–23:55:12 UTC recorded SQLite integrity/file verification and a verified off-site upload (10 snapshot files, 11 uploaded objects). This is backup/upload evidence, not proof of restoring a downloaded production backup.
- Operator confirmed email delivery during this session. This is operator-reported inbox evidence, not a blanket test of every transactional email template.

## Gate status

| Gate | Current implementation and automated evidence | Live/operator evidence and remaining work |
| --- | --- | --- |
| Shopper email-code sign-in | HttpOnly server sessions; verification, expiry/replay/rate limits, logout and isolation covered by `tests/customer-accounts.test.js` and browser suites | Public signup entry checked. Record the complete staging sign-in/relaunch journey and physical-device result. |
| Designer sign-in and Stripe Connect | Email-verified cookie sign-in covered by `e2e/designer-email-auth.spec.js`; legacy bearer API compatibility remains. Connect readiness and payout gates have regression coverage. | Designer signup entry checked; signup email delivery operator-confirmed. Provider-backed Connect onboarding and current eligibility still require staging evidence. |
| Listing moderation | Draft/edit/upload/review/resubmission/publication boundaries covered by `e2e/listing-review.spec.js`, designer signup browser coverage and backend tests | Record a deployed-staging creator → admin → creator → approval journey, including actual notifications. |
| Model/photographer portfolios | Role/privacy and subscription lifecycle have automated coverage | Provider-backed renewal/cancellation and Android subscription publication/billing review remain unverified. |
| Checkout and refunds | Automated inventory, ownership, signed webhook, refund, payout-hold and recovery checks pass using isolated fixtures/provider mocks | Live add/remove/cart totals/free delivery and unsigned-in checkout-page access checked without creating a payment. A complete deployed-staging provider-backed checkout/webhook/refund journey is still required. |
| Measurements and favorites | Saved customer measurement profiles are encrypted in SQLite, account-scoped and persistent. `e2e/saved-measurements.spec.js` verifies reload, a second authenticated browser context, account-page parity and deletion; backend encryption/isolation tests pass. | The old “memory only” blocker is obsolete. Physical Android/relaunch and production-account checks remain separate acceptance steps. Do not confuse old device-only forms/data with saved account profiles. |
| AI features | Support consent, order isolation, safe escalation and provider failures have automated coverage; listing/fabric/styling safeguards have separate tests | Guest support and overlay navigation checked live. Actual provider answers and consent/fallback behavior for every advertised AI feature still need deployed evidence. |
| Privacy and deletion | Customer deletion and recent-sign-in designer deletion implemented. Tests cover revocation, protected records, concurrent work and isolation. | One authorized empty designer account was deleted live; another deletion correctly stopped for protected-record review and remains suspended. The public directory was checked. This is partial evidence, not completion of every privacy workflow. |
| Backup and restore | WAL-consistent snapshot, hashes, referenced media and isolated restore/corruption/overwrite checks covered by `tests/backup-data.test.js`; off-site transfer tests also pass | Verified production off-site upload observed. Restore a recent downloaded production backup into an isolated environment and record database/media/app checks; do not overwrite production. |
| Physical Android | Unsigned build and mobile-sized browser tests pass | Complete `mobile/ANDROID-DEVICE-TESTS.md` using the installed signed release-equivalent app. Login, Back, uploads, checkout return, offline/rotation and deletion need device evidence. |
| Google Play | Repository/build checks do not establish Console acceptance | Verify actual Data Safety, app access, privacy/deletion disclosures, digital-subscription billing, signing, target SDK and version code against the installed release. |

## Remaining signoff work

1. Complete and record authenticated, provider-backed staging Connect → checkout → signed webhook → tracking → payout/refund scenarios. Preserve test/live separation and existing holds.
2. Restore a downloaded production off-site backup into an isolated directory/environment and verify the application, records and referenced images. Keep live provider/email credentials out of the drill.
3. Finish physical Android and actual Play Console review, including digital-subscription billing before exposing purchase entry points.
4. Complete live AI acceptance per feature and protected-record deletion review.
5. Finish administrator identity/MFA or passkey hardening and review retirement of legacy bearer API compatibility; normal browser storage migration is already implemented.

For every remaining gate record tester, date/time, environment, commit SHA, test record identifiers, expected/actual result and redacted evidence. Do not publish personal data, tokens or payment details here. Full release acceptance requires applicable live/provider/device gates to be completed; automated PASS results do not substitute for them.
