# Designer settlement ledger — staging implementation

This branch introduces an **append-only accounting journal** for order/designer-level events.

## Included

- SQLite `designer_settlement_entries` table, initialized at server startup with no destructive migration or backfill.
- Immutable `event_id` for idempotent retries. Conflicting retries are rejected.
- Event types: sale, commission, processing fee, shipping, refund, chargeback, reserve hold/release, payout, and payout reversal.
- Single-currency, test/live-isolated entries per order and designer.
- Read-only admin API: `GET /api/admin/designer-settlement-ledger?orderId=...&designerId=...&testMode=true`.
- Unit tests for calculations, duplicate events, mismatches, and negative-balance review.

## Important limitations

This is **not yet the authoritative existing order ledger**. No existing order or Stripe webhook writes into this journal, and no historical orders are backfilled. The admin API will return an empty journal until a later, explicitly reviewed integration records events. Do not use its zero balance as evidence that a seller is owed nothing.

No provider payout calls, bank details, real-money changes, or purchasing activation are introduced. Atelier Emine checkout remains disabled until the provider and compliance model is approved.

Before integrating with real orders, implement source-event authentication and ownership checks, order item allocation, taxes and shipping policy, per-designer refunds, chargeback lifecycle, and reconciliation against existing `orders`, `order_items`, `designer_transfers`, `postage_charges`, and provider records. Review the journal's debit/credit semantics for reversals and outstanding liabilities. Do not use this ledger to authorize payouts yet.

Run `node --test tests/designer-settlement-ledger.test.js` and the repository's full test/build checks before merging.
