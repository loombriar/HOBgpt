# Stripe Connect onboarding evidence — October 18, 2026

Environment: House of Briar Payment Tests / testing, existing HouseofBriar Stripe
sandbox. No production account, charge, postage purchase or payout was changed.

## Observed journey

- Before onboarding, the selected test seller's app status and Stripe account
  both reported incomplete setup, payouts disabled and transfers inactive.
- The deployed app generated an onboarding link successfully. Stripe displayed
  a test-account banner and its built-in test phone and bank options.
- The operator completed the hosted forms and agreement submission. Stripe
  returned to the app's configured `/account?stripe=return` URL.
- At 13:50:44 UTC, the deployed app's admin status endpoint returned HTTP 200,
  `connected:true`, `onboardingComplete:true`, `payoutsEnabled:true`, and
  `chargesEnabled:true`.
- Independent Stripe account retrieval confirmed `details_submitted:true`,
  `payouts_enabled:true`, an empty `requirements.currently_due` array and active
  `transfers` capability.
- Real `account.updated` events appeared for the connected test account.
  Application HTTP logs show Stripe webhook deliveries returning HTTP 200 during
  the onboarding updates at approximately 13:49:27, 13:49:50 and 13:50:01 UTC.

## Webhook cleanup completed at 14:00 UTC

Two enabled Connect destinations target the same testing webhook URL. Each update
also had a corresponding HTTP 400 delivery, and the newest account events still
reported one pending webhook at the time of inspection. The accepted path is
working, but duplicate-destination cleanup and confirmation that retries clear
were initially open. A subsequent controlled check identified the rejecting
destination individually: temporary URL labels followed by a harmless sandbox
account metadata update produced HTTP 400 from the older destination and HTTP 200
from the newer readiness destination. Query labels were omitted by HTTP logs, so
the final identification used the route's supported trailing-slash variant.

The older duplicate Connect destination was disabled, and the working readiness
destination's original URL was restored. Removing the temporary metadata probe
generated a fresh real `account.updated` event at 14:00:11 UTC. Its single delivery
returned HTTP 200 at 14:00:12 UTC, and Stripe reported `pending_webhooks:0` for
that event. Read-back confirmed exactly one enabled Connect destination. The
checkout/refund destination remained enabled. Seller payouts stayed enabled with
no outstanding requirements. Temporary workers and credential references were
removed. Older event records still showed historical pending counts; this is not
a claim that every historical delivery counter has cleared. No production
webhook was changed.

## Safeguards and limits

Fifteen targeted tests passed across `connect-sync`, `payout-transfer-integration`,
`payout-safety-regression` and `shipping`. Existing refunded sandbox order inspection
still showed `test_transit`, no carrier-verification timestamp and payout pending.
This confirms the simulated-shipment hold; it does not prove live carrier-based
payout release or a transfer reversal.

The admin-generated link returned to an account page without a signed-in browser
session; this run therefore verifies provider completion and app API status, not
the complete signed-in designer dashboard return experience. Stripe's sandbox
onboarding still displays the older Loom Briar branding. Physical Android testing
and production onboarding remain separate release gates.

Temporary verification workers and credential references were removed. Account
identifiers, onboarding access URLs and identity/bank details are omitted here.
