# Founding Schools Initiative

This branch implements application submission, restricted review, verified account assignment and checkout commission handling. It is not deployment acceptance evidence.

## Policy and accounting

- Standard platform commission: 7%. Verified school-program designers: permanent 5% after explicit assignment, with no anniversary increase.
- Current students or graduates within 24 calendar months are eligible. Graduation is checked again at assignment, including exact calendar boundaries.
- Assignment is restricted to owners, requires a verification summary, and must match the email of an active designer account. Approving an application alone never assigns a rate. Enrollment/graduation evidence is verified outside this form; do not upload identity documents here.
- The assignment is unique per designer and application and is committed with an audit record in one SQLite transaction. There is no client endpoint for changing a commission rate.
- Independently verified students may apply without a school partnership. School inquiries do not create discounted creator accounts.
- New checkout lines calculate their fee from the stored assignment. Existing orders, transfers and refunds use their stored monetary amounts; approval never rewrites old orders.
- Platform commission applies to the discounted sale subtotal including selected gift wrap, preserving the existing fee base. Separately itemized tax and shipping are excluded. Processor fees and designer-funded postage remain separate.
- The signed-in pricing helpers use the account's server-provided rate. Public recruitment copy describes the 7% standard rate and the 5% school program.

## Operations

- Public form: `/founding-schools`. Both public and admin pages retain the shared navigation.
- Admin entry: `/admin/founding-schools`, linked from the main administrator dashboard. Uses the existing administrator session and MFA/role/origin boundary.
- Owners and operators review inquiries; only owners can activate discounted rates. Reviewers, support and unknown roles are denied.
- Activation requires the existing creator ID, matching account email, explicit eligibility attestation and a verification summary of at least ten characters. Never record identity document numbers in the summary.
- Public endpoints never list applications, signup counts, rankings or waitlist sizes. Application details and assignment status are restricted to authorized administrators.
- Application review and assignment have a dedicated audit table. The existing administrator request audit also records route, actor, role and result.
- School-branded badges, school pages, referrals and automated evidence verification remain separate work. This change does not claim trademark permission or automatically award school logos.

## Verification before release

Run the backend suite, frontend tests, TypeScript, production build and browser CI on the integrated branch. Rehearse public submission, owner/operator review, rejected/expired/mismatched account handling, owner assignment and a nonproduction checkout. Verify the deployed SHA independently in each environment. No live credentials or infrastructure are changed by this PR.
