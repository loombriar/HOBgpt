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
