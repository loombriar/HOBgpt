# House of Briar release acceptance evidence

Updated October 18, 2026 (UTC). Assessed application commit: `6834dd0cbb8e8c4df9428b5024c2a0946a24a6e4` (PR #432).

**Overall release signoff: INCOMPLETE.** Automated tests, production observations, and operator-reported results are separate evidence levels. A passing build or mocked provider test does not prove a complete Stripe/Shippo transaction, physical Android behavior, or Play Console approval.

## Verified automated and deployment evidence

- [Node.js CI on the assessed main commit](https://github.com/loombriar/HOBgpt/actions/runs/39080382742): successful. Final PR-head logs record 351 backend tests, 52 frontend tests and 107 browser tests passing, including mobile designer signup through deletion. Dependency audits, TypeScript and production build passed.
- [Android unsigned verification](https://github.com/loombriar/HOBgpt/actions/runs/39080382705): successful. This is build evidence, not physical-device or signed-release acceptance.
- [Docker verification](https://github.com/loombriar/HOBgpt/actions/runs/39080382646): successful.
- Production deployment `ce35fd86-7473-4504-a1fa-326963a570e4` reached SUCCESS with the assessed commit. Live health returned HTTP 200 with database/storage/build readiness; deletion routes rejected unauthenticated requests with HTTP 401.
- Production logs at 2026-10-17 23:55:07–23:55:12 UTC recorded SQLite integrity/file verification and a verified off-site upload (10 snapshot files, 11 uploaded objects). The matching downloaded backup subsequently passed the isolated restore drill below.
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
| Backup and restore | WAL-consistent snapshot, hashes, referenced media and isolated restore/corruption/overwrite checks covered by `tests/backup-data.test.js`; off-site transfer tests also pass | PASS for the October 18 isolated drill of a downloaded production backup: 10 verified files, SQLite integrity OK, restored core counts preserved, 4 nondeleted listing reads, 2 order reads, 9 image decodes and 8 public photo responses. No provider calls or live/bucket writes. Repeat periodically; authentication, measurement decryption and provider recovery are outside this drill. |
| Physical Android | Unsigned build and mobile-sized browser tests pass | Complete `mobile/ANDROID-DEVICE-TESTS.md` using the installed signed release-equivalent app. Login, Back, uploads, checkout return, offline/rotation and deletion need device evidence. |
| Google Play | Repository/build checks do not establish Console acceptance | Verify actual Data Safety, app access, privacy/deletion disclosures, digital-subscription billing, signing, target SDK and version code against the installed release. |

## Remaining signoff work

1. Complete and record authenticated, provider-backed staging Connect → checkout → signed webhook → tracking → payout/refund scenarios. Preserve test/live separation and existing holds.
2. Finish physical Android and actual Play Console review, including digital-subscription billing before exposing purchase entry points.
3. Complete live AI acceptance per feature and protected-record deletion review.
4. Finish administrator identity/MFA or passkey hardening and review retirement of legacy bearer API compatibility; normal browser storage migration is already implemented.

For every remaining gate record tester, date/time, environment, commit SHA, test record identifiers, expected/actual result and redacted evidence. Do not publish personal data, tokens or payment details here. Full release acceptance requires applicable live/provider/device gates to be completed; automated PASS results do not substitute for them.

## Production backup restore drill — October 18, 2026

- Tester: Codex, automated private disposable Railway worker, `NODE_ENV=test`. No public domain, TCP proxy or persistent volume. No payment, shipping, email, AI or application credentials were configured; only backup-storage references were supplied. The worker and its credential references were deleted after the run.
- Backup: `house-of-briar/2026-10-17T23-55-05-397Z/`; downloaded with GET requests. Manifest SHA-256: `32b00aea66fedb6828386e28c8d46fc8453864cc97ed42bc16447727f9713b81`.
- Reviewed drill source: `2deb942764b81aab072bde42edb5cc487fe44455` ([PR #434](https://github.com/loombriar/HOBgpt/pull/434)). Worker deployment: `6851cd4f-c8de-4af0-8468-fa82701efd83`, SUCCESS; PASS report at `2026-10-18T00:22:17.257Z`.
- Actual result: all 10 files (2,944,500 bytes) matched the manifest; referenced media verification and SQLite `integrity_check` passed. Restored counts were 11 listings (including deleted records), 4 designer profiles, 1 customer account, 2 orders and 2 order items, unchanged after isolated app startup. The app read 4 nondeleted listings and both orders; all 9 image files decoded, and 8 public photo responses returned image content.
- The worker restored only into a fresh temporary directory, bound its app to loopback, blocked provider operations, and removed its temporary files. Reported provider calls, backup-bucket writes and live-data writes: zero. Earlier attempts stopped at the drill's overly restrictive filename validator before restore; regression coverage now accepts safe filename characters while rejecting traversal, duplicates and existing destinations.
- The live service retained application source commit `5f807b5` (documentation successor to assessed app `6834dd0`) and its existing `/data` volume/configuration. Railway redeployed that same source during environment changes; latest deployment after the drill was `826c7093-d1bf-4328-97a4-b0b77adb36bb`, SUCCESS. Production recovery/overwrite was not performed.
- Limitations: this proves recovery of the selected snapshot, not recovery-point freshness for later changes, customer/designer sign-in, encrypted-measurement decryption, provider reconciliation or physical-device behavior. Encryption keys require separate secure recovery arrangements.

The [machine-readable aggregate report](production-restore-evidence-2026-10-18.json) contains no account identities, order identifiers or credentials. Local verification: 5 backup/restore tests passed, including a full downloaded-snapshot/app/photo fixture, corruption and overwrite refusal, and unsafe environment/path rejection.
