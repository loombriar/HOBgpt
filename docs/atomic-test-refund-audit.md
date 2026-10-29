# Atomic test refund ledger and audit

The admin-only verified test refund endpoint now passes the audit writer into the same SQLite `IMMEDIATE` transaction as per-designer refund ledger writes. A failed audit insert rolls back every designer's refund entry; a failed ledger insert also rolls back the audit. Preview audit events are recorded in the same transaction, without ledger writes.

Tests cover simulated audit failure, all-designer rollback, successful audit recording, and idempotent retry of journal entries. Each repeated authorized apply request creates a separate audit attempt, but does not create duplicate financial entries.

Blocked attempts still use a best-effort audit outside the transaction, and Stripe verification occurs before the SQLite transaction. This does not make external Stripe state transactional with SQLite. Real signed webhook and Stripe sandbox end-to-end tests remain outstanding. No production payouts, refund initiation, or international checkout is enabled.
