# Staging adjustment reconciliation

PR #562 is present on staging and its backend safety suite succeeded.

This stage introduces an explicit admin-only `POST /api/admin/designer-settlement-ledger/reconcile-test-adjustments` with `{"orderId":"...","designerId":"...","apply":false}` for preview. With `apply:true`, confirmed test-mode postage charges and completed transfer records are imported idempotently. No external Stripe calls or payouts are initiated.

**Fail-closed:** Only paid `cs_test_` orders qualify. Pending/refunded postage, postage adjustments, unresolved refunds, reversal references, in-flight transfers, or missing transfer references block the entire import. These cases are reported for manual provider reconciliation; no refund or reversal journal entries are invented. The endpoint requires admin authentication.

This is not automatic Stripe refund, shipping or reversal webhook ingestion. Provider-backed refund allocation, actual shipping credits, reversal state validation and signed end-to-end event tests remain prerequisites. Do not use journal balances to release funds or enable Türkiye checkout.
