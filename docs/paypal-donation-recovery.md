# PayPal donation recovery

PayPal donations use one server-verified recovery path for browser returns, webhooks and the existing donation reconciliation worker. Merchandise checkout remains disabled.

Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_ENVIRONMENT=sandbox` on staging. Use the matching live app credentials in production. In each PayPal app, register that environment's `/api/paypal/webhook` URL for `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING` and `PAYMENT.CAPTURE.DENIED`. Set `PAYPAL_WEBHOOK_ID` to the ID PayPal assigns that webhook (not a secret invented locally). Do not point sandbox events at production. Verification calls PayPal's fixed signature-verification endpoint; it never fetches the supplied certificate URL itself.

The scheduled worker recovers known approved orders even if the donor never returns. It reads at most 100 pending/unlinked donations each pass, ordered by oldest check. A completed order and completed capture must match the stored order ID, donation reference/custom ID, USD currency and exact amount before a transaction records payment and awards at most one supporter badge. Pending or denied captures do not award badges. Duplicate webhooks, returns and concurrent worker calls reuse the same path and capture idempotency key. Unknown webhook orders are acknowledged without capture.

If a capture response is lost, the next attempt retrieves the order first and records a completed capture without charging again. If PayPal still reports APPROVED more than five hours after the first attempt, capture stops for provider review rather than reusing a key after its retention period. Inspect the PayPal order and donation record manually; do not reset the timestamp without resolving the original payment.

Before rollout: use a sandbox donor to approve a donation and close the return page; verify exactly one capture and badge after a webhook or worker pass. Repeat delivery, test an interrupted response, and confirm amount/status mismatches cannot award badges. Unit tests mock PayPal and do not establish provider acceptance. Existing paid/approved orders with missing or differing historical custom IDs require manual review. This change does not reconcile donation refunds/disputes or remove supporter badges after them.

References:
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/payment-methods/webhooks/
