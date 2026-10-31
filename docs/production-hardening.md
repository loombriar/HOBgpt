# Production hardening roadmap

## Authentication

Status checked against application commit `6834dd0` on October 17, 2026. The normal browser migration is implemented: the legacy storefront and React House authentication use server-managed HttpOnly, SameSite session cookies, Secure on HTTPS. The storefront clears old stored designer credentials; new frontend code must not persist bearer credentials. Email-code verification, sign-out revocation and isolation have backend/browser regression coverage. See [current release evidence](release-acceptance-evidence.md) for the distinction between automated and live acceptance.

Backend compatibility still accepts configured/issued legacy bearer credentials, and an explicit older-token sign-in option remains. That is a remaining retirement task, not evidence that the normal UI still stores tokens. Inventory clients and configured legacy identities before disabling compatibility.

Admin token exchange also produces a revocable HttpOnly cookie and clears the typed token after successful sign-in. Named individual administrator identities with MFA or passkeys remain a hardening requirement before broad production use; labelled/shared access tokens are not equivalent to that identity model.

## Backend boundaries
Do not add new unrelated route families directly to server.js. Extract new work behind modules grouped as auth, commerce, integrations, marketplace, support and analytics. Commerce state transitions must remain transactional and covered by regression tests.

## Frontend convergence
The React application under apps/default is the target frontend. Migrate routes incrementally while keeping the current Express storefront stable. Preserve same-origin API contracts, validate parity with browser tests, then remove the corresponding legacy implementation. Do not maintain two permanent implementations of cart, authentication or account state.

## Data durability
Production requires persistent storage plus automated off-host backups and tested restoration. Move uploaded media to object storage before horizontal API scaling.

## Scale trigger
SQLite remains supported for a single application instance. Migrate transactional state to managed PostgreSQL before horizontally scaling the API.


## Backup consistency

The backup command uses SQLite's online backup API for `catalog.sqlite`, so a running WAL-mode database is captured as a consistent snapshot. The live database, `-wal`, and `-shm` files are not copied by the recursive media backup. Non-database files under `DATA_DIR` are copied separately.

Every backup writes a SHA-256 manifest. Run `npm run verify:backup -- <backup-directory>` before accepting a backup; verification checks every recorded file and runs SQLite `PRAGMA integrity_check` against the snapshot.

Production off-site upload and file/SQLite verification were observed successfully on October 17, 2026; see the timestamped release evidence. Automated tests also restore an isolated WAL-backed database and media and reject corrupted backups or destination overwrite. A recent downloaded production backup passed a private disposable-worker restore drill on October 18, 2026: all 10 files matched their hashes, SQLite integrity passed, 2 restored orders were readable, and 9 images decoded. See [the aggregate restore evidence](production-restore-evidence-2026-10-18.json) and release evidence for scope and limitations. Repeat periodically and after material storage or schema changes. Follow [the restore runbook](backup-restore.md) in an isolated environment; never overwrite the running production volume. Configuration and successful upload alone are not restore evidence.
