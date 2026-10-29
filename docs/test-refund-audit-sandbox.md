# Test refund audit and sandbox verification

Admin refund preview/apply/blocked attempts are appended to `designer_test_refund_audit` with order, scope, refund reference, action, outcome and timestamp. The admin-only GET `/api/admin/designer-settlement-ledger/test-refund-audit?orderId=...&scope=full` lists records. The audit stores no Stripe credentials or customer PII.

The suite tests audit persistence and validation alongside existing mocked Stripe refund evidence, multi-designer allocation, idempotent posting and payout-conflict cases. **These are simulated provider responses, not live Stripe sandbox end-to-end tests.** Actual signed webhook and provider test-account scenarios require configured Stripe sandbox credentials and a deployed test environment. No credentials are added to the repository.

Audit is best-effort on blocked requests and is not a complete tamper-proof compliance log. Successful posting and audit recording currently occur in separate transactions; a process crash between them may leave a journal entry without its corresponding audit record. Do not treat the audit as a financial source of truth or enable automatic refunds/payouts on this basis. Test-only, admin-triggered journal posting remains unchanged; international checkout remains disabled.
