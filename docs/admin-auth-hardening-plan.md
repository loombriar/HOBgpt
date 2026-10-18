# Administrator authentication hardening plan

## Goal
Move administrator access from shared or labelled static tokens to individual identities protected by phishing-resistant MFA or passkeys, while preserving existing session and audit protections.

## Implementation stages
1. Inventory all current administrator operators, service accounts, token consumers, and required roles. Do not include token values in issues, logs, or pull requests.
2. Introduce individually attributable admin identities and enrollment/recovery policies. Require a second factor at interactive sign-in; never treat a labelled shared token as MFA.
3. Bind revocable sessions to identity and authentication assurance, and enforce authorization by role on every admin route. Rotate sessions after sign-in and privilege changes.
4. Provide a separate scoped machine-authentication path for any necessary automation; do not silently reuse human administrator bearer tokens.
5. Add tests for missing MFA, invalid or expired factors, replay, revocation, CSRF/origin, role separation, recovery, and audit attribution.
6. Stage rollout with emergency access and rollback documented, then disable direct legacy admin bearer authentication only after migration.

## Acceptance gates
- Every human administrator has an individual identity and enforced MFA or passkey.
- Session revocation, logout, audit attribution, and role checks pass integration tests.
- Legacy tokens are retired and verified absent from deployed integrations.
- Staging smoke tests pass before enabling production enforcement.

This document is a design checklist, not an implemented authentication control.
