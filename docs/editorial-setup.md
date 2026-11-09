# Current gap inventory

See `PROJECT-AUDIT.md` (November 6, 2026) for the whole-project audit and recommended build order. It distinguishes confirmed defects, missing features, blockers and unverified checks. This setup file records implementation checkpoints; a passed checkpoint does not imply the full CMS is production-complete.

# Editorial foundation: setup and current status

November 5, 2026. This is an unfinished CMS implementation, not a production launch.

## Target and connected backend

Victor's browser shows organization **Sonic Collective** (`vgykuqbwhmqxpmocyvpq`) and project **dmstudio.admin@gmail.com's Project** (`icnnkasmnvecgsxqwdlq`), Singapore, Free organization. This is the intended separate backend. Do not create a duplicate or reuse Danes.

The Supabase plugin's **Sonic** connection now has access to the intended project. The `editorial_foundation` migration was applied and 137 existing records imported: 20 artists, 18 performances, 11 clips, 2 series, 1 site record and 85 YouTube reviews. There are 137 immutable initial revisions. Security advisors returned no findings; SQL inspection verified RLS on every application table, no anonymous SELECT, and no authenticated direct INSERT/UPDATE grants.

Victor created the confirmed Auth account `dmstudio.admin@gmail.com` privately. Its UUID is associated with the active owner membership. No password was entered or read by the agent. The local dashboard is connected using the publishable key in ignored `.env.local`; generated database types are saved in `src/lib/editorial/database.types.ts`.

Hosted public signup is disabled; anonymous sign-in was already disabled. Hosted Site URL is temporarily `http://127.0.0.1:4321`, with exact `/auth/confirm/`, `/admin/account/` and `/auth/landing/` redirects. Update these to the canonical production origin after a verified admin deployment. Custom SMTP is not configured; current dashboard UI restricts email-template editing without it.

Password recovery now uses a stateless implicit email request so the user can open the link in Chrome even when the request originated in the in-app browser. The callback immediately removes fragment tokens, posts them same-origin, verifies the user with Supabase, checks current active membership and sets server-managed HttpOnly cookies. Normal SSR authentication continues using the existing server client. Legacy PKCE links remain supported when their verifier cookie is present; new error handling distinguishes expired/invalid links without reflecting provider-supplied text.

Recovery requests now report delivery errors and throttling instead of displaying a misleading success message. Victor's current browser shows the provider's too-many-recovery-requests response; do not keep resending. Fresh cross-browser recovery and a successful owner login/password change remain unverified pending recovery availability.

Later UI checkpoint: an authenticated owner session was verified in the in-app browser at `/admin/`, `/admin/content/` and an artist editor. No password was read or entered by the agent, and no draft was saved during UI inspection. The refreshed editorial interface uses a forest sidebar, cream workspace, real content counters, review badges, recent records and accessible form controls. At a 390px emulated viewport, all three inspected pages had no page-wide horizontal overflow. A physical iPhone was not tested. The explicit password-reset journey still has not been verified end to end.

Deployment discovery remains unresolved: the Vercel connector lists team `team_oTr4e7FaSUte49sp6YorLDOG` / `dmstudioadmin-2050s-projects`, but project lookup returned 404 and project listing returned no projects. Do not create a replacement project or claim `/admin/` exists at production until the existing deployment is located.

## Implemented locally

- Astro/Vercel server adapter, preserving prerendered public routes. Public build files now live in `dist/client/` and deployment files in ignored `.vercel/output/`; both existing output validators use the new public directory.
- Server-only Supabase SSR client. Editorial routes require backend configuration and fail with private, uncached 503 responses when absent; public routes remain available.
- Sign in, logout, recovery confirmation, password setup, authenticator enrollment/verification and a private dashboard/content library.
- Draft editing for existing artist and performance text, series labels, YouTube review classification/artist mappings, and ordered homepage selections. Other fields remain intact. No raw JSON editor.
- Immutable revisions/audit, current-row membership authorization, contributor ownership, exact-version optimistic locking, review submission, editor approval with MFA. Approval is not publication.
- Non-destructive seed preparation from existing validated JSON: 137 records at this baseline. SQL inserts only absent `(kind, stable_id)` records and cannot overwrite later CMS edits.
- Private and approved-public Storage bucket definitions. Client uploads have **no policy yet**, intentionally denying uploads until server validation/finalization is built.

## Local commands

From the `site/` Git root:

```powershell
. ./scripts/use-runtime.ps1
npm ci
npm run cms:seed
npm run cms:seed -- --write
npm run check
npm test
npm run build
npm run dev
```

`cms:seed` is a dry run by default. `--write` writes `.local/editorial-seed.sql`; neither command connects to a database. Do not commit the generated seed or apply it to Danes.

For explicit local environment loading when needed, run `node --env-file=.env.local ./node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4321` after selecting the supported Node runtime. Do not print the environment file; it also contains the pre-existing YouTube API key.

Supabase CLI 3.0.0 generated the local config and initial migration. It is not a production dependency. Use its documented `--help` to discover commands; remote mutations require an explicit target. The local stack requires a running Docker engine, which was unavailable during this implementation. The repeatable security test uses development-only PGlite with minimal Auth/Storage schema stubs, testing PostgreSQL RLS/functions/constraints without pretending to test GoTrue, PostgREST or the Storage API.

## Connect the backend after access is granted

1. List projects again; verify the exact intended project ID and organization. Inspect its tables/migrations/advisors. Stop if unrelated application data exists; do not overwrite it.
2. Test the migration against the local Supabase stack when Docker is running, then apply the committed migration to this separate project through the connector. Inspect advisors and resolve relevant findings.
3. Apply the prepared baseline seed once under an authorized administrative connection; verify record identities, counts and payloads. Rerunning must preserve existing edits. Generate TypeScript database types from the actual schema.
4. Configure Auth to disable public signup and anonymous login; use the canonical production origin and exact `/auth/confirm/` callback allowlist. Local config alone does not change hosted Auth. Set minimum password length to 12 and enable TOTP enrollment/verification.
5. Configure custom SMTP and verify the sender. Set invitation email links to `{{ .SiteURL }}/auth/confirm/?token_hash={{ .TokenHash }}&type=invite` and recovery links to `{{ .SiteURL }}/auth/confirm/?token_hash={{ .TokenHash }}&type=recovery`. The server handles these tokens; no browser-side hash-token flow is implemented.
6. Bootstrap Victor's verified Auth account using his confirmed login email, then insert its UUID into `team_members` with role `owner`. Do not assume the public collaboration address or provider account address is his desired editor login. Never paste passwords or keys into chat.
7. Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` privately in local and Vercel environments for this separate project. No service role key is needed by the implemented dashboard; it uses the user's session and restricted RPCs. Invitations/administration will require a separate, narrow server-only integration later.
8. Perform real login, recovery, invite acceptance, MFA and revoked-membership tests. Inspect session-cookie cache headers in the deployed runtime. Do not call the CMS ready before these checks.

## Security design

Authenticated users have SELECT privileges under RLS, not direct content/history/membership mutation privileges. Public RPC wrappers are invoker functions; internal mutation functions explicitly check the current user and active membership. Their execute grants exclude anonymous/public roles and use a fixed empty search path. Internal role lookup avoids recursive membership policies. Content drafts are private even when a user writes an eligibility flag.

The elevated database functions permit drafts, not arbitrary SQL or public publishing. Existing Zod validation runs in the server forms and seed preparation. A future release exporter must independently validate every approved payload and its entire reference graph because an authenticated user can call RPCs outside the form UI.

Browser verification caught and fixed a form-origin bug: `Referrer-Policy: no-referrer` makes ordinary form POSTs send `Origin: null`. Editorial responses now use `same-origin`, retaining strict origin checks and withholding cross-site referrers. A real browser form submitted with a nonexistent test account reached authentication after the fix; cross-site and null origins remain rejected. Do not relax CSRF checks to compensate for this header interaction.

The `editorial_policy_initplan` migration avoids evaluating Auth identity/role lookups per row. The SQL security suite applies every migration in order. Performance advisors also report seven informational unindexed foreign keys; these have not been indexed merely to silence a linter at this small data size ([advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)). Revisit with workload evidence before the catalog grows substantially.

After account creation, the security advisor reported leaked-password protection disabled. This feature requires Pro or above and was not enabled or purchased on Victor's requested Free plan ([password protection documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). MFA approval checks remain enforced by the database.

All editorial mutations require same-origin POST. Bodies are limited to 16 KiB before parsing; passwords never return in error responses. No dashboard analytics or public indexing. Membership is checked on every request and inside mutation RPCs, so revoked users cannot retain editorial access through stale role claims.

Npm initially reported transitive adapter advisories in glob/minimatch/path-to-regexp. Scoped overrides select patched versions; `npm audit` then reported zero vulnerabilities. Recheck and remove overrides when upstream dependencies resolve those advisories. Adapter compatibility and public output passed a real local build with these versions.

## Still required before the planned CMS is complete

- Owner invitation/role-management UI, assignment and safe last-owner handling; revision comparison and create/archive flows (restore-as-new-draft is implemented).
- Complete page/global text, navigation, footer, social/contact, SEO and typed section editing; media upload validation/crops/reference-safe deletion.
- Combined multi-draft previews and previews for other content types (artist/performance/homepage exact-revision previews now work).
- Immutable release export, coordinated GitHub/Vercel publishing, honest live deployment status, retries and rollback. Public source-of-truth remains the existing JSON until cutover.
- Full YouTube inbox, exact-full-video relationship UI, migration parity and source-of-truth cutover.
- Journal, artist-led collections, confirmed calendar/ICS, performance share artwork, submissions/privacy/retention.
- Live provider security tests, Storage API tests, real iPhone checks, backup/export restore and owner/team editorial rehearsal.

The content library does not imply these unfinished features are available. No publish button or successful deployment claim is exposed. Existing crew credits remain blank; no editorial content or dates were invented. See `editorial-cms-plan.md` for the complete packet dependencies and acceptance criteria.

Before finishing a PR-sized implementation, Victor must explicitly run `$thermo-nuclear-code-quality-review`; it has not been invoked automatically. The generated `package-lock.json` exceeds 1,000 lines (6,206 at this checkpoint); no handwritten source/schema added here exceeds that threshold.

## November 6: private previews and revision recovery

Subsequent explicit standalone code-quality review initially requested changes. All three findings now addressed: typed mutation orchestration in `actions.ts`, selected-reference preservation without wider RLS, and bubbling picker change events. See `CODE-QUALITY-REVIEW.md` remediation section. 60 tests and 111-page build/output checks pass; no cloud state changed. Mobile artist preview checked at 390×844 without overflow; physical device remains unchecked. Vercel still lists no projects for the existing team, so no deployment occurred.

Added exact-revision authenticated previews for artist/performance/homepage records using shared public components. Preview validates payload and full catalog references, only accepts packaged media, stays no-store/noindex, and suppresses analytics. It overlays one revision on published repository content; navigation outside the preview shows the published site. Unsupported/new pages and uploaded assets remain out of scope until their workflows exist.

The editor displays the latest 20 revisions and can restore an older revision as a new validated draft through the existing optimistic save RPC. Previous approval is retained, history is immutable, and ordinary save audit is recorded. Compare UI and a distinct restore audit action remain unfinished.

Validation: 56 tests passed; focused restore SQL assertions passed; sequential Astro check had zero errors/warnings/hints; build and both validators passed for 111 public pages. Avoid concurrent Astro check/build because their .astro temp writes collided. Signed-in browser verified Blair history and exact-revision preview, including noindex. No actual cloud content mutation was made in the browser. Preview mobile and full negative-path browser tests remain unchecked.

Vercel project list still returned no Sonic project for the existing team. No release/deployment was created. Keep this file and `CLAUDE-HANDOFF.md` current at each checkpoint so Claude can continue.
