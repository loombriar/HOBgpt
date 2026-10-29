# Multi-designer refund allocation preview

PR #564 is on staging; its backend safety suite passed.

The authenticated admin-only `POST /api/admin/designer-settlement-ledger/preview-refund-allocation` accepts `{"orderId":"...","scope":"full"}` or a specific designer ID. It uses an existing order_refunds row on a Stripe test checkout and returns exact order-item gross, designer earnings exposure and commission amounts for review.

A full refund is allocatable only if the refund amount and order subtotal both equal the sum of item gross amounts. A seller-scoped refund must exactly match that seller's item gross. Shipping, partial refunds, inconsistent fees, or unknown scopes are rejected or flagged; no proportional guessing.

**No journal posting, provider calls, refund issuance, or payout authorization.** The preview's earnings exposure is not a legal determination of seller liability; commission reversal remains a separate policy decision. Provider verification from PR #564 must be combined with this allocation, plus durable review/audit records, before automatic settlement events can be enabled. International checkout stays blocked.
