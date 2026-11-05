# Administrator role permissions

Implemented server policy for issue #482. The owner approved this role/action matrix on November 5, 2026. Staging has verified distinct owner/reviewer/support sign-ins, restricted reads, forbidden financial writes, permitted reviewer/support writes, and audit attribution. Public-ingress acceptance for an unrecognized-role MFA identity remains outstanding; isolated deployed-runtime HTTP checks have verified default denial. These findings do not by themselves constitute complete production rollout approval.

| Role | Allowed privileged actions |
| --- | --- |
| operator | All existing privileged handlers; retained for compatibility with existing credentials |
| owner | All privileged handlers |
| reviewer | Read listing queue, listings, listing images and listing reports; approve/reject listings and resolve listing reports |
| support | Read support inbox and reply to support messages |
| Any other role | No privileged handlers |

The policy runs inside the shared authAdmin boundary for cookie sessions and legacy bearer authentication. Existing session/origin/MFA checks remain in place. Reviewer/support roles cannot refund orders, release payouts, change inventory, delete listings, suspend designers, manage Stripe onboarding, view orders or designer records, or change support templates. New routes default to denial for restricted roles.

This policy is intentionally narrow. The current admin UI may request companion data that these roles cannot access. A tailored restricted-role dashboard is separate work; do not distribute a restricted account on the assumption that the entire owner dashboard will function.

Session actor/role come from the validated server session and current credential configuration. Request body fields or headers do not grant a role. Changing a configured role invalidates existing sessions through the existing credential/role match. Authorized and role-denied requests use the existing audit log. Legacy operator credentials still have full access; this does not close the individual identity, MFA enrollment or recovery gates.

## Acceptance

Administrator tokens and actor labels must each identify exactly one configured entry, including entries from `ADMIN_TOKEN`, `ADMIN_TOKENS` and `ADMIN_TOKENS_JSON`. Shared tokens or colliding labels reject both session exchange and bearer access; previously issued cookies for affected entries are revoked when next used. Unaffected accounts keep working. Before rollout, check uniqueness privately and replace ambiguous credentials through the deployment secret manager; never paste values into logs or GitHub. This check does not establish that a named credential is used by only one person or complete MFA recovery acceptance.

- Automated regression covers separate named reviewer/support/owner identities, cookie and bearer authorization, permitted review writes, financial/destructive denials, unknown-role denial, header spoofing and audit attribution.
- Full CI and staging checks must pass on the reviewed commit.
- Owner approved the role/action matrix on November 5, 2026; the original review requirement is complete.
- Staging owner/reviewer/support role boundaries, authorized/denied actions, and audit attribution were verified by November 4, 2026. Isolated HTTP enforcement of an unrecognized role was verified in the November 5 staging runtime; the unknown-role check through the primary deployed application's public ingress still requires a dedicated nonproduction MFA identity.
- No production credentials or variables are changed by this pull request.
