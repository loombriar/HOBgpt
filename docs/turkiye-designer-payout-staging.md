# Türkiye designer payout readiness — staging only

**Status: BLOCKED / planning scaffold.** No Turkish designer payout provider is enabled, no recipient is created, and no production payment flow changes are made by this branch.

## House of Briar model

House of Briar collects the customer payment, retains a commission, and owes the remainder to Atelier Emine, a business registered in Türkiye with a Turkish bank account. The existing Stripe checkout is not automatically a compliant marketplace settlement mechanism. Do not treat a standard international bank transfer, Wise, or Payoneer transfer as legal approval for this arrangement.

## Provider decision

1. Preferred: ask Stripe whether House of Briar qualifies for Global Payouts for this precise marketplace funds flow, including Treasury activation and licensing obligations. Türkiye recipient availability does **not** imply account-level approval.
2. Fallback: request written eligibility confirmation from a regulated marketplace provider for a US platform collecting customer funds and settling to a Türkiye business. Confirm seller onboarding, payout currencies, settlement model, refunds, disputes, reserves, reconciliation, and fees.
3. If neither provider supports the model, keep Atelier Emine's introduction informational with purchasing disabled. Do not route seller proceeds through ad hoc personal or business transfers as a workaround.

## Staging implementation gates

- [ ] Provider confirms House of Briar's **specific** collection/commission/payout model in writing.
- [ ] Qualified US payments counsel assesses money-transmission and other applicable compliance requirements.
- [ ] Provider onboarding and Turkish business recipient verification succeed in test/sandbox.
- [ ] Store provider approval, compliance approval, recipient verification, and payout-rail readiness as server-controlled states; never accept these values from the browser.
- [ ] Build an immutable order-to-designer ledger: gross payment, commission, processor fees, shipping, taxes, refunds, chargebacks, reserves, and net designer amount.
- [ ] Design idempotent payout submission, webhook verification, reconciliation, retry/unknown-outcome handling, and an audit trail.
- [ ] Test partial/full refunds, multi-designer orders, failed payouts, duplicate events, account suspension, and negative balances.
- [ ] Enable designer checkout only after payout route and legal/compliance gates are approved.

## Initial code scaffold

`lib/designer-payout-readiness.js` exposes a **pure, fail-closed** readiness assessment function. It is not wired to checkout or payouts yet, deliberately: integration must wait for confirmed provider capabilities and an approved compliance model. Unit tests cover the blocked default and the approval gates.

Do not place bank details, API keys, or identity documents in GitHub or test fixtures.
