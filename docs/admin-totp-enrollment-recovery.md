# Administrator TOTP enrollment and recovery (staged rollout)

**Do not enable `ADMIN_TOTP_REQUIRED=true` until every administrator has enrolled, tested login, and verified an independent recovery path.** This implementation is an interim TOTP control, not phishing-resistant passkey MFA.

## Enrollment
1. Inventory each named administrator and verify their identity out of band. Avoid shared admin tokens; rotate any compromised credential.
2. Generate a unique random Base32 TOTP secret for each administrator using an approved secret manager or secure provisioning process. Never put real secrets in Git, PRs, tickets, logs, or screenshots.
3. Deliver the secret through an authenticated, private enrollment channel. Have the administrator register it in their authenticator app and confirm a successful test sign-in.
4. Store the mapping of administrator labels to secrets in the deployment secret manager as `ADMIN_TOTP_SECRETS_JSON`. Labels must match configured administrator identities exactly. Do not use the example test secret from the test suite.
5. Before enabling enforcement, confirm that admin cookie sessions work, bearer-only admin requests fail when enforcement is on, audit attribution is correct, and the rollback owner is available.
6. Enable `ADMIN_TOTP_REQUIRED=true` in staging first. Run the backend tests and smoke-test sign-in, logout, role boundaries, and administrative tasks. Only then consider production.

## Recovery
- Keep a separately authorized break-glass recovery procedure controlled by at least two designated maintainers, with identity verification and audit logging.
- If a device is lost, revoke the affected admin's existing sessions, rotate that administrator's TOTP secret, deliver the replacement securely, and require a fresh verified login.
- If all administrators are locked out, use the preapproved deployment-owner emergency process to restore access. Any temporary reduction in enforcement must be time-limited, documented, and followed by credential/session rotation and review.
- Never email plaintext TOTP secrets or reuse another administrator's secret as recovery.

## Rollback and limitations
- Record who may change deployment secrets and who can approve rollback before rollout.
- Turning off `ADMIN_TOTP_REQUIRED` restores legacy bearer compatibility; treat this as a security downgrade and an incident-level action, not routine recovery.
- TOTP is vulnerable to phishing. Follow up with individual identities, passkeys, revocable session assurance, scoped machine credentials, and complete role enforcement.
- This runbook does not itself implement self-service enrollment, backup codes, or automatic session revocation.
