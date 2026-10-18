# Email delivery evidence — October 18, 2026

Observed approximately 13:13–13:16 UTC. This supplements the earlier
[commerce acceptance](staging-commerce-evidence-2026-10-18.md); it does not replace
the remaining release gates.

## Results

| Check | Evidence | Scope |
| --- | --- | --- |
| Customer sign-in delivery | Testing deployment's actual `/api/customer/signin-code` returned HTTP 202. A new message from the configured House sender arrived in the connected operator Gmail inbox at 13:13:37 UTC. | Deployed testing application through Resend to Gmail. Code redemption was not performed. |
| Order-confirmation delivery | An isolated application fixture generated the real confirmation template after a mocked verified payment. A message clearly prefixed `[TEST ONLY]` was sent using testing's configured Resend sender/key. Provider returned HTTP 200 and `last_event: delivered`; Gmail inbox receipt and full body were verified at 13:14:51 UTC. | Real provider/inbox delivery of an application-generated fixture template; not a new hosted Checkout transaction or a replay of a deployed order's outbox. |
| Refund delivery | The same isolated application's admin refund route, using a mocked payment provider, generated the refund template. Its marked test message returned HTTP 200 and `last_event: delivered`; Gmail inbox receipt and full body were verified at 13:14:54 UTC. | Real provider/inbox delivery of an application-generated fixture template; no new payment or actual refund. |
| Payment guard / duplicates | Fixture emitted no confirmation while unpaid, generated one after verified payment, and did not generate a second when confirmation was repeated. Both buyer messages reached the fixture's sent outbox state. | Isolated backend integration check. |
| Regression tests | 20 tests passed across `email-provider-keys`, `email-concurrency`, `admin-email-status`, `customer-accounts`, and `shipping`. | Covers stable retry keys, concurrent delivery claims, retries, sign-in safeguards, privacy, confirmation deduplication and payment/shipping checks. |

The temporary private delivery worker and its credential references were removed.
Only the connected operator's verified mailbox received the test messages. No
production settings, charges, postage purchases or seller payouts were changed.
Credentials, authentication codes, recipient identity and provider message IDs
are intentionally omitted from this document.

## Open finding: malformed House DKIM record

Both received transaction test messages had Gmail `Authentication-Results` with:

- SPF: pass.
- DMARC: pass (policy `NONE`).
- Amazon SES DKIM: pass.
- House domain DKIM (`houseofbriar.shop`, selector `resend`): neutral, bad format.

A public DNS lookup at `resend._domainkey.houseofbriar.shop` returned a TXT value
consisting solely of a base64 RSA public key, without the required `p=` key tag.
This is consistent with the observed format error. Delivery succeeded for these
messages, but House-domain DKIM is **not passed**.

Next action: restore the complete DKIM TXT value shown for this domain in Resend,
including its key tag, at the existing DNS host. Recheck public DNS, then send a
fresh controlled message and require House-domain DKIM to pass in the received
headers. DNS has not been edited in this run. Do not rotate the key or change MX,
SPF, DMARC, or unrelated records just to repair this value.

## Deployment / CI evidence

PR #436 merged as `e09b34f3fe7589ec755c1bc5834badad3ce0cfc5`. Production deployment
`02d95df7-ad04-422f-b3a8-bd27ede50c06` reached `SUCCESS` for that commit; the public
health endpoint returned HTTP 200. Its PR CI passed Node.js and Android unsigned
verification, including all 110 browser tests. Earlier deployed staging receipt
verification showed the purchased homepage cart entry clearing. No new paid
production checkout was performed during this email check.

Connect onboarding, a spontaneous carrier update and verified payout release,
physical Android testing, subscriptions and Play review remain separate gates.
