# Run the Stripe sandbox lifecycle from GitHub Actions

This workflow is manually triggered and restricted to the `staging` branch. It creates and refunds a **$2 Stripe test-mode payment** and runs the disposable-database integration test. It never deploys code or initiates designer payouts.

1. In GitHub, open **Settings → Environments → New environment**, and create `stripe-sandbox`. Consider adding required reviewers and limiting deployments to `staging`.
2. Within that environment, create an **environment secret** named `STRIPE_TEST_SECRET_KEY` with a restricted `sk_test_` secret key that can create PaymentIntents and refunds. Never paste it into an issue, chat, commit, or workflow input.
3. Merge this PR into `staging`. Then go to **Actions → Manual Stripe sandbox lifecycle → Run workflow**, choose **staging**, and enter `RUN_STRIPE_TEST_ONLY` in the confirmation field.
4. Review the job result. A green run validates the currently implemented hybrid test; a red run requires investigation before promoting to production.

The job is opt-in only, uses a protected environment, refuses missing/non-test keys, runs on a temporary runner, and does not upload sensitive logs or artifacts. The repository's ordinary test suite will continue skipping this test.

**Scope limitation:** The test uses a real Stripe test PaymentIntent and refund, but a synthetic Checkout session and signed webhook. It does not validate real hosted Checkout completion, real Stripe webhook delivery, or automatic refund-webhook ingestion. No international payout functionality is enabled.

**Security note:** This workflow references a secret that must be configured by a repository administrator. The PR does not create or expose that secret. Branch restrictions in the workflow are defense-in-depth; configure environment branch protections and approvals in GitHub Settings.
