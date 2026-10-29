# Signed Stripe test checkout → settlement journal (opt-in)

The existing Stripe webhook verifies the HMAC signature and checkout order/session/payment before this optional journal integration runs. After the paid-order transition and transfer preparation, the webhook imports per-designer sale/commission allocations using immutable item IDs.

**Activation:** `ENABLE_TEST_SETTLEMENT_JOURNAL=true`. Keep this unset outside a controlled staging test. The hook additionally requires `session.livemode === false`, `cs_test_` session IDs, and an exact matching order session. Duplicate Stripe deliveries and repeated item imports do not double-count.

Import failures are logged for manual reconciliation; they do not change checkout acknowledgement or payouts. The separate admin-only reconciliation endpoint can inspect discrepancies.

The tests also exercise distinct shipping, refund, payout and payout-reversal entries as **sandbox arithmetic**. These event types are NOT yet automatically sourced from Stripe refund, shipping, or payout webhooks. Existing provider payout and refund code remains unchanged.

Before wider use, add durable reconciliation failure records, source-confirmed refund allocation, provider-fee evidence, postage event linkage, reversal references, multi-designer refund allocation, and end-to-end signed webhook tests. Do not treat the journal as a payout authorization source. No live international checkout is enabled.
