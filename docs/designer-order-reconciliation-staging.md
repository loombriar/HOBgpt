# Order-to-designer reconciliation — sandbox stage

This branch adds explicit **admin-only import of paid Stripe TEST checkout order-item allocations** into the append-only journal and a **read-only reconciliation endpoint**.

- `POST /api/admin/designer-settlement-ledger/import-test-order` with JSON `{"orderId":"...","designerId":"..."}` imports only paid orders with a `cs_test_` checkout session. Existing event IDs are idempotent; changed source amounts conflict. It refuses live sessions, missing orders, non-paid orders, and orders with a recorded refund status.
- `GET /api/admin/designer-settlement-ledger/reconcile?orderId=...&designerId=...&testMode=true` compares journal sale/commission and payout totals with actual order-item allocations and designer transfer records. It reports review flags rather than changing financial state.

**Not automatic production event ingestion.** No payment webhook changes, real transfers, payout authorization, refund booking, processing-fee allocation, postage reconciliation, or backfill of live orders. The test importer records only gross sales and commissions. A clean reconciliation means only these checks agree, not that a seller is legally payable.

Run `node --test tests/designer-order-reconciliation.test.js` and the complete backend safety suite. Review reconciliation assumptions before integrating authenticated provider events. Atelier Emine remains blocked from checkout until provider/compliance approval.
