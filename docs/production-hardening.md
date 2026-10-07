# Production hardening roadmap

## Authentication
Move designer authentication to server-managed Secure, HttpOnly, SameSite cookies. Existing bearer-token authentication is a temporary compatibility path while the legacy storefront and React Studio are migrated. New frontend code must not add additional persistent bearer credentials. The migration is complete when designer sign-in, sign-out, Studio, account, listings, shipping, support and AI routes no longer read a designer credential from localStorage.

Admin authentication should follow the same direction, with named administrator accounts and MFA or passkeys before broad production use.

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

Production still needs an off-host copy and a periodic restore drill. A backup stored only on the same Railway volume does not protect against volume loss.
