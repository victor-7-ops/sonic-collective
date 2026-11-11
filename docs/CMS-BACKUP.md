# CMS backup and restore rehearsal

## Run a backup

```powershell
cd site
. ./scripts/use-runtime.ps1
npm run cms:backup          # read-only; writes .local/backups/<timestamp>/
npm run cms:restore-rehearsal   # restores the newest backup into a scratch database and verifies it
```

`cms:backup` needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (from `.env.local`). It prints row counts only, never contents.

## What is in a backup

All eleven editorial tables (team, content items and revisions, audit logs, releases, image records, invitations and their events, reviewer comments, live-release choices), the Supabase login accounts (ids, emails, status; never passwords), a `manifest.json` with a row count and SHA-256 per table, and any private image originals/derivatives (each original is checked against its recorded hash).

The folder is git-ignored and **contains team emails**. Never store it unencrypted: this repository is PUBLIC, so anything saved by a workflow can be downloaded by anyone. Use the encrypted file below.

## What is NOT in a backup

- **Passwords and authenticator factors.** The Auth API never exposes them. After a restore, each person signs in through a recovery link; Supabase's own backups (none on the Free plan) are the only way to keep password hashes.
- **Vercel and GitHub settings and secrets**, and the YouTube snapshot (re-created hourly by the sync).
- The repository content (it is in git).

## What the rehearsal proves

1. The backup files match their manifest (nothing truncated or altered).
2. Restoring into a database built from the real migrations reproduces every table **exactly** (per-table digests, including timestamp microseconds).
3. The restored data is internally consistent: no orphaned revisions, comments or audit rows, version numbers match, at least one active owner.
4. The restored approved content still assembles into a valid release, and every saved release snapshot still validates.

## Limits

The rehearsal restores into a scratch database on this machine, not into a second Supabase project. A real recovery means creating a project, applying the migrations in `supabase/migrations/`, loading the tables (the same load order and `session_replication_role = replica` approach used in `src/lib/editorial/backup.ts`), then recreating Auth users with their original IDs. That final step is manual and has not been exercised.

## Rehearsal log

- 2026-11-11: backup of the live project (1 team member, 137 content items and revisions, 137 audit rows, 1 release, 0 images). Restore rehearsal passed all four checks above.

## Scheduled, encrypted backups

`.github/workflows/cms-backup.yml` runs every Sunday 20:17 UTC (and on demand from the Actions tab): export, restore rehearsal, then encrypt into ONE file (AES-256-GCM, key from a passphrase) and keep only that file for 90 days. It stops with a clear error if any secret is missing, and never prints data.

One-time setup (repository Settings, Secrets and variables, Actions): add `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `BACKUP_PASSPHRASE` (20+ characters, generate it in a password manager and keep a copy outside GitHub: without it the backups cannot be opened).

To open a backup: download the artifact, then run `BACKUP_PASSPHRASE=... npm run cms:backup:unpack -- <file.enc> <empty-folder>` and `npm run cms:restore-rehearsal -- <empty-folder>`. Locally, `npm run cms:backup:pack` encrypts the newest backup.

Restoring login accounts (`restoreAuthUsers`) recreates them with their original IDs so CMS references stay valid; it passed unit tests and a dry run on real data but has not been run against a real Supabase project.

- 2026-11-11 (second log entry): live project, 142 items, 152 revisions, 161 audit rows, 3 releases, 2 images (4 files), 1 comment, 1 live-release choice, 1 login account. Rehearsal passed, including from a decrypted copy. The encrypted file contained no readable emails, table names or record names.
