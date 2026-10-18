# Staging commerce acceptance — October 18, 2026

Tester: Codex, with the operator performing the final Stripe sandbox Pay action.
Environment: House of Briar Payment Tests / testing. Application deployment
`477e93b2-c619-4f70-b46a-295de4fda655`, commit `c7be054`.
All provider calls were confined to the existing HouseofBriar Stripe sandbox and
Shippo test credentials. No real charge, postage purchase or seller payout occurred.

## Observed results

| Scenario | Result |
| --- | --- |
| Existing sold piece | Checkout refused insufficient stock. Its old order was not changed. |
| Separate fixture listing | Created with an uploaded image; submission entered review. Approval refused until the test seller accepted current Seller Terms. After explicit operator authorization, version `2026-10-17-live-postage` acceptance was recorded and approval succeeded. |
| Guest checkout | Started in the homepage storefront without account sign-in. Stripe hosted Checkout explicitly reported `livemode:false`, USD 500 cents and the correct fixture title. Synthetic buyer data and the public Stripe test card were used; saving information with Link was disabled. |
| Payment / receipt | Operator completed the final Pay action. Stripe reported paid; app receipt displayed payment confirmed, $5, one piece and 1–2 preparation days. Server totals were 500 cents, 45 cents House fee and 455 cents seller amount. |
| Stripe webhooks | Checkout completion and refund events were processed. For all three actual sandbox events (`checkout.session.completed`, `refund.created`, `refund.updated`), replays signed with the configured test secret returned HTTP 200 with `duplicate:true`; deliberately invalid signatures returned HTTP 400. Replays left one refund ledger row and the same refunded order state. |
| Tracking | Owning test seller submitted Shippo `SHIPPO_TRANSIT`; server returned HTTP 202, `verified:false`, `test_transit`. Payout remained pending, with no verification timestamp. |
| Shippo webhook | A real provider callback reached the app but arrived before tracking was saved and was ignored as unmatched. A subsequent authenticated replay using provider-retrieved test tracking data returned HTTP 200 and updated matching test transfers. Repeating it also succeeded; no payout was released. The same payload without authentication returned HTTP 401. This is provider lookup plus authenticated replay evidence, not proof of a later spontaneous carrier update. |
| Full refund / repeat | Admin refund action returned succeeded for 500 cents. Stripe independently confirmed amount, currency, payment intent and succeeded status. Repeating the app refund action returned the same refund ID; only one ledger row existed. Guest receipt subsequently displayed “Refunded $5.00” and the refund-confirmed message. |

## Configuration correction

The superseded checkout/refund test webhook had been enabled alongside the current
destination. HTTP logs showed both accepted and rejected deliveries. The old
endpoint, already described in Stripe as replaced, was disabled; the current
checkout/subscription/refund destination remained enabled. No live Stripe endpoint
was changed. Two Connect-only destinations remain enabled and were outside this
checkout/refund cleanup; Connect onboarding and delivery still require their own
acceptance evidence. Historical `pending_webhooks` counts were still nonzero when
checked and are not claimed as cleared by this change.

## Findings and limits

- The receipt-return page retained the purchased homepage cart entry because this
  entry point does not create the React checkout snapshot. The proposed fix uses
  only listing IDs from the verified receipt, falling back to the snapshot when a
  receipt is absent. It preserves unrelated cart entries and never clears unpaid
  purchases. Callback regression coverage now exercises both checkout entry points.
- Email delivery is **not passed by this run**. The synthetic `example.com` buyer
  address was deliberately not a person's inbox, and Resend rejected it with HTTP
  422. Confirmation, shipping and refund email inbox delivery must be repeated with
  a controlled test recipient; Resend documents `delivered@resend.dev` for simulated
  successful delivery. Existing operator-reported email evidence is separate.
  A later [controlled email check](email-delivery-evidence-2026-10-18.md) verified
  inbox delivery for sign-in and marked transaction-template tests; it also found
  a malformed House-domain DKIM record that still needs repair.
- No new Connect onboarding, carrier-verified live shipment, transfer release or
  reversal, purchased postage label, physical Android journey, subscription renewal
  or Play Console review was performed. This is partial release evidence.
- Temporary private test workers and their credential references were removed.
  Synthetic records remain in staging for audit. No credentials, buyer identities,
  full order IDs, payment IDs or receipt access URLs are published here.

Build and TypeScript checks passed for the cart fix. Local browser regression
execution was blocked by a missing Chromium binary and a failed browser download;
GitHub CI and deployed staging verification are recorded with the pull request.
