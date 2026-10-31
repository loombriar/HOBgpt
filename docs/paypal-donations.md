# PayPal donation entry

Both homepage implementations offer Donate with Stripe and Donate with PayPal using the displayed donation amount. PayPal uses the existing `/api/paypal/donations/order` endpoint, then hands the donor to the returned HTTPS PayPal approval URL. The UI accepts only the official live and sandbox PayPal checkout hosts, prevents simultaneous button submissions, and restores both choices after an error. Stripe remains available.

The existing return/capture and reconciliation code confirms amount, currency, order and capture bindings before recording a paid donation or awarding the $5 supporter badge. Starting checkout does not award a badge. Marketplace merchandise payments remain on the existing Stripe seller payout rail; the intentionally disabled PayPal merchandise endpoints are unchanged.

Production verification on October 25, 2026: creating one $1 unpaid donation checkout returned HTTP 201 and a live `www.paypal.com/checkoutnow` approval URL. No payer approval or capture was performed. PayPal's device check blocked the cloud browser from inspecting the approval page, so a completed live payment has not been verified. Existing production PayPal credentials were not read or changed. PAYPAL_WEBHOOK_ID was not listed in the service's configured variable names; existing return and periodic reconciliation paths remain in use. Configure the existing verified webhook separately if desired; no new webhook was created by this change.

Automated tests use local fixtures for order creation, selected amounts, provider errors, redirect validation, pending/paid state, recovery and badge replay. No test sends real money.
