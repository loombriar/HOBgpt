# Invalid email review

Queued email rejected by Resend with HTTP 400 or 422 remains `failed` and gains
an `email_outbox.retry_blocked_at` timestamp. The worker excludes it from both
selection and claiming, including after restart. Existing invalid rows are
classified on their next due delivery attempt; no old error text is parsed or
records deleted. Rate limits, network failures and server errors retain the
existing backoff and stable idempotency key.

The admin email panel labels paused messages **Failed — review required** and
omits a next-attempt date. Failed counts include these messages. The API exposes
only a pause flag, not recipients, bodies or raw provider errors. Runtime failure
logs contain the outbox ID, attempt count, provider status and pause flag.

There is no automatic unpause or new resend button. An operator must inspect the
provider rejection and correct its cause before considering a retry. Keep the
original failed record for review. Do not alter a message's contents and reuse its
old provider idempotency key: a corrected notification needs its own explicitly
reviewed delivery identity. Check whether the notification is still useful and
has already been delivered before creating any replacement. Do not regenerate
expired sign-in credentials from the outbox.

This change does not fix invalid addresses, change provider credentials, prove
inbox delivery, or migrate existing financial records. Direct immediate sign-in
email delivery keeps its existing behavior.
