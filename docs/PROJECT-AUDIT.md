# Sonic Collective — whole-project gap audit

Current checkpoint (November 6, 2026): see [Claude handoff](CLAUDE-HANDOFF.md#current-verified-checkpoint--november-6-2026) for authoritative status. Archive/team/invitations/private media/release export and optional artifact builds are implemented, with 98 passing tests, clean 141-file Astro check and 111-route builds. This is not CMS completion or deployment. Public asset integration, remaining contracts/revision workflows, operational rehearsals and existing Vercel access remain open. Earlier checkpoint descriptions below are historical. This new batch has not received the standalone quality review.

November 6, 2026 · Asia/Manila · Current working tree, including untracked CMS source.

**Assessment: the public discovery site works; the CMS is a local editing foundation, not a complete production publishing system. Production CMS readiness: 55/100 (risky/internal beta only).** This is engineering triage, not a certification or a claim that every possible defect has been found. The score reflects missing end-to-end publishing/recovery, not a measured percentage of implemented features. Do not describe the entire project as done because its current unit tests pass.

This report is the current gap index. Earlier verification docs are dated historical checkpoints. The three findings in CODE-QUALITY-REVIEW.md have been remediated; they are not outstanding items here.

Latest remediation: the later archive reactivation bug and site-form duplication review findings are also resolved locally. Canonical reference validation covers both saved pointers on unarchive; settings renderer/mapper share a field contract.74tests and111-route build pass. Archive remains unapplied hosted and without UI/types integration; no production completion claim.

November6 later implementation update: header labels and existing-record hero/teaser controls now implemented; private artist/performance creation added, with canonical validation and correct item redirect. C01 is partially addressed, not complete: new-record preview/public release and archive UI remain missing. Local archive migration/tests are implemented but not applied hosted. 73 tests and clean121-file Astro check pass after integration fixes. Current completeness plan/handoff records the latest build result. No cloud/deployment change; remaining gap rows below retain original audit context.

## What is actually working

- Public homepage, performance archive/search/filtering, artist profiles, authored performance pages and imported watch pages, direct YouTube fallbacks, reviewed Shorts-to-full links, local teasers and motion controls.
- Existing content: 20 artists, 18 authored performances, 11 clips. Last validated build: 111 public HTML pages. No invented crew credits, episodes or biographies required to fill blanks.
- Local member login, recovery handling, password update, authenticator enrollment/verification, role-aware content access, explicit draft save, optimistic concurrency, review/approval, immutable revision history, restore-as-new-draft, and authenticated artist/performance/homepage exact-revision previews.
- SQL/RLS and same-origin mutation protections are implemented. No ordinary direct table writes; approval requires current editor/owner membership and AAL2. These controls must survive future simplification.
- Current local baseline: 60 passing tests, clean Astro check, successful build/output validators. Current audit reran content validation (passed) and production dependency audit (zero known vulnerabilities). No new blanket security guarantee follows from that audit result.

## Status vocabulary and priorities

**Confirmed defect** means the behavior follows from inspected source or a direct check. **Missing** means the planned capability has no implemented path. **Unverified** means evidence is absent; it is not automatically a defect. **Blocked** means an external dependency currently prevents completion. P1 blocks the full production CMS promise; P2 is the next usability/reliability work; P3 is optional expansion or polish. No confirmed P0 data exposure was established by this pass.

## A. Release, deployment and operations

| ID | Priority/status | Gap and impact | Evidence / completion condition |
|---|---|---|---|
| A01 | P1 Missing | Approved CMS revisions do not reach public content. JSON files remain the public source. | `catalog.ts`, `content.config.ts`, admin notice. Complete an exact approved-revision release/export/build path with full schema, graph and asset validation. |
| A02 | P1 Blocked | Existing Vercel project is inaccessible through the connected project inventory. | Latest connector recheck returned `projects: []` for known team. Resolve access to the existing project; do not create a replacement silently. |
| A03 | P1 Confirmed deployment gap | Live `/admin/` returns 404 although local admin works. | Read-only HTTP checks this audit: homepage 200; `/admin/` 404. Deploy and verify the actual server-capable application with correct production environment and callbacks. |
| A04 | P1 Missing | No immutable release records, release selection, artifact hashes or verified desired/live pointers. Approval cannot prove what a deployment contains. | Only four foundation tables and save/review RPCs exist. Add auditable exact revision maps, idempotent preparation, deployment result verification and honest failure states. |
| A05 | P1 Missing | Draft restore exists; deployment rollback does not. No tested production recovery sequence. | No release/rollback routes or deployment workflow. Verify known-good deployment recovery and new release from retained content without mutating history. |
| A06 | P1 Missing | Future CMS publish and hourly YouTube promotion have no shared coordination. | `.github/workflows/youtube-sync.yml` serializes only `youtube-catalog`. Build from one explicit snapshot and serialize final production promotion across both paths. |
| A07 | P1 Unverified | Backup/export and restore of database plus Storage have not been rehearsed. | Setup/handoff record no restoration proof. Document recovery owner, recovery point/time objectives and test restore into a safe destination. Do not assume Free-plan backup coverage. |
| A08 | P2 Confirmed config drift | `.openai/hosting.json` still describes static `dist`, while the adapter produces static `dist/client` plus server functions. | Compare hosting metadata with Astro config. Establish one authoritative deploy target and correct/retire stale hosting metadata before anyone follows it. No claim this file controls current Vercel production. |
| A09 | P2 Missing | No general PR/push CI gate; the only workflow is scheduled/manual YouTube sync. It runs tests/build but not Astro check/content validation. | `.github/workflows/`. Add nonmutating CI for PRs and main, including check/content/test/build; keep sync writes separate. |
| A10 | P2 Missing/unverified | No app-specific alerting, health evidence, deployment smoke tests, incident owner/runbook or freshness alert. | Source/workflow inspection; provider dashboards not inspected. Detect auth outage, failed deploy, stale sync and rollback failure without logging credentials. |
| A11 | P2 Missing | Clean-checkout setup depends on an ignored isolated Windows Node install. No concise root README/runbook for another developer. | `scripts/use-runtime.ps1`, `.local/`, env example. Document supported Node install, npm ci, environment, migrations, seed safety and production adapter output. |
| A12 | P2 Unverified | Scheduled job execution, secret availability and current production commit are not freshly established. | Workflow exists and historical docs say active; existence is not successful execution. Check latest GitHub run and match deployed commit/release. Current CMS changes are uncommitted. |

## B. Security, identity and data boundaries

| ID | Priority/status | Gap and impact | Evidence / completion condition |
|---|---|---|---|
| B01 | P1 Missing release boundary | Direct save RPC permits bounded JSON that has not passed application schemas; approval RPC can approve it. A future publisher must not trust approval alone. | Foundation SQL validates JSON shape/size; `actions.ts` validates normal forms only. Require independent payload and whole-graph validation before release and again during build. This is not an anonymous-write bypass. |
| B02 | P1 Missing | Owner cannot invite/deactivate members, assign records or manage roles through admin. Last-owner protection has no management workflow. | No team routes/RPCs; membership bootstrap was manual. Add safe owner-only management, active-membership enforcement, assignment and last-owner tests. |
| B03 | P1 Unverified | MFA loss recovery and owner lockout recovery are not rehearsed. | Security page instructs contact owner, but owner recovery itself lacks tested procedure. Establish a safe recovery path before relying on approval MFA operationally. |
| B04 | P1 Production setup outstanding | Production/staging Auth origins, redirect allowlists, environment separation and production credentials are not verified. | Last hosted configuration uses localhost; local config does not update hosted settings. Verify exact production callbacks and separate environments before exposing admin. |
| B05 | P2 Unverified | Recovery is implemented but cross-browser, expired-link, reused-link and rate-limit journeys lack complete fresh end-to-end evidence. SMTP deliverability is not production-verified. | Recovery tests mock provider transport; earlier real flow encountered rate limiting. Rehearse using a dedicated account; user enters new passwords privately. |
| B06 | P2 Unverified | Hosted RLS/Auth/Storage contract tests are incomplete; PGlite stubs auth and storage schemas. | `editorial-db.test.ts`. Validate real anonymous, contributor, revoked-member, AAL1/AAL2 and Storage responses using safe test identities. Prior anonymous read-denial checks are useful but not complete. |
| B07 | P2 Missing hardening | No configured application CSP; live homepage response lacked CSP. Editorial headers do protect framing/cache/indexing. | `access.ts`, live response. Introduce a tested policy compatible with YouTube and actual scripts, rather than disabling functionality or claiming CSP alone solves XSS. |
| B08 | P2 Unverified | App has no explicit request throttling beyond provider behavior; production abuse/rate-limit behavior is untested. | Auth routes and middleware; hosted provider limits not freshly inspected. Verify provider limits and add a bounded app layer only where necessary. No load/abuse testing was performed. |
| B09 | P2 Missing privacy coverage | Public privacy copy covers motion, analytics and YouTube, but not editorial accounts, audit retention, recovery contacts or future submissions. | `privacy.astro`, immutable SQL audit/revision tables. Document actual account-data use, retention and support processes before inviting a team; define how immutable audit and erasure requests are handled. |
| B10 | P2 Unverified server artifact check | Output scanner targets public `dist/client`; server-function bundle/config secret boundaries are not independently scanned. | `validate-output.mjs`, Vercel output. Verify runtime-only secrets, excluded files and production server headers. Do not infer a secret leak from missing verification. |

## C. Editorial workflow and content management

| ID | Priority/status | Gap and impact | Evidence / completion condition |
|---|---|---|---|
| C01 | P1 Missing | Editors cannot create/archive artists or performances or manage their lifecycle through the UI. | Content detail/library only. Add stable-ID creation, validated references, permissions, archive/unpublish semantics and conflict handling. Avoid destructive historical deletion. |
| C02 | P1 Missing | No validated media upload/finalization/library/crop/replace/reference-safe deletion. Clips remain read-only. | Empty buckets without client upload policies; forms and setup docs. Preserve the disabled uploads until MIME/signature/dimension/size/rights and reference validation exist. |
| C03 | P1 Partially addressed (November 6, 2026) | Optional typed About/footer/header fields plus homepage performance and portrait teaser selection now cover existing copy and choices. Legacy schema-v1 payloads use defaults matching previous public output; media paths derive from known eligible records. Homepage arbitrary media, header destinations, community picks and SEO remain developer-owned; no release mapping exists. | `schemas.ts`, `site-content.ts`, site editor, `AboutPage.astro`, `SiteFooter.astro`, `SiteHeader.astro`, `HomePage.astro`, `/preview/[id]?view=about`. Focused selection tests pass 4/4; full suite/check/build for this latest slice are pending serialized validation. |
| C04 | P2 Partially addressed (November 6, 2026) | Library now displays draft names, searches stable IDs, filters by kind/status, uses deterministic 25-row database pagination, and requests an independent RLS-scoped exact count. Search currently targets stable IDs; readable-name search needs a denormalized/indexed field decision. Overview still uses a 1,000-row slice. | `admin/content/index.astro`, `admin/index.astro`. Library helper tests cover range boundaries and clamping; full CMS acceptance and large hosted catalog behavior remain unverified. |
| C05 | P2 Missing | Revision history is latest 20 only; no diff, complete history pagination, reviewer comments or audit browsing. Restore records ordinary save rather than source revision provenance. | Editor history query/actions, audit SQL. Add meaningful comparison and source-revision audit before larger team use. |
| C06 | P2 Limited preview | Preview overlays one revision on repository baseline, not the complete pending/approved release. Series/clip/YouTube-review previews and new-page previews are absent. | `preview.ts`, preview route. Make the preview scope explicit; release preview must show the exact release snapshot. Other links currently lead to published pages. |
| C07 | Closed locally (November 6, 2026) | YouTube review form exposes separately labeled automatic classification, unclassified and named series options. Form mapping omits `seriesId` for inherit, writes `null` for unclassified and preserves explicit selections. | `forms.ts`, `admin/content/[id].astro`, `merge-catalog.ts`; regression tests cover form round trip, unrelated metadata preservation and merge semantics. No cloud content was changed. |
| C08 | P2 Missing | YouTube inbox lacks a dedicated new/unreviewed queue, exact full-recording picker and complete attribution/format review. | Review form exposes format/series/excluded/artists, not `fullYoutubeId`. Existing public mappings work but are file-maintained. Add validated Shorts-to-full UI and review status. |
| C09 | P2 Missing workflow | No review notifications, owner/editor rehearsal, safe assignment UI or documented contributor handoff. | No notifications/team routes; current account is owner only. Rehearse contributor → editor → publisher with real permission checks before team rollout. Notifications are optional until needed. |
| C10 | P2 Usability risk | Unsaved edits and saved-revision review are separate forms. Review/restore can navigate away from unsaved fields; browser warning is the principal guard. | Detail page separate POST forms. Test those transitions explicitly and disable/confirm conflicting actions when dirty. Do not claim lost input was reproduced this audit. |

## D. Public experience, accessibility, content and discoverability

| ID | Priority/status | Gap and impact | Evidence / completion condition |
|---|---|---|---|
| D01 | P2 Unverified | No current comprehensive keyboard/screen-reader audit across menu, player dialog, focus return, motion controls and admin pickers/errors. | Existing semantic markup/tests and earlier browser checks are partial evidence. Rehearse keyboard-only flows and screen reader announcements, zoom and contrast; no accessibility score invented. |
| D02 | P2 Unverified | Physical iPhone/Safari playback, sharing, scrolling, motion preferences and session cookies remain unchecked after SSR changes. | 390px desktop-browser emulation passed artist preview; this does not prove iOS behavior. Test at least one physical phone and a second browser. |
| D03 | P2 Missing measurement | No current field Core Web Vitals or repeatable performance budget on live mobile connections. Total packaged output is about 47 MiB, not the same as initial page transfer. | Build output and absence of performance test/config. Measure hero/teaser requests, LCP, CLS and interaction delay before optimizing by guesswork. |
| D04 | P2 Missing | Performance-specific social artwork and full social metadata are incomplete; BaseLayout defaults to one shared performance image. | `BaseLayout.astro`, PerformancePage. Generate approved per-session OG/Twitter image/title/alt using real content; no invented credits or VideoObject fields. |
| D05 | P2 Unverified editorial inputs | Artist bios/portraits/links, production credits, release dates and confirmed episode ordering require supplied/verified material. | Content review and JSON records. Treat missing real inputs as editorial work, not a reason to fabricate filler or block unrelated functionality. |
| D06 | P3 Small SEO gap | Privacy is linked publicly but omitted from sitemap paths; legacy upload routes rely on HTML/JS redirect rather than platform redirect. | `sitemap.xml.ts`, watch route. Decide crawl inclusion and add platform redirects where appropriate; verify canonical/indexability on production. |
| D07 | Closed locally (November 6, 2026) | Private performance previews omit the public Copy page link control. Public performance pages retain existing share behavior. | `PerformancePage.astro`; static build passed 111 public routes. No private preview URL is copied by this control. |

## E. Synchronization, testing and documentation

| ID | Priority/status | Gap and impact | Evidence / completion condition |
|---|---|---|---|
| E01 | P2 Missing failure maintenance | If API sync keeps failing, the workflow exits before expiry maintenance/build. Old static pages/feed can continue serving already-built metadata after input expiry. | Sync workflow invokes live fetch only; `--maintenance` exists but is not scheduled as a failure-safe path. Add verified expiry maintenance/promotion with alerting; retain mass-removal safeguards. This is a code-path risk, not an observed current outage. |
| E02 | P2 Unverified parity | Local discovery prefers ignored `.local/youtube-snapshot.json`, preview bundles repository snapshot, CI uses repo snapshot. Local success may describe a different feed than preview/production. | `discovery.ts`, preview route, workflow. Show snapshot ID/freshness and force one declared source for each release/test. A future release must make this deterministic. |
| E03 | P1 Missing release acceptance tests | No automated complete login → edit → preview → MFA approval → release → deployment verification → rollback journey. | Current tests cover modules/SQL, not a finished publishing path. Build the journey before calling the CMS complete; include denied and stale cases, not just success. |
| E04 | P2 Missing regression coverage | Picker behavior has helper/action tests, but no committed DOM/browser regression for reorder/remove dirty tracking, focus, no-op movement or hidden references. | New test files and manual browser notes. Add a small meaningful UI test using existing tooling when available; do not add a framework solely for trivial assertions. |
| E05 | P2 Confirmed documentation drift | Older plan says Sonic project does not exist; older verification says automation is inactive and counts 10 artists/41 tests. Both are historical, not current state. | Dated planning/verification vs current code/handoff. Keep dated evidence; add current-status pointers and distinguish proposed settings from verified hosted facts. |
| E06 | P2 Unverified operational state | Current provider advisors, SMTP, backup policy, production server config and GitHub run status were not freshly read in this audit. | Local code plus latest known setup only. Recheck provider state before deployment; do not silently promote historical settings to current facts. |

## F. Planned expansions, not launch blockers for the existing site

These were in the broader design, but are separate product work. Their absence is not a defect in the current public archive.

| ID | Priority/status | Expansion | Minimum complete version |
|---|---|---|---|
| F01 | P3 Missing | Journal/story pages | Real supplied story, editor, approved media/credits, related artist/performance links, public index/detail. |
| F02 | P3 Missing | Artist-led collections | Named real curator, introduction and ordered existing recordings with clear curation label. |
| F03 | P3 Missing | Confirmed calendar plus ICS/Google links | Actual confirmed events, correct timezone/cancellation semantics and accessible empty state; not fabricated dates or scheduled publishing. |
| F04 | P3 Missing | Artist submissions | Link-only intake, explicit permission/privacy notice, spam controls, acknowledgment, restricted review and retention/deletion process. |

## Recommended build order

1. **Complete the editor before publishing:** C07/D07 are fixed locally and a first visible-field inventory is recorded in `CMS-EDITABLE-INVENTORY.md`; complete versioned site contracts and preview/release mapping, then build create/archive, team assignment and validated media as needed for Victor's workflow. Improve history only to the scale required.
2. **Make recovery safe:** production Auth/SMTP settings, owner/MFA recovery, hosted policy tests and backup/restore rehearsal.
3. **Build the publishing boundary:** immutable validated release, exact release preview, shared sync/publish coordination, verified deployment status and rollback. Resolve existing Vercel access in parallel; a blocked connector need not block local implementation.
4. **Prove the journey:** repeatable CI plus role-based E2E, production smoke checks, mobile/keyboard/playback checks and failure maintenance. Confirm no drafts/PII/secrets reach public output.
5. **Add public expansions deliberately:** journal/collections/calendar/submissions only with actual content and a clear owner. Keep custom analytics disabled pending Victor's explicit Pro confirmation.

## Evidence and limits

Inspected routes/components, middleware, editorial helpers/action/form contracts, both SQL migrations, schema/catalog/discovery/merge logic, public metadata/privacy, player/share/navigation surfaces, dependency/configuration files, the YouTube workflow/sync/hydration/validators, tests, dated verification and handoff docs. Current Git tree remains uncommitted, including CMS additions. Generated package-lock.json is 6,206 lines (already exceeded 1,000); no reviewed handwritten file crossed that threshold.

Fresh checks: content validator passed (20/18/11); production npm dependency audit reported zero vulnerabilities; live homepage 200, live admin 404, robots 200; live homepage had HSTS and no CSP header. No credentialed production writes, cloud migrations, destructive operations, load tests, third-party code upload, physical-device tests or full penetration test performed. Prior immediately preceding checkpoint supplied 60 passing tests, clean check and 111-page build; these were not redundantly rerun for this documentation-only audit.

Hosted Supabase details and Vercel access are last-known state from setup/handoff and recent connector checks, not freshly certified by this source review. The public HTTP checks do not establish which commit is deployed. Resolve unknowns explicitly instead of treating them as passed.

### November 6, 2026 execution addendum

Packet 0 passed locally: 66 tests in the current full suite, Astro check with 0 errors/warnings/hints across 117 files, and build/output validation for 111 public HTML routes. C10 was inspected: editor input/change marks the form dirty, including the picker’s bubbling change event, and existing `beforeunload` protects separate save/review/restore submissions. No browser-level unsaved-transition case was added because no actual loss was reproduced; retain the usability risk until exercised in a browser. Packet 1 library and initial contracts are partial; About/footer compatibility, round-trip and URL/email tests pass. Homepage/media/header/community/SEO contracts and release mapping remain outstanding. See `CMS-EDITABLE-INVENTORY.md`. No hosted database operation or editorial content mutation was performed.
