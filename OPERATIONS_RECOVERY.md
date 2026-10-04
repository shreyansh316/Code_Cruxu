# HEADROOM operational recovery guide

This guide describes recovery paths implemented in HEADROOM 0.1.0 and the limits of the current extension UI. It does not promise automatic repair or recovery of arbitrary workspace changes.

## Before changing data

- Preserve the original database and workspace before attempting recovery. Never delete or edit the SQLite database to bypass a startup error.
- Do not restore a database over an open HEADROOM connection. Close all VS Code windows running this extension before making a file-level copy or replacing a file.
- Keep database backups and JSON exports in a private location. They contain objectives, task details, memories, audit data, and other workspace information.
- HEADROOM currently has no user-facing backup, restore, import, or workspace rollback command. The verified database backup service is an internal API. If it is unavailable in your build, use a closed-host file copy for preservation and contact the project maintainer before attempting an API-level restore.

## Locate and preserve the database

The live database is `headroom.sqlite` under the extension's VS Code `globalStorageUri.fsPath`. VS Code chooses the base directory according to OS, profile, stable/Insiders edition, and portable mode. Use the installed extension's storage directory; do not assume a single fixed path. Close VS Code before copying the file. Preserve a copy with a timestamp and do not overwrite earlier backups.

A closed-host file copy is a preservation copy, not an integrity-verified backup. The internal `createDatabaseBackupService` provides a stronger path for maintainers and integration code:

1. Open a connection to the live database and construct `createDatabaseBackupService({ connection })`.
2. Call `backup(newPath)` where `newPath` does not already exist and differs from the live database path.
3. Retain the returned SHA-256, schema version, integrity result, row counts, and the backup file together.
4. Before recovery, call `verify(backupPath)`. Restore only to a new destination with `restore(backupPath, newPath)`; the service verifies the source, restored integrity, foreign keys, schema version, and table row counts.
5. Open the restored copy separately and inspect expected data before planning any replacement of the live database. Never point restore at the active database file.

`exportJson(newPath)` is a portable data export, not a restorable database backup: this release has no JSON import path. Treat the JSON as sensitive data.

## Database health and migration recovery

The HEADROOM **Health** view reports database, queue, provider, and verification states. Database integrity diagnostics are read-only: `HEALTHY` means SQLite integrity, foreign keys, and the migration ledger passed; `DEGRADED` or `UNAVAILABLE` does not mean the extension repaired the database.

At startup, HEADROOM inspects the migration ledger before applying migrations. Supported older databases migrate forward transactionally to the schema bundled with the extension (currently schema version 8). Fresh databases initialize normally. If startup blocks on an unsupported future schema or inconsistent migration history:

1. Preserve a copy of `headroom.sqlite` before another attempt.
2. Do not downgrade, manually edit the schema ledger, or delete the database.
3. Open the data with the compatible newer HEADROOM release that created it, or ask a maintainer to verify a backup and restore it to a separate file.
4. Keep the blocked original unchanged until the restored copy has been checked.

For a degraded integrity report, preserve the original and a copy, then have a maintainer run the read-only integrity checks against a disposable copy. Do not treat an integrity report as a repair operation.

## Interrupted queued work

The durable queue is reconciled by the execution recovery use case. A claimed task left `ASSIGNED` is returned to `QUEUED`; work left `STARTED` or `IN_PROGRESS` is marked `BLOCKED` with a host-restart reason; completed tasks remain completed. Recovery is recorded in the audit log. This reconciliation does not prove that external side effects did or did not happen. Review the task and its workspace before retrying; execution requires explicit follow-up. A task pending review is not automatically accepted.

## Provider credential recovery

1. In VS Code Settings, check `headroom.ai.provider` (`mock`, `gemini`, or `openai`). Invalid values fall back to the configured default and are surfaced as a settings warning.
2. Open the HEADROOM **Health** view and inspect **AI provider**. `READY` means a credential is present for the selected non-mock provider; it does not test network reachability or prove that the provider accepts the credential.
3. Use **HEADROOM: Configure AI Provider Credential** to enter the credential again, or **HEADROOM: Clear AI Provider Credential** to remove it before reconfiguration. Values are held in VS Code SecretStorage, not settings.
4. If the provider still fails, check provider availability, account access, and network connectivity. Error responses use stable codes; provide the code and extension version when reporting the issue, never the credential or raw request body.

Provider credentials are not stored in the SQLite database backup and cannot be restored from a JSON export. Configure them again on a new VS Code profile or machine.

## Workspace and Git recovery

HEADROOM's workspace snapshots and read-only Git state adapter help identify changed files and repository state; they do not roll files back. Before retrying interrupted work:

1. Stop or pause the affected work and inspect Source Control, `git status`, and the task's review evidence.
2. Preserve staged and unstaged changes and separately copy untracked files. Do not run `git reset --hard`, `git clean`, or an unreviewed checkout as a recovery shortcut.
3. Compare the current workspace with the task's before/after snapshot when available. Snapshots are bounded hashes and metadata, not a copy of file contents.
4. Restore only the specific reviewed files from a known-good Git commit or a user-managed backup. Re-run the project's verification commands and review the diff before continuing.

The Git state adapter is read-only; any revert, checkout, or reset is an explicit user or maintainer action. HEADROOM does not guarantee rollback for commands or external side effects.

## Data retention

The retention service runs a bounded, atomic batch for memory, AI usage, and audit rows and records the counts. Null policy values disable deletion for that category. Retention can permanently delete old data; make and verify a backup first. It is an internal API in this release, not a user-facing setting. Append-only audit protections remain active outside the retention operation.

## Disposable recovery exercise

The recovery tests create temporary databases and directories; they do not open the user's VS Code database or workspace. From the repository root, run:

```powershell
npm test -- tests/phase-067.test.js tests/phase-068.test.js tests/phase-069.test.js tests/phase-070.test.js tests/phase-083.test.js tests/phase-045.test.js tests/phase-046.test.js tests/phase-022.test.js tests/phase-080.test.js tests/phase-081.test.js
```

These fixtures exercise backup/export/verified restore and corrupt-source rejection, retention bounds and rollback, read-only health diagnostics, migration compatibility, provider credential setup, workspace confinement/snapshot inspection, and read-only Git inspection. The `tests/phase-067.test.js` fixture specifically seeds a temporary database, backs it up, verifies it, restores into a new temporary file, and checks restored application data. Do not substitute the live extension database for these disposable fixtures.
