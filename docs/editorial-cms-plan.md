# Current-status note

This file is the original design/plan, not a live provider inventory. Sonic's separate Supabase project now exists and the editing foundation is implemented. See `PROJECT-AUDIT.md` and `CLAUDE-HANDOFF.md` for current status; unresolved-setup statements below reflect the planning checkpoint.

# Sonic Collective editorial CMS and public additions

Planning proposal — November 5, 2026. No application code, cloud resources, database changes, or deployments are authorized by this document. This is the current CMS direction; older plans describing a database-free site or a replacement hero are historical.

## 1. Decisions and inspected baseline

- Victor confirmed a **separate Sonic Collective Supabase project**. Organization selection still needs confirmation before creation. The connected organization is Danes Music Studio; its only visible project, Danes (`hrvnoxhnwrnnwnlajejt`, Singapore), has booking, payment, equipment, settings, and Google-token tables. Inspected table metadata only; no business records or credentials were read. Do not reuse its Auth, Storage, or database, or change its global signup settings.
- Git root: `site/`; remote `github` points to `victor-7-ops/sonic-collective`. Baseline `20c8b7f`; working tree clean before this planning document.
- Astro 7.4.5, Zod 4.6.6, TypeScript 6.0.3; static output, no server adapter, auth SDK, frontend framework, database client, or editor installed.
- Existing content collections load artists, performances, clips, and series from JSON. `catalog.ts` filters approved content; `discovery.ts` merges the YouTube snapshot and editorial overrides. Preserve these projections rather than rebuilding the public UI.
- Homepage ordering is partly data-driven in `site.json`, but section composition, navigation, footer, page copy and some metadata are hardcoded. Editing only the JSON files would not satisfy complete nondeveloper control.
- `publicPathSchema`, media manifests and `MediaImage` assume local assets. Storage integration must update their boundary deliberately; never simply accept arbitrary remote URLs.
- GitHub hourly sync validates YouTube metadata and commits only `youtube-snapshot.json`; unreviewed imports currently appear automatically. An inbox must preserve this behavior unless Victor explicitly changes the feed policy.
- Existing operational docs confirm canonical production `https://sonic-collective.vercel.app/`, configured social/contact links, prepared custom analytics gated off, and blank production crew credits. Deployment health and current remote settings were not independently checked in this planning pass.
- Previous chat reported 47 tests and 111 pages; these are historical results, not checks rerun here. No source/script file over 1,000 lines was found in the inspected source and scripts directories.

## 2. Recommended architecture

Use **Supabase Auth + Postgres + Storage and a custom Astro editorial dashboard in this repository**. Keep public routes prerendered. Add the Vercel adapter and opt only `/admin/*`, auth callbacks, `/preview/*`, and authenticated API endpoints into on-demand rendering. Check compatibility with installed Astro 7 before pinning adapter versions.

Astro supports static pages alongside on-demand routes when an adapter is installed: [Astro rendering documentation](https://docs.astro.build/en/guides/on-demand-rendering/). Use `@supabase/supabase-js` and `@supabase/ssr` for validated server sessions and cookies: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Do not add React, an ORM, realtime collaboration, or a separate admin service initially. Astro forms and focused TypeScript interactions cover the requested editor.

| Layer | Responsibility |
|---|---|
| Public static site | Existing components and catalog contracts, generated from one pinned approved release plus one validated YouTube snapshot |
| Authenticated Astro routes | Dashboard, role checks, preview, publishing, invitations and upload authorization |
| Supabase Auth | Invited team identities, recovery and sessions; no public team registration |
| Postgres | Drafts, immutable revisions, review decisions, releases, membership, audit and private submissions |
| Storage | Private originals/drafts; immutable approved public derivatives; no full performance video hosting |
| GitHub Actions + Vercel | Serialized validated releases, build/deployment status, canonical production promotion |

Alternative: a managed editorial CMS reduces custom editor work but adds another content platform and migration path. Supabase matches Victor's preference and provides submissions and team access in one backend, at the cost of building and maintaining the editor. A Git-backed CMS would fit current files but handles private drafts, submissions and team permissions less directly. Neither alternative is selected.

### Data ownership after cutover

1. Supabase is the authority for human-authored editorial content. Git JSON becomes migration input/exports, not a second editable master.
2. The existing hourly GitHub snapshot remains the authority for API-owned YouTube metadata. Do not move this working importer in the first release.
3. Database upload-review records own classification, artist mapping, full-performance links, exclusion and approved editorial overrides. Later API refreshes cannot overwrite them.
4. Each public build consumes an immutable CMS release export validated with the existing Zod and cross-reference rules. No build reads mutable draft tables.
5. Code owns component structure, design tokens, safe block definitions and security rules. Editors own their text, approved media and allowed configuration.

## 3. Data model and invariants

Use stable existing string IDs for migrated catalog entities. Store a separate unique public slug; initially slug equals the current route ID. Never regenerate IDs from edited titles. New IDs can be UUID strings. Keep the two existing series IDs `sessions` and `covers` in the first version.

Keep identity/relationships relational; use versioned, Zod-validated JSONB for editorial revision payloads and discriminated content blocks. Avoid both an unrestricted page-builder blob and dozens of tables for individual text fields. SQL constraints enforce identity, state and permission invariants; release validation enforces the whole referenced content graph.

| Record | Essential fields and rules |
|---|---|
| `team_members` | Auth user ID, owner/editor/contributor role, active flag, inviter, timestamps. Role changes owner-only; cannot remove/demote the last active owner |
| `team_invitations` | Normalized email, intended role, issuer, expiry, revoked/accepted state, Auth invitation reference. One active invitation per email; no plaintext bearer token storage |
| `content_items` | Stable ID, kind, slug, author/assignee, current draft revision, approved revision, archived timestamp. Kind-scoped unique slug; reserved routes protected |
| `content_revisions` | Item ID, monotonic version, schema version, payload JSONB, creator, timestamp. Immutable; restoring creates a new revision |
| `review_requests` | Exact revision, submitted/reviewed by, pending/changes requested/approved state and comment. Editing after approval requires a new approval |
| `content_references` | Revision ID, target item or media ID, usage. Generated transactionally from validated payloads; supports dependency checks and safe deletion |
| `media_assets` | Stable ID, private object path, public derivative paths, hash, real MIME/dimensions/duration/size, uploader, alt/caption/credit, focal point, readiness, rights confirmation |
| `youtube_reviews` | YouTube ID and revisioned editorial payload: format, series, artist IDs, full YouTube ID, excluded/approved, thumbnail asset, reviewer. Never owns API duration/date/availability |
| `releases` | ID, sequential generation, schema version, content hash, exact item/review revision map, immutable export path, requester and time. No drafts or PII in export |
| `deployment_jobs` | Release ID, source commit, snapshot hash, idempotency key, provider run/deployment ID, queued/building/ready/promoting/live/failed/superseded status, sanitized error and retry count |
| `publication_state` | Singleton desired release/generation, verified live release, verified live deployment, last good deployment. Server-managed, never writable by ordinary clients |
| `audit_events` | Actor, action, item/revision/release reference, time and safe summary. Append-only; no tokens, submission bodies or secrets |
| `artist_submissions` | Private contact/name, music URLs, message, consent version/time, review status, reviewer, retention deadline. Not a content revision and never publicly exported |
| `redirects` | Old public path, destination item, creation release. Unique source, no loops, no external/open redirects |

Revision payloads:

- **Artist:** name, aliases, solo/group, biography blocks, portrait asset and contextual alt/crop, approved HTTPS links, SEO. Optional artist-led collection references. Initials remain the fallback when no real portrait exists.
- **Performance/session:** current title/original title/aliases, artist references, series, YouTube ID, poster asset, optional genuine episode/date/duration, editorial note, optional crew credits and share artwork. Empty crew array remains empty until supplied.
- **Clip:** performance reference, approved teaser asset/poster, real dimensions/duration, decorative or interactive use. Preserve silent Rena preview behavior.
- **Series:** existing title and description, image/SEO if supplied. Adding series types requires a future code/schema change rather than silently breaking the enum.
- **Global settings:** brand text/logo assets, navigation/footer entries, collaboration email, social links, default SEO, legal copy and approved homepage selections. Seed actual configured values; brand identity/layout is retained.
- **Page:** route key, title, SEO and ordered typed blocks; Home, About and Privacy supported first. Fixed archive/detail templates expose relevant labels/intros and content fields rather than arbitrary layout internals.
- **Journal story:** slug, supplied title/excerpt/body, actual author attribution if provided, cover/gallery/interview blocks, related artists/performances, publication date chosen by editor. Story type: behind the session, interview or photo essay. Never invent a quote, source story, crew member or image.
- **Artist-led collection:** supplied curator artist(s), title, real curator introduction, ordered performance references and cover. Editorial curation is labeled; no implied popularity ranking.
- **Release calendar entry:** confirmed title, linked artist/performance, source confirmation note (private), start instant, IANA timezone, optional end, premiere/release type, destination link, cancellation/postponement state. Unknown date means draft, not a guessed calendar entry. An actual published video date and a future premiere are separate fields.

Store instants in UTC and retain `Asia/Manila` or the supplied source timezone for display. An unspecified time must use an explicit all-day date model; never turn midnight into a claimed premiere time. Enforce unique YouTube IDs in curated performances, valid references, no self-linking Shorts, at least one usable hero spotlight (maximum four as today), and no draft-only dependencies in a release.

## 4. Team permissions and login

| Action | Owner (Victor plus any explicitly appointed owner) | Editor | Contributor |
|---|---|---|---|
| View editorial dashboard, preview | All | All editorial content | Own/assigned drafts and explicitly shared context |
| Create and edit drafts/media | All | All editorial content | Own/assigned content; cannot reassign ownership |
| Submit for review | Yes | Yes | Yes |
| Approve, publish, unpublish, restore live content | Yes | Yes | No |
| Edit navigation/global/legal settings | Yes | Yes, reviewed through release | No |
| View private artist submissions | Yes | Yes | No |
| Invite, revoke, change roles | Yes | No | No |
| Infrastructure/secrets/billing | External provider access only | No | No |

Default sign-in: invited email plus password with recovery; no public signup button or API-enabled self-registration in the new project. Require MFA for owner/editor publication and membership management; include enrollment, challenge and recovery procedures. Public submissions do not create Auth accounts.

Invitation flow: owner enters email/role → server verifies active owner and recent required assurance → records pending invite → sends provider invitation → recipient completes verified account setup → server matches identity and unexpired invite transactionally → activates membership. Existing Auth accounts still require an explicit membership invitation. Resending/revoking/expired links have clear UI states. Prevent concurrent acceptance and role escalation. Editorial team membership does not grant Supabase organization access.

Configure production SMTP for invitations and recovery: Supabase's default email service is restricted and not production-ready ([official SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)). Sending domain/provider and DNS verification are setup dependencies; the public collaboration Gmail address can remain unchanged.

Enforce permissions at both endpoint and database boundaries. Verify server identity with current documented Auth methods, then query active membership for each sensitive request. Do not trust a decoded cookie, `getSession()` alone, user-editable metadata or stale JWT role claims. Revocation must immediately prevent editorial reads/writes even while an old JWT remains cryptographically valid. Use session revocation for compromised accounts as well.

Enable RLS on every exposed table, restrictive grants, explicit SELECT/INSERT/UPDATE policies and `WITH CHECK`. Membership, approvals, release creation and role changes use narrowly permissioned transactional functions; no broad direct client writes to privileged status fields. Prefer invoker functions. If a privileged function is necessary, keep it internal with a fixed search path, restricted execute grants and explicit identity/role checks. Views must not accidentally bypass RLS ([RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Server-only elevated credentials are limited to Auth invitations and narrowly scoped release/storage operations. Ordinary editing uses the user's scoped session. Build access uses a least-privilege release reader or scoped signed export, not unrestricted draft access. No secrets in `PUBLIC_*`, HTML, browser bundles, logs or preview URLs. Protect cookie-authenticated mutations with same-origin/CSRF checks, safe redirect allowlists, input limits and rate limiting.

## 5. Nondeveloper dashboard and editing workflow

Sidebar: Overview; Pages; Performances; Artists; YouTube inbox; Journal; Collections; Calendar; Media; Submissions; Publishing; Settings; Team (owner only). Hide later modules until implemented, not placeholder actions that fail.

Overview shows drafts awaiting review, new uploads, validation problems and a prominent live-release card. Use human labels such as “Waiting for review” and “Published, deployment failed.” Never show “Live” because a database write succeeded.

Each content list supports title search, status/type filters and last editor/time. Forms have clear field labels, inline validation, genuine media previews, relationship pickers, save state and a sticky Save / Preview / Submit or Publish action area. Required data is explicit. Do not expose raw JSON, SQL, environment variables or arbitrary CSS/HTML/JavaScript.

Start with explicit Save rather than complex autosave. Preserve unsaved form data during validation errors and warn before leaving. Update with expected revision/version: concurrent saves produce a recoverable conflict with reload/compare/copy options; never silently overwrite another editor. Image uploads can complete independently, but cannot auto-publish an unsaved content record.

Workflow: Draft → In review → Changes requested or Approved revision → Included in release → Deploying → Live. A new draft can coexist with the previous live revision. Approval attaches to one immutable revision. Editors may approve their own work initially; no unrequested mandatory two-person workflow. Contributors cannot approve their own or anyone else's work.

Revision history displays who changed what and when, plus field-level comparison. Restore makes a new draft from the selected revision; publish remains explicit. Archive is reversible and warns about all references; hard deletion is blocked while retained revisions/releases or live pages reference an item. Unpublishing is a new release, with a destination redirect or intentional 404/410 decision shown before publication.

### Page composition

Block palette: existing spotlight hero, Rena teaser, featured performance rail/grid, artist strip, latest uploads, approved Shorts rail, community picks, rich text, image/gallery, journal rail, collection rail, calendar list and closing call to action. Each type has a strict schema, safe defaults and allowed page locations. Keep hero at the top; reorder/hide eligible body sections. Retain at least one primary heading and a usable navigation/main/footer structure.

Controls: labeled section cards, add, edit, show/hide, move up/down, optional drag handle, remove with undo before save. Keyboard and touch controls must do everything drag-and-drop can do. Visibility affects rendering; it is never an access-control mechanism for secrets.

Text editor: start with structured paragraph, heading, list, quote (with real attribution), link, image and interview Q&A blocks. Reuse one editor across pages and stories. Escape text, allowlist URL schemes, disallow executable embeds and render structured data through trusted components. Add a richer installed editor only if these controls prove inadequate during a real editorial trial.

Homepage selectors preserve four maximum spotlights, seven-second rotation, pause/arrows, reduced motion and `media-coordinator` playback suppression. Editors change content/order, not the approved cream condensed headline, forest-green/mint identity or playback timing. Keep responsive portrait framing and no unsolicited audio.

## 6. Private preview

Static pages cannot securely display private drafts. `/preview/[kind]/[id]/` is on-demand, authenticated and authorized for the requested exact revision. No public bearer preview links in the first version; invited reviewers sign in.

Preview reuses the same public content components and normalized catalog shapes, with an isolated revision-aware data loader. Build a candidate graph from the live release plus selected draft/dependencies and list included unpublished dependencies. A contributor cannot use preview expansion to read another contributor's private draft.

Use a preview-specific shell: persistent “Draft preview” bar, desktop/phone viewport toggle, back-to-editor link, no analytics, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, no sitemap inclusion and no public feed output. Shared public `BaseLayout` currently enables production indexing/analytics by environment, so preview must override those behaviors explicitly. Robots tags supplement authentication; they do not protect content.

Private media uses authenticated reads or short-lived signed URLs. Preview expiry or access loss returns a clear sign-in/permission state. Never serialize drafts into static HTML, JavaScript props, public API responses, build artifacts or source maps.

## 7. Publishing and deployment correctness

Choose a single serialized GitHub publication workflow for CMS releases and production source/snapshot updates. Do not let independent automatic Vercel Git promotions race CMS publication. During cutover, route production promotion through this workflow; retain normal protected code previews. Existing hourly sync still commits its validated snapshot but production deployment joins the same queue.

1. Server authorizes publisher, validates exact approved revisions and their graph, media readiness, slugs, SEO and redirects. In one transaction it creates immutable release/export metadata, records audit and updates desired generation. Export only approved public fields.
2. Stage sanitized image/video derivatives for referenced assets under immutable paths. Release cannot become deployable until every required derivative is verified. Draft originals remain private; staged public derivatives become accessible, so the Publish action must clearly authorize their public exposure even before the page deployment completes.
3. Record a durable pending deployment job before triggering GitHub. The dispatch carries release/job identifiers, never content or secrets. If dispatch fails, the job stays retryable. Use a small scheduled reconciliation step in the same existing runner to recover undelivered jobs; do not rely on unawaited serverless background promises.
4. Workflow concurrency serializes production jobs. Pin source SHA, desired CMS release ID and complete validated YouTube snapshot hash once per build. Fetch the immutable export once and validate its hash/schema; all pages use that same version. Include `content-release.json` with only release ID, source SHA and snapshot hash for reconciliation.
5. Run existing meaningful tests/check/build and new release validation. Deploy to a protected candidate URL without assigning the production alias. Verify routes, assets and marker. A build hook alone does not prove success; deploy hooks initiate builds ([Vercel documentation](https://vercel.com/docs/deploy-hooks)). Prefer an authenticated workflow with explicit deployment IDs for this pipeline.
6. Before promotion, re-read desired generation. Superseded candidates must not promote. Serialize release mutation/promotion coordination so a late callback cannot mark an older release live; if desired changes during promotion, immediately queue the newer generation and reconcile actual alias state.
7. Promote verified candidate, check the canonical URL and release marker, then transactionally record verified live and last-good deployment. Signed/verified provider events or authenticated runner callbacks update status; periodic reconciliation handles missing callbacks. Ignore repeated/out-of-order transitions using job ID and generation.
8. A failed job preserves the current live alias and content. Show sanitized failure, retained release and Retry. Idempotency key prevents double-click duplicate releases; retry attempts reuse the immutable content release. Never rebuild a failed release by reading today's mutable drafts.

“Approved,” “queued,” and “live” are separate facts. On partial provider/API failure show “Verifying deployment,” not a false success. New release requests may queue while an earlier release builds. Limit build churn by batching selected approved changes into a release, without imposing a new approval workflow on every keystroke.

Rollback has two paths: restore an existing verified deployment for an urgent incident, then reconcile desired/live pointers; or create a new release from a previous content map. Do not roll back database migrations or delete revisions to undo content. Preserve old media derivatives for retained releases. Static withdrawal and public-media revocation are not instantaneous: page caches, old deployment URLs and copied assets may remain accessible. Keep sensitive/private material out of published releases entirely.

## 8. Media management

Use a private originals/drafts bucket and a separate public approved-derivatives bucket. Public bucket downloads bypass read controls; private buckets support controlled download and signed URLs ([Storage access models](https://supabase.com/docs/guides/storage/buckets/fundamentals)). Do not put embargoed originals in the public bucket.

Proposed application limits, subject to real sample validation: JPEG/PNG/WebP originals up to 15 MB; MP4/WebM teaser up to 25 MB and 15 seconds. Prefer optimized teasers around 1–3 MB where quality permits. Full performances stay on YouTube. No SVG, arbitrary HTML, archives, or visitor-uploaded files in the first version. Reject mismatched file signatures, malformed dimensions, decompression extremes and unsupported codecs; server-validated metadata determines readiness, not the browser's MIME claim.

Authorize uploads to generated immutable asset paths, finalize with server-side validation, record checksums and strip unwanted image metadata. Use existing Sharp tooling for variants; do not add an automatic video transcoding service initially. Video preparation uses the current reviewed-media process and rejects unsupported outputs with a useful message. Cropping records normalized focal points and contextual alt text. Credits and rights must come from supplied material, never generated names.

Media library shows processing/error/ready state, alt/caption/crop, upload size and “used by” references. Replacing means a new asset version, preserving old revisions. Delete checks live release, queued releases and retained revisions, then archives first. A later retention cleanup may remove genuinely unreferenced assets; no automatic aggressive deletion in the initial version. Explain that an already issued signed URL remains valid until expiry.

Set bucket and server limits consistently. Track stored originals, derived variants, teaser transfer and build frequency. Do not quote a plan cost until the actual organization/plan and current pricing are checked. Establish a monthly budget and provider spending controls before enabling unrestricted uploads. Export media with the database; a database backup alone does not restore Storage objects.

## 9. Public additions

| Surface | User journey and acceptance |
|---|---|
| `/journal/`, `/journal/[slug]/` | Public editorial index and actual supplied stories; type filters only once enough content exists; related artist/session links, genuine captions/credits, accessible galleries. Private editor remains `/admin/` |
| `/collections/`, `/collections/[slug]/` | Artist-led introduction and ordered existing performances, named real curator, clear curation label; artist detail links to their collections |
| `/calendar/` | Confirmed premieres/releases in a simple upcoming list grouped by month, accessible on phones; local timezone label, exact destination and cancelled/postponed states; no empty invented schedule |
| Calendar links | Download `.ics` and Google Calendar link per confirmed event; stable UID, correct UTC/TZ or all-day semantics, escaped text, updated sequence/time and cancellation handling. Downloaded events do not auto-update; state that plainly |
| `/submit/` | Artist/music links, name/contact, short message, explicit permission/consent and privacy notice; success acknowledgement; no promise of acceptance or publication |
| Session sharing | Per-performance 1200×630 share artwork from real approved image and title/artist, generated with existing Sharp where feasible; manual approved upload override; canonical session URL, OG/Twitter metadata and useful image alt |

Calendar publication is not scheduled content publishing. Initial release displays confirmed future events; automated timed publishing is a separate later requirement if requested. Do not invent premiere dates from YouTube titles or claim video availability before confirmation.

Public submissions use a dedicated server endpoint with strict size/URL validation, honeypot, rate limits and configurable verified CAPTCHA when abuse requires it. No anonymous table read/write grants; endpoint performs only validated submission insertion and returns a neutral receipt. Never fetch arbitrary supplied URLs server-side. Keep submissions out of public logs/analytics. Editors triage new/contacted/accepted/declined/spam and explicitly create a sanitized draft if accepted; contact details never copy into public content by default. Proposed retention: 90 days for closed submissions, with owner-approved exceptions. Confirm retention/copy before enabling collection and update Privacy accordingly.

Preserve all existing routes, filters, legacy watch redirects, Shorts-to-full mappings and supplied contact/socials. New navigation entries go live only with useful published content. Empty modules are hidden or show an honest planned-content state; no fabricated stories, artists, credits or dates.

## 10. Migration, cutover and recovery

1. Confirm separate project organization, budget and region; recommend Singapore as a candidate near the current audience, not an account creation decision. Create only after implementation authorization and cost confirmation where required. Use local Supabase for schema development; no paid branch assumption.
2. Export all current JSON, media manifest, legacy routes and current route inventory at a recorded SHA. Preserve source assets and hashes. Write an idempotent dry-run importer using existing schemas and `validate-catalog` rules.
3. Seed stable IDs/current slugs, approved revisions representing today's public content, site settings and reviewed YouTube overrides. Preserve community picks as explicitly external items. Keep absent fields absent. Do not import API-owned metadata as editable fields.
4. Generate a baseline release from seeded data. Compare normalized catalog, every route, metadata, relationships, media URL/crop and visible copy against the file-backed baseline. Counts alone are insufficient. Current local asset paths may remain as supported legacy asset references while new uploads use Storage.
5. Implement preview and adapter paths, checking server function packaging: current discovery loader reads disk via `process.cwd()`, and static collections are not a draft database. Preview loads its own validated data graph; never assume runtime file access works without an explicit packaging test.
6. Ship dashboard privately against the new backend. Run a real editorial rehearsal: contributor draft → editor review → protected preview → release candidate → verified live → rollback. Team edits must not require GitHub or Vercel accounts.
7. Briefly freeze manual editorial JSON changes for cutover, import final delta and record reconciliation results. Switch release loader and production promotion authority together. Keep hourly snapshot sync operational and test a sync arriving during a CMS release.
8. Retain the old file-backed build/deployment and exports for recovery. If cutover fails, restore last good deployment and file-backed source configuration; retain new database work for reconciliation rather than deleting it. Never alternate between two writers without an explicit source-of-truth decision.
9. Document owner-run export/restore: content/revision/release JSON with schema versions, migrations, private submission backup under separate access, and Storage objects plus manifest. Test restore to local/staging. Choose production backup/PITR policy after checking the selected plan; do not assume Storage bytes are included.

## 11. Implementation packets and dependencies

Each packet should be a focused PR with input contracts, changed files, validation evidence and a handoff note. Do not ask an affordable implementation model to build all modules in one prompt. No package upgrades unrelated to the packet.

| Packet | Depends on | Scope and likely files | Acceptance gate |
|---|---|---|---|
| A. Backend contract and account setup | Project/org/budget confirmation | `supabase/` local config/migrations, generated DB types, `.env.example`, account runbook; initial revision/media/member policies | New backend isolated from Danes; local migration reset succeeds; role/RLS matrix fails closed |
| B. Auth and private shell | A | `astro.config.mjs`, pinned adapter/SDKs and lockfile; `src/middleware.ts`, server Supabase helpers, `/admin/`, auth routes, invitation/recovery/MFA flows | No uninvited access; active membership checked; recovery works; public static output remains correct |
| C. Migration and release loader | A | `scripts/import-editorial.ts`, release exporter/schema; `src/lib/catalog.ts`, `discovery.ts`, `schemas.ts`, `content.config.ts`; output validators | Dry-run/import repeat safely; baseline public graph/routes/media match; offline static build consumes a pinned export |
| D. Core editing and media | B,C | `src/components/admin/*`, content endpoints, artist/performance forms, media authorization/finalization, revision/conflict handling | Nondeveloper can edit supplied data/media; errors preserve input; concurrent edits cannot overwrite silently |
| E. Pages, settings, preview and review | D | typed blocks/renderers, `/preview/*`, Home/About/Privacy, Header/Footer/BaseLayout, `siteConfigSchema`, review/history UI | All requested text/nav/footer/SEO and allowed sections editable; private preview never leaks or indexes; approval binds revision |
| F. Publishing and rollback | E | authenticated publish/retry endpoints, release job state, `.github/workflows/publish.yml`, existing sync integration, release marker and reconciliation | Duplicate requests safe; stale candidate cannot replace newer live release; failed build preserves last good; rollback rehearsed |
| G. YouTube review inbox | D,F | inbox UI, review revision mapping, `merge-catalog.ts` adapter, preserve `sync-youtube.ts` safety, feed/output validator updates | New/changed/missing uploads visible; editorial edits survive sync; 30 supplied Shorts mappings migrate without drift |
| H. Journal and collections | E,F | typed story/collection forms, new public routes, related-link integration, sitemap and metadata | Real approved content only; drafts absent from output; mobile galleries and ordered collection playback work |
| I. Calendar and share artwork | H | event schema/forms/routes/ICS endpoint or static files; image generation script; BaseLayout metadata | Timezone/all-day/cancel tests pass; artwork uses real assets; all published performance routes have usable share metadata |
| J. Submissions | B,F | public form/API, private triage, retention tooling and Privacy copy | Abuse/validation tests pass; no anonymous reads or Auth creation; contact PII absent from release/export/analytics |
| K. Operational handoff | All enabled packets | `docs/editorial-guide.md`, publishing/backup/incident runbooks, external setup checklist | Victor and an invited nondeveloper complete full workflow; restore and production/mobile checks recorded |

CMS milestone = A–G plus core operational handoff. Public additions = H–J with their own content readiness gates. This sequences the full scope without pretending unfinished modules are already delivered. E/F must be complete before editors are told they can independently publish.

## 12. Meaningful verification

- Run the project's supported Node runtime (`scripts/use-runtime.ps1`), `npm run check`, `npm test`, and `npm run build` for implementation packets touching source. Adapt `validate-build.ts` and `validate-output.mjs`, which currently read JSON directly, to validate the same pinned release as the app.
- Unit/constraint tests: invalid references/slugs, duplicate IDs/video IDs, missing alt, block constraints, unsafe URLs, exact-revision approval, concurrent-save conflicts, Shorts mapping, timezone/calendar escaping and cancellation, release hash mismatch and no mixed-revision builds.
- Auth/RLS integration tests against local Supabase: anonymous, authenticated nonmember, revoked user with old JWT, contributor A/B, editor and owner. Attempt direct REST/RPC escalation, global-settings mutation, invitation reuse, draft read, media signing and submission access. Test UPDATE read policy and `WITH CHECK`, not only successful SELECT.
- Publishing failure tests: dispatch lost after DB commit, double-click, worker retry, missing asset, invalid snapshot, failed build, missing/out-of-order callback, expired export URL, overlapping hourly sync, release superseded during build and promotion uncertainty. Verify actual alias/marker before status claims.
- Leak checks: draft canary absent from generated HTML/JSON/JS/sitemap/feed/source maps; private preview response has no shared cache; draft signed URLs expire; no server secret in browser output; no private submission fields in public release or analytics.
- Media tests: unauthorized paths, disguised MIME, oversized/corrupt images/video, reference-aware delete, replaced image still available for rollback, draft-private versus approved public derivative behavior.
- Browser flows at 320/390/430/768/1440 px, real iPhone Safari when available: login/invite/recovery/MFA, phone section reorder, crop/upload error, draft save/review/preview/publish/status/retry/rollback; keyboard and screen-reader labels/focus. Clearly distinguish emulated viewport checks from physical-device checks.
- Public regression: no horizontal overflow, correct portrait crop, seven-second spotlight controls, pause during playback, no Rena resume prompt, one active player, reduced motion, blocked YouTube fallback, Shorts → full performance → artist, canonical links, journal/gallery, collection ordering, calendar and submission success/error states.
- Measure public network/runtime changes against baseline; admin SDKs must not become public-page bundles. No fabricated accessibility or performance scores.
- Run database security advisors after migrations; report remaining findings with remediation links. Before finishing a PR-sized implementation, tell Victor to invoke `$thermo-nuclear-code-quality-review` himself. Do not invoke it automatically. Thermos parallel reviewers run only if he explicitly labels the scoped change medium-risk. Flag any encountered changed/reviewed file over 1,000 lines with its actual line count.

## 13. External setup and unresolved decisions

Required before cloud implementation: confirm destination organization and project budget; create separate project and record ref; production/staging environment separation; approved email sender/domain and SMTP; exact Auth redirect origins; bootstrap Victor's owner membership; MFA recovery; least-privilege GitHub/Vercel publishing credentials and webhook verification; Storage limits/CORS; backup/retention policy; actual approved stories/photos/events/credits.

Use the existing Vercel project/team after verifying IDs, not a new Sites deployment or stale immutable deployment URL. Configure server secrets privately. Do not ask for credentials in chat. Do not add scheduled reminders. Custom analytics stays disabled until Victor confirms the Pro upgrade here; then enable the prepared production flag and redeploy/verify in that later task.

Proposed defaults needing editorial trial rather than blocking this plan: editor may publish; contributors own/assigned drafts only; invitation plus password login; MFA on publishing roles; explicit Save; no guest preview links; confirmed calendar list; link-only submissions; 90-day closed-submission retention. These are proposals, not provider settings already applied.

Current Supabase changelog was checked. CLI v3 changes target/confirmation behavior; pin the tested CLI and inspect `--help` rather than copying older remote flags ([CLI v3 change](https://supabase.com/changelog/supabase-cli-v3)). Modern Node/browser clients should be tested against supported TLS; outdated TLS ciphers are scheduled for removal from project APIs ([TLS notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)). Recheck versions and docs at implementation time.

No pricing, SMTP deliverability, new-project eligibility, live deployment settings, Auth configuration, physical iPhone behavior, production backup restoration or CMS implementation has been verified. The separate Sonic project does not yet exist in the accessible project inventory. Biggest implementation risks are draft/media leakage, role escalation, conflicting production promotion paths, and migration drift; the release and verification gates above address them explicitly.
