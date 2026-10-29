# Verified test refund journal (explicit opt-in)

PR #565 is on staging and its backend safety suite passed.

The admin-only `POST /api/admin/designer-settlement-ledger/post-verified-test-refund` accepts `{"orderId":"...","scope":"full","apply":false}` for a read-only preview. Setting `apply:true` atomically writes per-designer refund events only after a Stripe test refund is confirmed succeeded, local and remote IDs/amount/currency/payment intent/scope agree, exact item-gross allocation is possible, base sale and commission entries exist, and there is no paid/in-flight transfer or overlapping refund scope. Event IDs are stable on retries.

The journal debits **designer earnings exposure**, not customer gross, because original sale and commission entries already net to designer earnings. Commission reversal remains subject to separate policy and accounting review. This is not a determination of legal liability.

No automatic webhook posting, no Stripe writes, no live settlement, no international checkout. Partial refunds, shipping differences, overlapping refunds, payout activity and ambiguous cases are blocked for manual review. Provider failures are not interpreted as success. A durable cross-system audit/review queue and integration tests with actual Stripe sandbox events are still needed before production use.
