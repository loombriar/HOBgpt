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

Confirmed label costs are recorded once per Shippo transaction in
`postage_charges`. Test and live charges are kept separate. Designer earnings
show sale total, the original House fee, postage, confirmed postage refunds and
net earnings. Existing labels from this pilot are imported as test costs only.
Simulated practice orders still cannot produce Stripe payouts or buyer emails.
Rates expire after 15 minutes. Uncertain requests remain held without an
automatic duplicate purchase.

## Payout and refund accounting

The payout engine deducts the matching order/designer postage balance before
creating a transfer and freezes the exact net amount before leaving the process.
The durable Stripe operation retains that amount for retries. Carrier verification,
seller terms, payment-provider restrictions and customer-refund holds still apply.
Zero or negative transfer amounts are not sent to Stripe.

An unused sample label can be cancelled after explicit confirmation. The server
checks its Shippo transaction and refuses known carrier movement. It records a
durable cancellation reservation before requesting the refund, and never repeats
that POST after a timeout. **Check cancellation status** uses GET requests only.
Only a matching test transaction reporting REFUNDED credits the postage. Pending
or unknown outcomes keep the deduction and payout hold; REFUNDREJECTED keeps the
charge. Refunded states are terminal and cannot be re-deducted by a delayed reply.
A confirmed cancelled label may be archived for a replacement; the old charge,
credit and cancellation records remain, and a new label needs fresh rate consent.

Customer refunds remain separate from carrier refunds. A customer refund reverses
only the amount actually transferred to that designer, while returning the full
customer amount for the selected refund scope. Unrecovered postage after a
customer refund and credits arriving after a payout was fixed appear in the admin
Postage review queue. They are not automatically charged to a card, moved to another
order or paid out a second time. Those cases require House reconciliation.

## Before enabling real postage

Live label buying remains unavailable; `SHIPPO_LABELS_MODE=live` is unsupported.
No endpoint accepts client-supplied live postage charges. The accounting module can
apply a verified live charge once a future trusted live-label writer is enabled.
Before that launch, finish the live purchase/transaction reconciliation path,
carrier adjustment accounting, label tracking registration, and a versioned seller
agreement with explicit consent for platform-funded postage deductions. Define the
policy and admin settlement process for costs left after customer refunds and late
carrier credits. Existing off-site backup and admin startup requirements still apply.

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
