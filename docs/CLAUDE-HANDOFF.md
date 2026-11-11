# Sonic Collective — Claude handoff

Updated November 9, 2026 (Asia/Manila). This records actual work and unfinished work; do not assume the proposed publishing pipeline exists.

## Current verified checkpoint — November 9, 2026

This section supersedes older checkpoint notes below. The CMS is not complete and is not deployed.

- Implemented archive/restore controls and filtering, new artist/performance previews, owner team roles/status/assignments, retryable invitations, private image upload/gallery, immutable release preparation/download, and optional validated release-file builds.
- Applied archive, team, release, media and invitation migrations to Sonic `icnnkasmnvecgsxqwdlq`; regenerated database types. Existing Danes project untouched. Hosted counts: 137 content items, one member, zero releases/invitations/assets. No real invitations, uploads, role changes or release creation were performed.
- Victor configured `SUPABASE_SECRET_KEY` privately in ignored `.env.local`. A read-only admin request verified access without logging credentials or response data; the local server was restarted. Never copy this key into chat, source, or public environment variables.
- Media bucket is private. Client roles cannot read Storage objects directly or finalize assets. The server validates uploads and signs only ready derivatives permitted by current membership, for 60 seconds. Originals remain private. Public artwork selection/export integration remains unfinished.
- Release files are fully validated before build consumption with `CMS_RELEASE_FILE`; absent configuration retains repository content. A fixture build proved changed artist content reached rendered HTML, then a default build restored normal output. Preparation/export does not deploy.
- Verification: 101 tests pass; Astro check covers 143 files with zero errors/warnings/hints; default and fixture builds each pass 111-page/111-route validation. Logs are ignored under `.local/`. No real SMTP journey, hosted upload or production deployment was tested.
- Existing Vercel team still returns no accessible projects. Do not create a replacement. Deployment, live release verification and rollback remain blocked on access to the existing project.
- Other outstanding work: public media manifest integration, revision comparison/provenance/inbox, backup rehearsal, device and end-to-end acceptance. The new community-pick editor is included in the 101-test pass. Performance previews can include explicitly supplied permitted artist drafts; unselected drafts are not assembled automatically.
- Lower-cost workers exhausted their usage allowance; root integrated their saved changes. Commit `3acf0f4` (`Build editorial CMS foundations and handoff`) contains the working tree; it is clean. Generated package-lock.json exceeds 1,000 lines (6,178 lines); decomposition is Victor’s decision. The standalone review covered an earlier snapshot; Victor should explicitly run `$thermo-nuclear-code-quality-review` before merging or deploying. Restore history action now relies on the generated RPC void return and expected next version; included in this check/test/build.

## Update — November 11, 2026 (media-library artwork in releases)

- Production runs commit `9e88757` on the existing Vercel project `sonic-collective`; SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and a Sensitive SUPABASE_SECRET_KEY are set. Admin login page reachable; real login/upload/release not exercised on production.
- Packet 4 core (local commit, not deployed): content may reference a ready media-library image as `/media/cms/<asset-uuid>` (portrait/thumbnail). Release build validates the reference structurally, `prepareEditorialRelease` requires every referenced asset to be `ready`, `npm run cms:materialize` (needs CMS_RELEASE_FILE, SUPABASE_URL, SUPABASE_SECRET_KEY) copies derivatives to ignored `public/media/cms/` and sizes to ignored `src/data/cms-media/`, and MediaImage merges them. The new-content form offers ready library images.
- Not done: picker for existing records, draft preview rendering of private images, history/inbox (Packet 5), release automation/Vercel promotion (Packet 6), backup rehearsal (Packet 7). Vercel builds do not run cms:materialize, so a release with library images cannot be built in production yet.
- Verification: 106 tests, Astro check 146 files clean, 111-route build. No AI attribution in commits (Victor's rule).

- Packet 5 slice 1 (local commit, not pushed): revision history is paginated (20/page via ?history=N) and shows a readable diff against the previous revision (history.ts + revision-diff.ts). Still open in Packet 5: YouTube inbox page and editable Short→full mapping, reviewer comments, draft/review/approved/live labeling, single snapshot assembler for exact release preview.

- Packet 5 slice 2 (local commit, not pushed): /admin/youtube/ inbox lists snapshot videos read-only with filters/pagination, shows human decisions from youtube-review drafts, and starts a review draft ({youtubeId} only). Short→full mapping is a validated select (only authored performances or reviewed full videos; Shorts only), enforced in applyContentAction before the RPC. Not browser/hosted tested. Still open in Packet 5: reviewer comments, draft/review/approved/live labels, single snapshot assembler for exact release preview.

- Authenticator is now OPTIONAL (Victor's decision, Nov 11): required only for accounts with a verified factor. App helper src/lib/editorial/mfa.ts; DB migration 20261111020000_editorial_mfa_optional.sql rewrites the aal2 condition in 4 functions via editorial_private.mfa_unmet(). Migration must be applied to hosted Supabase manually (no MCP access this session). Team roster/actions page reports the MFA requirement clearly.

- Team roster bug (Nov 11): list_team_members returned auth.users.email (varchar(255)) into a text column, so the hosted roster failed (tests used text). Fixed by migration 20261111030000_editorial_roster_email_type.sql (::text cast); tests now stub varchar(255). Apply to hosted Supabase manually.

## Historical checkpoints

The notes below describe earlier snapshots; their local-only, secret-pending and test-count statements are superseded above.

**Latest task: both review findings fixed locally.** Two lower-cost agents handled archive/site refactor; root integrated. Archive uses one reference traversal for inbound guards, insert and unarchive; committed tests cover distinct draft/approved stale references and unchanged state on rejection. Site scalar settings share definitions/renderer/mapper; hero/teaser remains independent from spotlight ordering; legacy/extended no-op preservation tested. Root added hidden empty picker marker + regression so removing all entries still clears while omitted lists stay unchanged. Original review findings below are historical; not open. No hosted migration, real content write or deployment. Final verification status is in CMS-COMPLETENESS-PLAN progress note.

Final remediation test/build result: **74 tests pass;111 public pages/111 required routes** pass build/output validation. Last check before the empty-picker addition was clean across123files; final check follows the small addition. Archive stays local-only; do not claim whole CMS complete or production deploy.

Final post-addition Astro check also passed **123files,zero errors/warnings/hints**. First attempt hit Windows EPERM on generated .astro rename while local dev watcher was running; stopped port4321 Astro dev watcher, reran successfully, then restarted explicit-env local dev. Do not run concurrent Astro cache-writing processes. No handwritten changed file exceeds1000lines; generated lockfile6206lines remains flagged. No browser/hosted verification this checkpoint.

**Latest standalone review (explicit “go run it”): changes requested. Do not apply archive migration yet.** See CODE-QUALITY-REVIEW.md latest section. Reproduced P1: archive performance → archive its artist → unarchive performance succeeds, reactivating references to archived content because reference validation is only on revision insertion. Ignored repro `.local/archive-review.test.ts` fails with Missing expected rejection; commit a real regression during fix. P2: site field mapping/rendering/schema contract duplication is growing; isolate typed site field mapping/component and media normalization before more controls. No fixes/cloudwrites during review. Earlier73 passing tests/check/build apply to their limited coverage, not proof of this missing case. New-record preview and archive UI/hosted setup remain unfinished.

**Latest recovery checkpoint:** Victor requested continued multiagent execution after the usage limit interrupted the batch. Three GPT-6 Luna workers finished the narrow fixes/validation; root integrated. Six TypeScript errors are resolved: create payload returns canonical Artist/Performance types and tests narrow correctly; site field tuple uses typed literal keys. Full suite now **73 tests passing**, Astro check **121 files / zero errors, warnings or hints**. Final build result is recorded in the completeness plan when available. No cloud writes, no real content mutation or deployment.

Final recovery build also passed: **111 HTML pages,111 required routes**,253files, both validators successful. Thus the local integration errors are resolved. Follow plan for outstanding hosted archive/UI, new-record preview, broader editor contracts/team/media/release work; the entire CMS is not complete.

Header labels and existing-record hero/portrait teaser controls are implemented with legacy defaults and approved bundled-media derivation. Artist/performance create route `/admin/content/new/` is linked from library, starts expected version0 and resolves saved revision UUID back to item UUID before redirect. Kind selection uses explicit links, validation preserves input, references/media/video are constrained to current allowed choices. **New-record preview is still unsupported by baseline preview assembler; do not claim complete create→preview→publish journey.** Local archive migration `20261106023243_editorial_archive.sql` and PGlite coverage are finalized, including roles/MFA/expected versions/reference protections/history preservation. Archive remains unapplied to hosted Supabase, without archive UI or regenerated hosted types. Full multi-session concurrency and hosted Storage/Auth tests remain separate checks. New source needs Victor's explicit standalone quality review before merge. Browser/physical-device checks were not run in this recovery checkpoint.

**Next authorized parallel batch (in progress):** cms_execution owns typed header labels + existing-record hero/teaser controls; library_search owns new artist/performance draft creation route/helper/tests only; cms_ci_ops owns local additive archive SQL/RPC/PGlite tests/docs. No hosted schema application or completed-feature claim yet. Root will integrate links/types/UI as needed and run shared Astro checks/build sequentially. Previous About/footer batch verified 66 tests, clean117-file check,111-route build; current batch not yet verified. Preserve this distinction.

**Current execution mode:** Victor explicitly authorized multiagent to speed up building. Three GPT-6 Luna workers run with separate ownership: existing cms_execution handles typed About/footer/social/contact contracts/editor/public rendering; library_search handles library route/helper/tests; cms_ci_ops handles new nonmutating CI workflow and README/CMS-OPERATIONS docs. Root coordinates shared checks sequentially and integrates progress. These parallel slices are in progress, not verified complete. Workers must preserve the existing dirty tree; no cloud writes/commits/pushes or paid resources authorized by this mode change.

**Latest authorization:** Victor requested CMS-completeness execution by a lower-cost model and authorized continued implementation. Packet 0 is verified locally. Packet 1 library and About/footer/social/contact controls are implemented; the full public-field inventory/contracts remain in progress. Read `CMS-COMPLETENESS-PLAN.md` for acceptance gates and status. Preserve existing uncommitted work. Journal/calendar/submissions remain excluded; deployment still depends on existing Vercel access.

### November 6, 2026 CMS execution checkpoint

Packet 0 fixes: YouTube review series selection now distinguishes automatic/inherited (field omitted), explicit Unclassified (`null`), and named series. Regression coverage confirms merge behavior and preservation of unrelated record metadata. Private performance previews no longer show Copy page link; public share remains. Existing dirty-form protection covers save/review/restore form navigation and picker changes. No unsaved-transition loss was reproduced, and no browser-level transition test was added.

Packet 1 library: visible labels resolve from each RLS-authorized draft revision; stable-ID search, kind/status filters, exact count, and deterministic 25-row database pagination are present. Search is by stable ID; readable-name search requires a future schema/index decision. First source/schema/editor/preview mapping is in `CMS-EDITABLE-INVENTORY.md`; editable homepage/About/footer/navigation/SEO contracts and release mapping remain unfinished. A sibling added nonmutating CI, `README.md`, and `CMS-OPERATIONS.md`; CI workflow was syntax-only verified. No content or cloud mutations were performed.

About/footer/header/home selection slice (November 6): optional site fields preserve legacy schema-v1 revisions through defaults. The site editor exposes About/footer/social/contact, header labels, and selectors limited to existing eligible performances/portrait clips. Changing selection derives media paths from the bundled record; the form accepts no arbitrary media path. Authenticated previews expose home and About. Focused site contract/selection tests pass 4/4. Full suite/check/build for this newest slice await parent’s serialized validation slot. Browser inventory previously exposed no apps or browsers. No content or cloud mutation.

Packet 2 create/archive has not started. Generated `package-lock.json` is 6,206 lines and remains flagged for Victor’s standalone code-quality review on the new snapshot.

**Latest task: whole-project audit, requested before more building.** Read `docs/PROJECT-AUDIT.md` first for the current prioritized gap inventory and build order. No application fixes applied during this audit. New confirmed issues: YouTube Unclassified series removes override instead of explicit null; performance-preview share copies a preview URL without required revision. Live homepage returned 200; live `/admin/` returned 404. Fresh content validation passed (20 artists/18 performances/11 clips), production dependency audit zero vulnerabilities. Prior checkpoint 60 tests/clean check/111-page build still applies; no redundant full rerun for documentation-only changes. Broader release/team/media/editability/recovery/CI gaps and optional public expansions are documented separately in the audit. Earlier verification/plan files are historical; do not use their stale cloud statements as current state.

## Request and current stopping point

Victor wants a usable nondeveloper admin CMS and improved UI for Sonic Collective. He approved continuing the editing journey: save draft → private preview → approve → validated release → deploy/verify → rollback. He has now asked for this handoff instead of further implementation. Continue from the working tree, not a fresh scaffold.

The existing draft editor, approval foundation, private exact-revision previews, and restore-as-new-draft are implemented. **Release tables/exporter, deployment integration, and release rollback remain unfinished.** Keep this document and editorial-setup.md updated at each coding checkpoint (Victor explicitly requested this).

### November 6 continuation checkpoint

Standalone thermo-nuclear-code-quality-review explicitly requested and completed after this checkpoint; original verdict changes requested. **All three findings subsequently addressed**: typed `actions.ts` owns mutations/outcomes, picker retains selected RLS-hidden references, picker emits bubbling change events after DOM mutations. MFA feedback uses assurance-level API rather than provider error prose; database MFA/role checks remain authoritative. New action and relationship tests included: 60 tests pass; build/output validators pass for 111 pages. No independent second review claimed. See `docs/CODE-QUALITY-REVIEW.md` remediation section.

Mobile artist preview now checked at 390×844 with no horizontal overflow (screenshot preview-mobile.png); physical device unchecked. Picker reorder exercised in browser without typing; navigation attempt left editor open, but no dialog text was exposed by automation. No actual draft was saved. Existing project Vercel access still returns an empty list; publishing/release rollback remain next. No cloud schema/data changes this checkpoint.

- Completed public component extraction and added `/preview/[id]/` behind existing middleware/membership checks and RLS. Revision query is bound to the requested item; no implicit latest-revision fallback.
- Artist/performance/homepage previews assemble one saved revision against the repository's published catalog. Other page links go to the published site. No combined multi-draft preview yet; unsupported content types have no preview links.
- `src/lib/editorial/preview.ts` validates immutable IDs, Zod payload, whole catalog references, and existing packaged media. New uploads/new public pages are deliberately unsupported until their workflows exist. The bundled YouTube snapshot is used for runtime consistency.
- Private banner/back-to-editor, noindex, no canonical, no analytics. Astro hoists processed scripts despite conditional markup, so scripts/engagement.ts explicitly checks the draft-preview body class.
- Editor shows latest 20 revisions. Restore reads an authorized historical revision for the same item, validates it, and invokes existing optimistic save RPC. It appends a draft, retaining prior approval; history stays immutable. Restore audit currently records normal save, not a distinct restore action.
- Verified: 56 tests passed; an additional focused database rerun passed after adding restore assertions; `npm run check` reports zero errors/warnings/hints; build generated and validated 111 public pages. Initial parallel Astro checks collided on a generated cache temp file; sequential check passed. Do not run concurrent Astro check/build jobs against the same .astro directory.
- Signed-in browser verified Blair editor/history and exact revision preview with private banner and noindex. No real draft or restore was saved during browser verification. Screenshot: private-preview.png in the existing visualization directory. Mobile preview and full authenticated negative-path browser tests remain unchecked.
- Restarted local dev with explicit .env.local loading on port 4321. Previous browser error tab could not recover through CUA; a fresh tab (id3) rendered successfully with the existing owner session.
- Vercel recheck still returns no Sonic projects for the known team. No deployment or cloud schema changes made this checkpoint.
- Next: immutable validated release/export/build consumption, then connect deployment when existing-project access is available. Broader remaining scope below still applies.

## Workspace and operating rules

- Parent workspace: `C:\Users\VictorAlexis Gadiana\Documents\Github\sonic-collective`.
- Actual Git root/app: `C:\Users\VictorAlexis Gadiana\Documents\Github\sonic-collective\site`.
- Branch `main`; remote `github` points to `https://github.com/victor-7-ops/sonic-collective.git`. Last known committed HEAD: `20c8b7f`. Check current HEAD yourself.
- CMS changes are uncommitted, including many untracked files. Preserve them; inspect `git status --short` before editing.
- PowerShell. Run `. ./scripts/use-runtime.ps1` to select isolated Node 22.23.4 before npm commands.
- Ponytail full: smallest complete readable change, reuse existing code, avoid unnecessary dependencies, retain validation/security. End reports with unchecked items and risks.
- Follow Victor's AGENTS.md instructions, including RTK.md if present. Do not add AI/coauthor commit attribution.
- Do not spawn agents unless authorized. Before finishing a PR-sized change, tell Victor to invoke `$thermo-nuclear-code-quality-review` himself; do not invoke that standalone review on his behalf. Thermos only when he explicitly labels a change medium-risk.
- Flag changed/reviewed files over 1,000 lines. The generated package-lock was last counted at 6,206 lines; no handwritten changed file was known to exceed 1,000.
- Supabase must stay Free. Do not create paid resources or duplicate projects.
- Crew credits must remain blank unless Victor provides real credits. Do not invent artists, stories, dates, or photos.
- Keep `PUBLIC_ANALYTICS_EVENTS_ENABLED=false` until Victor confirms Vercel Pro. No reminder scheduling requested.
- Never print `.env.local`, passwords, access/refresh tokens, or service keys. User enters passwords privately in browser.

## What is implemented

### Stack and public site

Astro 7.4.5, Zod 4.6.6. Added pinned `@astrojs/vercel` 11.0.18, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119.0. Added dev-only PGlite 0.5.15 for real SQL/RLS tests. Dependency overrides remediate newly introduced advisories; last audit reported zero vulnerabilities.

Public content still comes from repository content/data files. **Editing or approving a CMS record does not publish it.** Astro remains static public pages with server-rendered admin/auth routes using the Vercel adapter. Build output moved to `dist/client`; both output validation scripts were updated accordingly.

### Authentication and authorization

- `src/lib/editorial/server.ts`: validated configuration, per-request Supabase SSR client, HttpOnly cookies, SameSite Lax, HTTPS-only secure cookies, provider cache headers.
- `src/lib/editorial/access.ts`: role helpers, bounded form parsing (16 KiB), exact same-origin POST checks, private/no-store/noindex/security headers.
- `src/middleware.ts`: editorial path boundary matching; fresh Supabase user validation and current active database membership; denies unsupported methods; protects admin/preview/editorial API paths.
- Login, logout, recovery, account password update, TOTP enrollment/challenge, and MFA-aware approval UI.
- Callback routes: `/auth/confirm/`, `/auth/landing/`, `/auth/session/`. Landing supports PKCE code exchange and recovery fragment tokens; strips fragment tokens before same-origin session POST, verifies user and membership, never reflects provider error text.
- Important fixed bug: `Referrer-Policy: no-referrer` caused browser form POST Origin `null`. It is now `same-origin`; strict CSRF checks remain. Do not weaken origin validation.
- Recovery uses a narrow stateless implicit client to support opening email in another browser. Normal SSR auth remains PKCE.
- Owner eventually signed in successfully. Do not ask for/reset the password unnecessarily. The complete recovery flow was not independently observed end-to-end after provider email rate limiting.

### Database and editing

Applied local and hosted migrations:

1. `supabase/migrations/20261105125939_editorial_foundation.sql`
2. `supabase/migrations/20261105134905_editorial_policy_initplan.sql`

Tables: `team_members`, `content_items`, immutable `content_revisions`, immutable `editorial_audit`. RLS enabled. Anonymous users cannot select; authenticated users cannot write tables directly. Contributors can access their own artist/performance/clip records; owner/editor can access all. Current membership, rather than user metadata or stale JWT role claims, authorizes access.

`save_editorial_content` RPC locks the row, checks expected version, appends a revision, updates the draft pointer, retains prior approved revision, and audits. `review_editorial_content` checks the exact current draft; approval/request-changes require owner/editor and AAL2 MFA. Private security-definer implementations have explicit grants and empty search paths; public wrappers are invokers. Composite foreign keys prevent revision pointers crossing items.

**SQL validates bounded JSON shape, not full application Zod schemas.** Server forms validate schemas, but a direct RPC caller could save malformed draft content. A future preview/release/build must independently validate every payload and the whole graph, including approved records. Do not trust approval alone.

- `src/lib/editorial/content.ts`: shared schema parsing, immutable stable IDs, human labels, idempotent seed SQL with safe quoting.
- `forms.ts`: descriptive field definitions and updates preserving untouched metadata.
- `EditorialPicker.astro`: ordered selections with add/remove/move controls.
- `/admin/content/`: library of 137 records with statuses.
- `/admin/content/[id]/`: save with optimistic concurrency, safe errors, stale-save protection, submit/approve/request changes, latest-20 revision history, exact-revision previews and restore-as-new-draft. Clips currently read-only. No new-item creation or media upload yet.
- Seed command validates existing content/assets and only inserts absent records. No overwrites. `npm run cms:seed` is dry-run by default; `--write` creates ignored `.local/editorial-seed.sql`.

### Admin UI

`EditorialLayout.astro` and `src/styles/editorial.css` provide forest-green navigation, cream workspace, clear active states, identity/sign-out, forms, status badges, responsive counters and panels. Overview uses real database counts and working links. Library uses human labels. Detail title uses artist/performance name rather than raw ID. Publishing is honestly labeled unconnected.

Owner browser session verified overview, library, and editor. Phone-width 390px checked without page-wide overflow. Physical devices not tested. No real content edits were saved during UI verification.

## Cloud resources — use the correct account

### Supabase Sonic project

- Organization: **Sonic Collective**, ID `vgykuqbwhmqxpmocyvpq`, Free.
- Project display name: **dmstudio.admin@gmail.com's Project**.
- Project ref: **`icnnkasmnvecgsxqwdlq`**, Singapore, healthy when last checked.
- Connector Sonic link ID: `link_6aec832f835481918633d0afb1b226f9`.
- Another connector link `link_6aeac12e82dc81918e28342cca930e4e` belongs to Primary/Danes. Do not use it for Sonic.
- Unrelated Danes booking project `hrvnoxhnwrnnwnlajejt` was left untouched.
- Confirmed owner: `dmstudio.admin@gmail.com`, Auth UUID `8b5a6758-478d-4e24-9a38-4938cb20817f`; active owner membership exists.
- Seeded 137 records and 137 revisions: 20 artists, 18 performances, 11 clips, 2 series, 1 site config, 85 YouTube reviews.
- Buckets `editorial-drafts` (private), `editorial-public` (public) are empty with no client upload policies. Add validation before enabling uploads.
- Hosted signup/anonymous signup disabled; email confirmation enabled.
- Temporary hosted Auth Site URL `http://127.0.0.1:4321`. Exact allowed callbacks `/auth/confirm/`, `/admin/account/`, `/auth/landing/` at that origin. Update intentionally when production is available.
- Default SMTP; custom email templates unavailable without custom SMTP in current dashboard.
- Leaked-password protection warning remains (paid feature; no upgrade authorized). Seven informational unindexed-FK findings were left for the small catalog; per-row RLS auth warnings fixed in migration two.
- Local `supabase/config.toml` does not automatically configure hosted Auth.

Use hosted migration tools for DDL, and generate local filenames with Supabase CLI (`npx --yes supabase@3.0.0 migration new NAME`) before applying. Regenerate `src/lib/editorial/database.types.ts` after schema changes. Local Docker engine was unavailable; PGlite tests are not a full local Supabase stack.

### Vercel blocker

- Existing public site: `https://sonic-collective.vercel.app/`.
- Known team slug `dmstudioadmin-2050s-projects`, ID `team_oTr4e7FaSUte49sp6YorLDOG`.
- Connector lists the team but returns no projects; project lookup returns 404. CLI project inspection with that scope also failed (scope does not exist).
- A pending question asked Victor to reconnect Vercel with access to the existing project or provide its dashboard link. No answer was received before handoff.
- **Do not create a replacement Vercel project or claim publishing is connected.** Recheck authorized access; continue local work independently.

## Runtime and checks

Ignored `.env.local` contains original YouTube API key and Sonic `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. No service-role key is available or needed for browser/server member editing. Preserve the original YouTube key. Explicit env loading worked reliably:

```powershell
Set-Location 'C:\Users\VictorAlexis Gadiana\Documents\Github\sonic-collective\site'
. ./scripts/use-runtime.ps1
node --env-file=.env.local ./node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4321
```

Check whether port 4321 already serves the app before starting a duplicate process.

Last completed verification **before the newest component extraction**:

- `npm run check`: zero errors, warnings, hints.
- `npm test`: 54 passing tests.
- `npm run build`: 111 public pages, both output validators passed.
- `npm audit`: zero vulnerabilities.
- Actual anonymous REST queries denied on all four editorial tables.
- PGlite tests cover migrations, direct-write denial, nonmembers, contributor isolation, revoked membership with old JWT, MFA approval, stale versions, immutable history, safe/idempotent seeding.

Do not report those results as verification of the latest partial work.

## Preview extraction reference (completed in continuation above)

The following extraction was originally partial; it is now checked and consumed by the authenticated preview route:

- Public pages `src/pages/index.astro`, `artists/[slug].astro`, `sessions/[slug].astro` now delegate to new `HomePage.astro`, `ArtistPage.astro`, `PerformancePage.astro` components, retaining static path/catalog loading in pages.
- Components accept an injected discovery catalog plus optional `preview` and `editorPath`. Inspect relative imports, scripts, styles, props, and preservation of page behavior.
- `getDiscoveryCatalog` now accepts optional `{raw, snapshot, overrides}` while preserving default loaders.
- `BaseLayout.astro` gained a private draft banner, noindex/no canonical behavior for previews, and excludes analytics/engagement when previewing. Check header offsets, mobile behavior, and playback.
- `.local/extract-preview.mjs` generated these files. **Do not rerun it against the already-extracted wrappers.** It is an ignored temporary helper, not a supported project script.
- `/preview/[id]/` now consumes this work; see the latest checkpoint for its scope and limitations.

## Suggested continuation (design only)

1. Run check/tests/build and fix extraction regressions before adding functionality.
2. Add authenticated exact-revision previews using the same public components. Fetch via member client/RLS; validate selected payload and the entire assembled catalog; keep no-store/noindex/no analytics. Never prerender drafts or expose them through public data endpoints. Reuse existing schemas and `validateCatalog`, assets manifest, snapshot validation, and URL helpers.
3. Add revision history and restore-as-new-draft using existing save RPC and expected version. Never modify immutable history or automatically approve a restore.
4. Add immutable approved release records/RPC only after local SQL tests. Require current editor/owner + AAL2. Compare exact approved revision map under lock to avoid approval races; idempotency for double submits. Validate whole graph before storing and again at build consumption. Avoid client-selected unverified release payloads/status.
5. Export a strict versioned release artifact with content hash and exact revision identities. Public build and both validators must consume the same snapshot; preserve repository fallback/known-good rollback. A rollback should create a new auditable release referring to a prior snapshot.
6. Connect the existing Vercel project only when access is resolved. Serialize CMS publishing with hourly YouTube sync promotion; preserve known-good deployment on failure. Verify the live release identifier before calling a release published. Do not fake a successful deployment from a download or build alone.

This is proposed architecture, not a mandate for extra abstraction. Implement the smallest complete version consistent with existing contracts.

## References and browser state

- `docs/editorial-cms-plan.md`: broader architecture and remaining packets.
- `docs/editorial-setup.md`: implementation/setup checkpoints.
- `tests/editorial-access.test.ts`, `editorial-db.test.ts`, `editorial-recovery.test.ts`.
- Last browser context: signed-in local owner at `http://127.0.0.1:4321/admin/` in the in-app browser. Reinspect; do not assume the session survives.
- Browser automation used CUA. Stale handles sometimes required reset then reselecting the tab. Never inspect password values. Reuse existing tab where possible.
- UI proof screenshots: `C:\Users\VictorAlexis Gadiana\.codex\visualizations\2026\11\05\01a1abb8-1208-7783-befe-f0871d79aff4\admin-ui-desktop.png` and `admin-ui-mobile.png`.

No deployment was completed and no publishing release was created. The preview/refactor checkpoint is verified as described above; release work remains next.
