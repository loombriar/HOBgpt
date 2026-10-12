# Encrypted measurement profiles — deployment gate

Set `MEASUREMENT_ENCRYPTION_KEY` in the production service environment to **64 hexadecimal characters** generated from 32 cryptographically secure random bytes. Example generation (run locally, never commit the output):

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the key stable across deployments and backups. Losing it makes existing profiles unreadable. Rotating it requires a planned re-encryption migration. Never log the key or store it in GitHub.

The feature returns HTTP 503 when no valid key is configured. Profiles are encrypted using AES-256-GCM, owned by authenticated customer ID, and deleted on customer account deletion. Browser localStorage is not used for measurements. Session-only copies are cleared when the component unmounts.

## Required verification before merge

- Signed-out GET/POST/DELETE return 401; wrong-origin POST/DELETE return 403.
- Two customer accounts cannot list or delete each other's profiles.
- Valid profile persists after refresh and login on another device.
- Invalid and oversized values are rejected; 20-profile cap enforced.
- Deleted profile does not return; deleting customer account removes its profiles.
- Database backups retain encrypted data, not plaintext measurements.
- Confirm production key is provisioned before deployment; test backup restore with same key.
- Run `npm test` and frontend build, then test with two isolated accounts.

**Do not merge until automated tests and live sandbox verification have passed.**
