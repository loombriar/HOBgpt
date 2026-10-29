# Provider-backed adjustment evidence (test mode)

PR #563 is present on staging; its Backend safety suite passed.

The authenticated admin endpoint `POST /api/admin/designer-settlement-ledger/review-provider-adjustments` accepts `{"orderId":"...","designerId":"..."}`. It fetches known refund IDs and transfer reversal IDs from Stripe and checks local order/payment/refund/transfer references. It returns evidence and review flags; **it does not post journal entries, move funds, or approve payouts**.

Refund allocation is deliberately unresolved, particularly for full-order and multi-designer refunds. Stripe reversal evidence is not sufficient to establish final seller liability. Missing references, nonfinal states and legacy refunds require review. Live checkout orders are rejected.

Next before automatic ledger posting: verify Stripe test-mode parent transfer, transfer amount and currency; handle refund allocation, reversal lifecycle and retries; add durable review records and end-to-end integration tests. Production checkout and international payouts remain disabled.
