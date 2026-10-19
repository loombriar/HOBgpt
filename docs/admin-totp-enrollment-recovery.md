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

## Staging acceptance record (required before production enforcement)

Use a **dedicated staging administrator identity and unique staging-only TOTP secret**. Do not copy or retrieve a production secret into staging. Confirm that staging and production have separate data stores and administrator credentials before testing.

Record only PASS/FAIL, tester, date, deployment commit, environment and redacted request identifiers; never record bearer tokens, TOTP codes, cookies or shared secrets.

| Gate | Acceptance evidence | Result |
| --- | --- | --- |
| Identity inventory | Authorized owner confirms each administrator has a distinct label, token and TOTP secret; no generic/shared identities | Pending operator |
| Staging configuration | `ADMIN_TOTP_SECRETS_JSON` contains a secret for the staging administrator, `ADMIN_TOTP_REQUIRED=true`, and `ADMIN_TOTP_DIAGNOSTICS` is disabled after enrollment | Pending operator |
| Enrollment | Each administrator completes a new authenticator enrollment and successful staging sign-in | Pending operator |
| Bearer bypass | With MFA required, bearer-only request to a protected admin endpoint is denied (HTTP 403) | Pending operator |
| Cookie session | Authenticated admin session accesses an authorized route; logout revokes it; stale cookie is rejected | Pending operator |
| Role and audit | Least-privilege role is denied unauthorized actions; authorized actions show correct named actor in audit | Pending operator |
| Replay | Previously used TOTP code cannot create another session | Pending operator |
| Recovery | Two designated maintainers rehearse lost-device identity verification, session revocation, secret rotation and fresh sign-in | Pending operator |
| Incident readiness | Rollback approver, deployment owner, alerting and time-limited emergency procedure documented | Pending operator |
| CI and deployment | Backend safety and Node CI pass on the integrated commit; staging smoke tests repeated | Pending |

**Stop conditions:** Any shared credential, unknown recovery owner, missing staging-only secret, failing audit attribution or bearer bypass prevents production enforcement. Do not enable diagnostic TOTP checking on the public production service as a substitute for real enrollment.

### Safe automated coverage versus operator signoff

The `tests/admin-mfa.test.js` suite exercises bearer-only denial, code replay, and session authorization. A follow-up regression test additionally covers logout revocation. These tests use synthetic secrets and an isolated local database; they do not establish that the real administrator has enrolled or can recover from a lost device.

### Configuration inventory (October 19, 2026)

- Railway payment-testing service: `ADMIN_TOKEN` is present; `ADMIN_TOTP_REQUIRED` and `ADMIN_TOTP_SECRETS_JSON` are absent. Staging acceptance cannot yet run.
- Railway production service: `ADMIN_TOKEN`, `ADMIN_TOTP_REQUIRED`, `ADMIN_TOTP_SECRETS_JSON` and `ADMIN_TOTP_DIAGNOSTICS` variable names are present. Values are redacted, so their enforcement status and contents are **not verified**.
- No production or staging variables were modified during this inventory.

