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

All ten editorial tables (team, content items and revisions, audit logs, releases, image records, invitations and their events, reviewer comments), a `manifest.json` with a row count and SHA-256 per table, and any private image originals/derivatives (each original is checked against its recorded hash).

The folder is git-ignored and **contains team and invitation data**. Copy it somewhere private; never commit it.

## What is NOT in a backup

- **Supabase Auth accounts** (emails, password hashes, authenticator factors). Supabase's own backups cover these; on the Free plan there are none, so a lost project means re-inviting the team.
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
