# Postage label pilot

The pilot is off by default. In the payment-testing environment only, set
`SHIPPO_LABELS_MODE=test` and `SHIPPO_TEST_API_KEY` to a Shippo test API key.
Existing `Shippo_Test` or a test-prefixed `SHIPPO_API_KEY` can also be used.
A live key cannot enable labels, even if the mode is set incorrectly.

Use a paid Stripe **test** order with a complete US delivery address. In
Account → Orders, open **Postage & print label · test mode**. Enter the sender's
US return address and the packed weight (ounces) and dimensions (inches).
Compare rates, choose an affordable rate, approve the displayed sample deduction,
and create the sample PDF label. Open the PDF and use the browser's print action.

The exact quoted postage is recorded once per order/designer in a separate test
ledger. It is subtracted from the displayed sample earnings only. Real transfer
amounts, shipment tracking, buyer emails and payout verification are untouched.
Test labels cannot ship packages. Each designer sees only their own order data.
Rates expire after 15 minutes. A timeout or uncertain outcome blocks another
label request; inspect the Shippo test account before resolving it. There is no
automatic retry or replacement label purchase.

## Before enabling real postage

Live purchases remain intentionally unavailable. The next phase must apply the
postage ledger to Stripe transfers (the current payout code calculates earnings
from order items), reconcile carrier adjustments and void/refund outcomes, lock
payout/refund/label operations together, and handle unresolved provider outcomes.
Update the seller agreement and explicit acceptance to cover platform-funded
postage deductions. Define who bears postage after customer refunds and carrier
adjustments. Do not change the feature flag to `live`: that mode is unsupported.

House of Briar pays the carrier account and deducts the exact confirmed postage
from that designer's earnings. Buyers continue to receive free US delivery. If
postage exceeds the order's available earnings, label creation is blocked; no
negative balance or surprise charge is introduced.

## Creating the practice order

The payment-test site offers **Create sample postage order** in Account → Orders
only when it is running in the designated Payment Tests Railway project and
`testing` environment, with the label pilot enabled and both Shippo and Stripe
test keys. It creates one repeatable simulated order per signed-in designer,
using a public sample delivery address, a $100 total and $91 sample earnings.
No listing, stock, card charge or buyer email is created. The order is marked
`test_fixture` rather than `stripe`, so the existing payment-provider checks
prevent Stripe payouts. This fulfillment fixture tests labels, not checkout or
payment processing. Production never offers or accepts this action.

## Reviewing an uncertain label

Use **Check existing label status** on an order with a pending/review label.
This makes only GET requests to Shippo. It retrieves the recorded transaction,
or searches at most three pages of recent history for exactly one transaction
matching both the order/designer metadata and selected rate. The response must
be a test transaction. A successful, trusted document is restored to the order;
queued labels remain pending and provider errors are displayed. No additional
label purchase is made, and ambiguous/missing matches remain on hold.

USPS requires sender email and phone as well as the return address. These fields
are validated before requesting rates and included in Shippo's address_from.
A confirmed provider ERROR can be corrected using **Correct details & get fresh
rates**. The server re-reads the same transaction, requires it still be a matching
test ERROR, archives the failed attempt, and only then clears the active hold.
Unknown, queued or successful transactions cannot use this action. Creating a
new label still requires fresh rates and explicit sample-cost confirmation.
