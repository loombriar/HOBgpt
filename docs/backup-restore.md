# Backup recovery drill

Use a downloaded version-2 backup containing `manifest.json` and `data/`.
Restore into a new directory, never into the running application's data volume:

```sh
node scripts/restore-backup.js /path/to/backup /path/to/new-data
```

The command checks file hashes, file sizes and SQLite integrity before copying
the database and media. It rejects unsafe paths and an existing destination.
Run an isolated copy of the application against the restored directory and
verify listings, orders and image responses before planning production recovery.
Do not configure live payment or email credentials in the recovery drill.

Automated coverage restores a WAL-backed database and media, checks their
contents, rejects a repeated restore, and rejects a corrupted backup.
This verifies the recovery mechanism; it does not replace a drill using a
downloaded production backup.

## Private production snapshot drill

`scripts/production-recovery-drill.js` downloads one explicit dated backup from
the production backup bucket using GET requests, verifies every manifest entry,
and restores into a new temporary directory. It checks SQLite integrity, core
record counts before/after app startup, authenticated listing/order reads, image
decoding, and public photo responses from a loopback-only app. It removes its
temporary files on completion and emits only aggregate `RECOVERY_DRILL_RESULT`
evidence. It does not test customer/designer login, decrypt saved measurements,
or contact payment, shipping, email, or AI providers.

Run it only in a disposable private service, pinned to the reviewed script commit,
with no volume, public domain, or production application credentials. Set
`NODE_ENV=test`, `RECOVERY_DRILL_ENABLED=true`,
`OFFSITE_BACKUP_ENABLED=false`, and `RECOVERY_BACKUP_PREFIX` to one exact
`house-of-briar/YYYY-MM-DDTHH-MM-SS-mmmZ/` prefix. Supply the backup endpoint,
bucket, region and S3 credentials through private service-variable references;
prefer a credential scoped to reading the selected backup. Never paste secrets
into commands, source control or the evidence report.

Use `node scripts/production-recovery-drill.js` as the one-shot start command,
with restart policy `NEVER`. Check the terminal deployment status and the PASS
report, preserve its manifest hash and aggregate results, then delete the
disposable service and its credential references. Independently verify the live
app remains healthy and its deployment/configuration was unchanged.
