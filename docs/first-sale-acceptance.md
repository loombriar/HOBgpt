# First-sale acceptance runbook

Status: **Not yet verified end-to-end**. Use staging, Stripe test mode, test connected accounts, and test email recipients. Do not create a real charge or transfer to complete this checklist.

## Deployment preflight

- [ ] Identify whether the live URL serves the root Express storefront or the separate React application in `apps/default`; confirm changes are being tested against the deployed surface.
- [ ] Verify persistent `DATA_DIR` storage, production-origin configuration, and safe test credentials.
- [ ] Configure separate signed Stripe platform Checkout and Connect `account.updated` webhook destinations, with their respective secrets.
- [ ] Configure EasyPost signed tracking webhooks and a verified transactional email sender.
- [ ] Confirm any tracking-link improvements from PR #183 have been merged before evaluating clickable customer tracking.
- [ ] Confirm tax configuration and supported US shipping behavior before accepting live orders.

## End-to-end scenario

Record a test designer ID, listing ID, order ID, Stripe checkout/payment IDs, and webhook event IDs in a private test log. Do not commit customer data or secrets.

| Step | Action | Pass criteria |
| --- | --- | --- |
| 1 | Register and sign in as a new designer | Account belongs to correct designer; terms and profile persist across reload |
| 2 | Complete Stripe Connect onboarding | Connected account is linked to that designer; readiness reflects Stripe's current requirements, not only redirect success |
| 3 | Create a draft listing with photos, measurements, fit notes, shipping charge, handling days, and return/alteration disclosures | Draft persists; incomplete required fields do not silently become free shipping |
| 4 | Submit listing and approve it as admin | Only approved, available, payout-ready designer listings appear publicly |
| 5 | Buy one item using Stripe test mode | Charged amount matches item, shipping, discounts, and configured taxes; payment webhook produces exactly one paid order |
| 6 | Inspect buyer and designer order views | Each role sees its own authorized order, correct line items and fulfillment details; other designers cannot access it |
| 7 | Add carrier and tracking number as owning designer | Tracking persists, valid customer link appears when provided, and shipment notification is delivered |
| 8 | Simulate signed EasyPost tracking updates | Customer status advances even after seller payout, with no duplicate notifications |
| 9 | Trigger payout eligibility using verified shipment state | Seller amount and shipping allocation reconcile; payout is not released while held or on failed verification |
| 10 | Test refund and failed payout paths | Refund holds/reversals and payout failures are visible to admin; retries are idempotent |
| 11 | Verify buyer messages | Order confirmation and shipping messages reach test inbox with accurate item, cost, tracking and sender details |

## Evidence and signoff

For every step record: timestamp, environment, test identifier, expected result, actual result, pass/fail, and screenshot or sanitized log reference. Redact personal information and payment identifiers.

**Launch gate:** Do not mark first-sale flow complete until every applicable step passes against the deployed application, including webhooks and actual delivery of test emails. A unit test or frontend build alone is not sufficient.

## Follow-up implementation

1. Group the existing seller readiness checks into Profile ready → Payouts connected → First piece listed → Ready to sell; retain granular Stripe and seller-terms checks and make unfinished actions actionable.
2. Add an admin Needs Attention panel above analytics with counts and links for pending reviews, unshipped/overdue orders, held or failed payouts, and unresolved support requests.
3. Consolidate fit, measurements, shipping, processing, return eligibility, and alteration options near the purchase button. Never infer return or alteration promises from missing fields.
4. Feature only consenting, approved founding designers and their genuine published inventory.
