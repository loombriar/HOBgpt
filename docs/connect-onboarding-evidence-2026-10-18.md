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

## Remaining webhook cleanup

Two enabled Connect destinations target the same testing webhook URL. Each update
also had a corresponding HTTP 400 delivery, and the newest account events still
reported one pending webhook at the time of inspection. The accepted path is
working, but duplicate-destination cleanup and confirmation that retries clear
remain open. No endpoint was disabled during this check because the rejecting
destination was not individually identified.

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
