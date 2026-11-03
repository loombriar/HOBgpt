# Read-only security monitor

The `security_monitor` role has access only to `GET /api/admin/session` and `GET /api/admin/security-summary`. The latter returns aggregate administrator request, denial and server-error counts over the last 24 hours. It deliberately excludes customer information, identities, audit paths, raw logs, IP addresses and payment data. It is **not** comprehensive intrusion detection or an incident-response console. Railway Viewer access separately permits inspection of platform information subject to Railway's own permissions.

All other privileged endpoints are denied, including refunds, payouts, listing changes, account suspension and operational records. The role has no ability to lock accounts.

After review, test and deployment, create a **unique, strong secret** through Railway's protected environment-variable controls. Example structure (placeholder only, never commit real secrets):
```json
{"security-brother":{"token":"GENERATE_A_UNIQUE_LONG_RANDOM_SECRET","role":"security_monitor"}}
```
Add the entry to the existing `ADMIN_TOKENS_JSON` map without replacing current owners/operators. Do not use the example secret. Follow the existing MFA and session policy, verify role-denied endpoints in staging, and confirm the intended administrator interface supports this role. This PR adds an API endpoint, **not** a dedicated dashboard. Never share the owner's master token. Keep Railway permission Viewer until a separate decision.

Security summary counts are derived from authenticated administrator audit rows; unauthenticated attempts and broader application or infrastructure incidents may not be included. Monitoring and alerts remain a separate project.
