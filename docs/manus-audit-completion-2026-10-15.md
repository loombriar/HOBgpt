# Completion of the October 14 Manus audit

Audit baseline: `14d4d7806f0fc146baa29201541b394d2098a245`.
The shared Manus replay stopped during integration; none of its later changes reached main. This change implements the fixes against that baseline.

| Finding | Change |
| --- | --- |
| Deposit refunds falsely marked complete | Store refund intent and provider status; bind ID, intent, amount and currency; mark refunded only on success. Poll known IDs and process signed refund events. New deposit collection remains disabled. |
| Unknown Checkout creation releases stock | Persist exact request and idempotency key in the same transaction as the order/reservations. Keep inventory and promotions reserved after timeouts/response loss. Recover by same-key replay or a provider-bound signed event. Block cancellation until the session is known and expires safely. |
| Checkout returns to wrong frontend | Generate `/checkout` callbacks. Forward older root callbacks without losing their session or cancellation token. |
| Unbounded Stripe calls/interrupted payouts | 30-second application deadline, durable exact-request ledger, automatic recovery on startup and periodically, original keys only. Unknown payouts stay in flight and block refunds. Resume interrupted reversal/refund workflows. |
| Rotation leaves privileged sessions active | Fingerprint bootstrap credentials in sessions; validate designer cookies in both designer and buyer routes. Admin sessions without a matching credential fingerprint fail closed. Pre-migration designer sessions require one fresh sign-in. Mailbox sessions have no bootstrap dependency. |
| Incomplete media backups verify | Creation and verification require all ready listing media and referenced portraits, logos, portfolio and studio photos, covered by the manifest. Missing media prevents publication/upload/restore. Use fresh output directories outside DATA_DIR. |
| Private listings counted publicly | Count distinct listings using the gallery visibility policy. |
| Withdrawn media still accessible | Reject paused listings or inactive designers; remove immutable caching from listing media. Previously downloaded copies cannot be recalled. |
| Missing TypeScript gate | Add supported no-emit configuration, fix highlighter token contracts and privacy-signal declarations, typecheck in CI. |
| Shared signup count assertion | Assert exactly one fixture account for a unique test email and a nonzero dashboard daily count rather than a global absolute count. |
| Fresh React PWA entry | Register the same network-only public offline fallback from React; add clean-profile `/shop` browser coverage. |
| Retired external automation gateway | Replace the mounted widget with the existing House support route. No new external gateway is required for that support entry. |

## Recovery limits and operator visibility

Unknown POST requests replay only before 23 hours from the persisted claim, preserving Stripe's minimum 24-hour idempotency retention margin. A response/authentication failure on a replay cannot prove that an earlier attempt did not happen. Beyond that window the operation requires Stripe-side evidence; automatic retries stop and holds remain. The authenticated Admin Payment recovery queue exposes only kind, reference and state/timestamps, never request bodies or cancellation tokens.

Previously stranded payouts without a durable request ledger are not retried automatically: the application cannot reconstruct proof of their original outcome. Known historical refund IDs are checked against the provider; a false historical `deposit_refunded` state can be corrected after bound provider evidence. Declined refunds remain visible and cannot silently create a second refund.

Backup creation fails closed on snapshot/copy races instead of claiming it can coordinate every deletion. Production off-site restore and persistent-volume survival still need operational evidence. Source checks and disposable restore tests do not prove those live conditions.

## Release validation

Run backend and frontend regressions, TypeScript, production build, and GitHub Chromium/Docker checks. New mock regressions cover refund statuses and response loss, unknown checkout recovery (replay/webhook/timeout), inventory holds, original-key payout recovery, session rotation across restart, missing media, concurrent replays, interrupted local commits, and the 23-hour boundary.

The audit's braces development/build-chain advisory remains a narrow exception until November 15, 2026: builds process trusted repository patterns; no production dependency audit suppression is added. Reassess or migrate the affected build tooling before that date. This does not claim a storefront endpoint exploit or a patched upstream version.

Physical signed Android launch/back-navigation, live Stripe/Shippo end-to-end delivery, and a production off-site restoration drill are separate release checks and are not established by this patch. No real financial transaction is part of validation.

## Verified local result

- Backend: 288 tests passed.
- Frontend: 41 tests passed.
- Chromium browser suite: all 64 tests passed with three workers, including isolated server-generated paid/unpaid/canceled callbacks and clean-profile offline entry.
- TypeScript no-emit check and production build passed.
- Backend and frontend production dependency audits: zero reported vulnerabilities.
- Backup tests include a disposable restore and rejection of missing referenced media.

These results establish local verification. GitHub CI, merge status, and production deployment must be verified separately; local tests do not establish a live release.
