# Live Shippo labels — rollout gates

Status: NOT ENABLED by default. Live Shippo routes are implemented behind `SHIPPO_LIVE_LABELS_ENABLED=true` and a validated `shippo_live_` credential. Implementation does not constitute production approval. Do not enable purchasing without the gates below.

## Required implementation

1. Use a dedicated explicit feature flag `SHIPPO_LIVE_LABELS_ENABLED=true` and a validated `shippo_live_` key. Never expose the key to the browser. Keep `shippo_test_` credentials restricted to test orders.
2. Store a permanent test/live mode on each label and quote. Migrate old pilot labels as test. Never import pilot transactions into live payout accounting.
3. Before any live purchase, validate paid order ownership, available designer earnings, a fresh quote, confirmation of the exact cost, and no existing label, refund, tracking verification, or payout in progress.
4. Reserve the order/designer label slot durably before contacting Shippo. Never retry an uncertain purchase; reconcile it using transaction ID or unique metadata, with manual review for ambiguous results.
5. Accept only a matching live Shippo transaction (rate, order/designer metadata, non-test status, safe PDF URL, tracking). Charge the ledger exactly once by provider transaction ID. Hold payout during processing or review.
6. Calculate live payout as designer share less charged live postage plus confirmed carrier postage refunds. Never change an in-flight or completed Stripe transfer; route post-payout credits to review.
7. Integrate real label tracking into the existing shipment verification workflow without treating label creation as carrier acceptance.
8. Cancellation: request refund only for eligible unused labels, keep postage deducted until Shippo confirms refund, prevent duplicate refund requests, and block payout during uncertain refund states.
9. Update designer interface to distinguish live from test labels, display exact before/after earnings, and require explicit cost confirmation.
10. Update marketplace rules only after end-to-end tests pass and the production feature is enabled.

## Tests required before activation

- Test/live API isolation and response mismatches
- Concurrent requests, timeouts, and duplicate transaction reconciliation
- Forged or expired rates, insufficient earnings, unauthorized designers
- Live ledger exact-once charges and matching order/designer
- Refund pending/rejected/confirmed states and delayed callbacks
- Payout freezes, Stripe idempotency, and customer refunds
- Tracking verification and label PDF safety
- UI live/test presentation, print flow, and cancellation
- Production staging checkout and low-value live purchase with explicit operator approval

Do not turn on live purchasing until these checks have been completed and reviewed.

## Outstanding operational release blockers

- Reconcile carrier billing adjustments (positive or negative) against provider transaction IDs in a durable, idempotent audit trail. Do not silently mutate an already-fixed transfer.
- Approve a manual settlement policy for unrecovered postage, late credits, disputed adjustments, and customer refunds; identify an authorized reviewer and evidence requirements.
- Validate versioned Seller Terms acceptance and explicit exact-rate deduction consent for each live purchase.
- Exercise restart and provider-response-loss recovery with one transaction per order/designer, no duplicate POST, and payout holds until review completes.
- Record production-like evidence and a separately authorized capped real-label pilot before considering broader promotion. Keep live purchasing disabled otherwise.
