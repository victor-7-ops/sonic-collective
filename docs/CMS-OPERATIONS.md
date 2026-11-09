# CMS operations

The CMS is an unfinished editorial tool. Editing or approving a record does not publish it. Public content defaults to repository files. Immutable release preparation/download and validated `CMS_RELEASE_FILE` build consumption are implemented; deployment integration remains unfinished. The intended existing Vercel project is not currently accessible to the team connection, so no deployment or production CMS availability is confirmed. Do not create a replacement project.

## Local setup

Use Node.js 22.23.4 or newer and `npm ci`. On Windows, `scripts/use-runtime.ps1` optionally selects the ignored `.local/node-v22.23.4-win-x64` installation; that directory is not part of a clean checkout. Run `npm run content:validate`, `npm test`, `npm run check`, and `npm run build` sequentially. Astro check and build share generated state and should not run concurrently.

The site reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the separate Sonic Collective backend. Set them privately in an ignored local environment file such as `.env.local`; do not commit or print its values. `SUPABASE_SECRET_KEY` enables trusted invitations and private image processing; keep it server-only and private. It is configured locally, but must be configured separately on the intended host. `YOUTUBE_API_KEY` is used only for live YouTube synchronization. `SITE_URL`, `VERCEL_ENV`, and `PUBLIC_INDEXABLE` affect canonical URLs/indexing; `PUBLIC_ANALYTICS_EVENTS_ENABLED` controls analytics events. CI uses only `SITE_URL` and does not need secrets.

Local Supabase configuration and migrations describe local development; they do not change hosted Auth, database, or Storage settings. Apply hosted migrations only after verifying the intended project and existing schema, using forward migrations, then inspect security advisors and regenerate database types. PGlite tests are not a full Supabase stack or hosted verification.

`npm run cms:seed` validates and previews seed SQL without connecting to a database. `npm run cms:seed -- --write` writes ignored `.local/editorial-seed.sql`; it inserts only missing records and does not overwrite existing CMS edits. Review the generated SQL and target identity before any manual application. Do not apply it to an unrelated project.

## Build and deployment

The Astro Vercel adapter uses `output: 'static'` with server routes enabled; its public files are in `dist/client/` and Vercel deployment output is `.vercel/output/`. Keep the adapter in place: the CMS auth/admin routes require server rendering. `npm run build` runs the existing build and output validators. A successful local build does not mean a hosted deployment exists or is healthy.

For a release build, set `CMS_RELEASE_FILE` to an absolute artifact path. Invalid envelopes, hashes, schemas or catalog references fail closed. Omit it for repository content. Both modes passed 111-route validation; a fixture build proved content consumption and was followed by a normal build. Never deploy a fixture. The static `.openai` preview cannot host CMS server routes.

Before configuring or deploying, locate and verify access to the existing Sonic Collective Vercel project. Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the appropriate Vercel environments privately, and separately verify hosted Auth callbacks, signup settings, SMTP, MFA, and database policies. Local config does not configure those hosted services. Never expose private drafts or claim publishing works until a live release marker and health check are verified.

## Backup, restore, and incident response

The following is an **unverified procedure**, not a completed backup or restore drill. Before relying on it, assign an operator, confirm retention and access, and rehearse against a non-production copy.

1. Record the verified project ID, incident time, affected data/services, and current deployment identifier. Restrict access or disable affected credentials through the provider dashboard if compromise is suspected; do not paste secrets into logs or chat.
2. Before recovery, preserve available database and Storage exports/snapshots and relevant audit/revision records. Confirm export completeness and storage object coverage; no automated backup job is configured by this repository.
3. Restore database and Storage into the verified intended project or an isolated recovery project using provider-supported procedures. Check schema/migration state, row counts, object references, RLS, Auth settings, and application access before reopening editorial access.
4. For bad content edits, prefer the CMS restore-as-new-draft flow where available; it preserves prior history and does not publish. Public content currently remains repository-backed, so recover its files through reviewed Git history and normal CI.
5. If deployment is implicated, retain the known-good deployment and use the existing Vercel project's supported rollback after access and target are verified. Confirm the live release identifier, canonical routes, admin/auth behavior, and public output afterward.
6. Document actions, data loss (if any), credential rotation, follow-up fixes, and the results of the eventual restore rehearsal. Do not describe recovery as verified until the rehearsal succeeds.
