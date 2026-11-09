## Transfer checkpoint — November 9, 2026

Latest verified local state: **101 tests pass; Astro check 143 files with zero errors/warnings/hints; default Vercel build validates 111 HTML pages and all 111 required routes**. Community picks are now editable in the site record with bounded rows and HTTPS/ID validation, preserving repository defaults for legacy site revisions. Preview dependency tests now cover explicitly supplied artist drafts and RLS-scoped item-bound revision lookup. Restore history TypeScript issue fixed.

Still incomplete: public use of uploaded media and asset entries in immutable release artifacts, revision diff/provenance and YouTube editorial inbox depth, real SMTP/invitation and hosted upload exercise, backups/restore drill, physical-device acceptance, existing Vercel project access, deployment/live marker/rollback. No production deployment was done. Do not claim CMS completion.

See [Claude handoff](CLAUDE-HANDOFF.md) for project/access details. The uncommitted project batch is ready for the handoff commit; next agent should inspect commit, read this file and CLAUDE-HANDOFF.md, then resume the open items above. Victor should run `$thermo-nuclear-code-quality-review` on this new batch before merging/deploying.

# CMS completeness — execution plan

Current checkpoint (November 6, 2026): see [Claude handoff](CLAUDE-HANDOFF.md#current-verified-checkpoint--november-6-2026) for authoritative status. Archive/team/invitations/private media/release export and optional artifact builds are implemented, with 98 passing tests, clean 141-file Astro check and 111-route builds. This is not CMS completion or deployment. Public asset integration, remaining contracts/revision workflows, operational rehearsals and existing Vercel access remain open. Earlier checkpoint descriptions below are historical. This new batch has not received the standalone quality review.

November 6, 2026. Authorized by Victor: plan CMS completeness, then execute using a lower-cost model. Implementation starts with GPT-6 Luna; checkpoints and verified results must be recorded here and in CLAUDE-HANDOFF.md. Do not claim the whole CMS is complete after one packet passes.

## Outcome and scope

Victor and invited team members can manage the existing website without editing source: create content, manage permitted references/media, preview, review and recover revisions. Owners can manage the team safely. Approved content can subsequently be packaged into an exact validated release, deployed, verified and rolled back through the existing hosting project.

CMS completeness includes audit items C01–C10, B01–B06/B09, A01–A07/A09/A11, E02–E04 and D07 where they affect the editorial journey. Security/operations items remain explicit launch gates. Journal, collections, calendar, visitor submissions, custom analytics upgrades and a general-purpose page builder are excluded; they are separate product work. Missing real biographies/credits/photos must not be fabricated.

Baseline: uncommitted working tree; Astro 7, Supabase SSR/client and Vercel adapter installed. Current tests 60 passing, check clean, 111 public pages build. Four foundation tables, immutable history and save/review RPCs already exist. Reuse these. Public source remains repository files until deliberate release cutover. Never use the unrelated Danes project.

## Execution rules

- Read AGENTS.md/RTK.md if present and follow Ponytail. Keep patches small, complete and readable. No new framework, ORM, dependency, generalized repository layer or realtime collaboration by default.
- Worker owns its assigned packet's source/tests/docs; it is not alone in the codebase and must preserve others' edits. Do not reset/clean/stash existing work. Do not commit or push unless requested separately.
- Do not create a replacement Vercel project, upgrade plans, purchase resources, expose drafts, loosen RLS or use user_metadata as authorization. No passwords or tokens in chat/logs. Password/credential changes require user entry.
- Apply new migrations forward; do not rewrite already-applied migration history. First test locally with PGlite; hosted schema application requires verifying the Sonic project and its current schema, then regenerating types and checking advisors. Do not assume a connector is available to a delegated worker.
- Use existing origin/body/cache/security checks for every new mutation. Maintain optimistic versions, same-item revision binding, immutable records, current membership and database role/MFA enforcement. Application schemas and full graph validation are mandatory at publication boundaries.
- Run Astro check and build sequentially to avoid .astro cache collisions. Full tests at packet completion; repeat only when edits/failures justify it. No cloud writes for tests without safe dedicated identities/data.
- For each packet: implement vertical UI→server→SQL where necessary, test acceptance, document actual status/blockers and stop at a coherent checkpoint. Passing tests for one packet is not approval of later packets. Pause only the dependent cloud operation when access is missing; continue authorized local work.
- Before a PR-sized finish remind Victor to run the standalone code-quality review himself; a prior invocation covered its earlier snapshot, not automatic approval of new code. No Thermos unless explicitly labeled medium-risk. Flag any reviewed file >1,000 lines; current generated lockfile is 6,206.

## Packet 0 — close known editor correctness issues

Dependencies: none. First worker assignment.

1. Fix YouTube review series form's three-state contract: inherited/automatic (`undefined`), explicitly unclassified (`null`), and selected series. Existing absent/null values must round-trip without changing API-owned classification accidentally. Use meaningful labels; preserve current record metadata.
2. Fix performance preview sharing: hide public copy-link control in private preview or pass an explicit public URL. Never copy a revisionless `/preview/` URL. Public sharing behavior remains functional.
3. Check unsaved transitions for save/review/restore and picker-only mutation. Preserve explicit save; prevent accidental loss on conflicting action without inventing autosave. Fix only demonstrated gaps and test meaningful cases.
4. Update audit items C07/D07 and handoff with exact results; retain original findings as history.

Acceptance: tests for undefined/null/selected series round trip and merge behavior; preview/public share behavior; no unwanted API-owned metadata changes; tests/check/build pass; no content/cloud mutations needed. Existing 111 routes remain unless a documented feed change explains otherwise.

## Packet 1 — define full editable contracts and improve navigation

Dependencies: 0. No deployment cutover.

1. Inventory every visible existing website field: source, schema, editor, preview, release mapping. Include homepage hero/teaser and ordered sections, featured artists/performances/covers, About copy, series descriptions, navigation labels/allowed destinations, footer/social/contact, community picks and default/per-page SEO. Expose only controls that actually render.
2. Extend existing versioned site payload or typed content kinds only where needed. Use constrained fields/blocks, HTTPS destinations and fixed component types. Never arbitrary HTML/script/embed URLs. Keep layout/code/design tokens developer-owned.
3. Plan migration compatibility before changing site schema: existing revision schema_version=1, strict old JSON and runtime fallbacks must remain readable. Use explicit upgrade adapters if necessary; do not silently strip historical content or rewrite immutable revisions.
4. Library: readable names, search, kind/status filters and pagination; database counts separate from paginated rows. Contributors see only permitted records. Preserve selected references hidden by RLS without exposing others' drafts.

Acceptance: checked inventory has no unexplained hardcoded user-editable field; existing content renders identically before edits; large catalog pagination/counts tested; invalid URLs/blocks rejected; error/empty/loading states usable on phone and keyboard. If work is large, complete inventory+library first, then type families one at a time, each with preview/render/validation.

## Packet 2 — content creation and safe archive

Dependencies: 1 contracts; may start basic artist/performance creation before global settings completion.

1. Add role-aware create actions for artists and performances, using stable IDs that do not change with title. Keep two existing series IDs initially. Prevent duplicate IDs and route conflicts; new record remains private until valid publication.
2. Decide required media before creation can publish: allow incomplete private drafts only if represented explicitly and validators understand draft vs release requirements. Otherwise require existing validated assets. Never manufacture approved media placeholders.
3. Add archive state through an additive migration/RPC. Preserve revisions, approvals and audit. Archive is not hard delete and must not break current/retained release references.
4. Preview new records against a validated snapshot; contributor can create only allowed kinds/assignments. Introduce lifecycle safeguards for referenced artists/performances and active homepage picks.

Acceptance: create/edit/reload/preview cycle works; duplicate/concurrent create safe; contributor cannot edit others' records; archive blocks unsafe references or gives an explicit repair path; existing URLs/IDs remain stable; no physical history deletion.

## Packet 3 — team membership and recovery

Dependencies: 0; can precede media. Requires provider capability verification for actual invitations.

1. Owner-only member list, invitation state, role change, activation/deactivation and content assignment. Public/server RPC boundary must enforce authority; owner list policy must not make all team emails public.
2. Last-active-owner invariant enforced transactionally under concurrent role/deactivate requests, not only UI. Audit invitation/role/assignment actions without storing plaintext bearer credentials.
3. Auth invitation sending remains server-only; if a privileged Auth operation needs unavailable server credentials, finish safe UI/contracts/tests and document exact configuration blocker. Never put service-role key in browser/public build or ask for it in chat.
4. Rehearse contributor→editor permissions, revoked session behavior, invitation expiry/reuse, password recovery and owner/MFA loss recovery with safe identities. Configure exact production Auth callbacks and SMTP only when target exists and user is entering credentials privately.

Acceptance: owner/editor/contributor/nonmember and last-owner race tests; revoked membership takes effect on next request/RPC; pending invitation cannot grant unintended role; clear recoverable errors; recovery procedure documented with responsible owner. Do not assume single-owner happy path proves team readiness.

## Packet 4 — validated media workflow

Dependencies: 1 contracts, 2 reference lifecycle, 3 roles. Start with images; video uses current prepared-media workflow until equivalent validation exists.

1. Implement asset records and reference tracking; private originals/drafts, immutable approved derivatives. Generated paths/checksums; status uploaded/processing/ready/failed/archived. Signed upload/finalization must authorize exact asset and owner.
2. Validate actual file signatures, dimensions, byte limits and decoded pixel limits. Use existing Sharp for image derivatives/metadata stripping. Do not accept browser MIME alone, SVG/HTML/arbitrary remote paths, unbounded decompression or full-performance uploads.
3. Asset picker, alt text, focal point/context preview and replace-as-new-version. Preserve old derivatives referenced by drafts or retained releases. Connect MediaImage/publicPath/manifest validators deliberately; don't sprinkle remote URL exceptions.
4. Safe archive/removal checks all draft/approved/release references. No destructive cleanup by default. Storage bucket policies and server limits must agree; cross-owner writes and guessed paths denied.

Acceptance: malformed/oversized/fake-MIME/unreferenced/duplicate cases; contributor ownership; failed finalization safe; image renders public and preview identically; retained revision survives replacement; no private original becomes public before approval; storage API checks and documented budget/retention. No plan upgrade authorized.

## Packet 5 — review, history and exact preview

Dependencies: 1–4 relevant contracts. Retain existing approval role/MFA checks.

1. Paginated history, readable diff, reviewer comments if required for requested changes, and visible audit/provenance. Restore records source revision explicitly and creates new draft with optimistic version.
2. Complete YouTube inbox: API data read-only, editorial classification/artist mapping/exclusion and exact Short→full relationship editable with validated choices. API sync cannot overwrite human decisions. Preserve current automatic import policy unless Victor changes it.
3. Build one snapshot assembler reused by exact release preview/export/build validation. Preview a selected revision or approved map with the same public components; support new pages/settings/series/reviews as applicable. No draft prerender or unauthenticated share URL.
4. Clearly label draft/review/approved/live as different facts. Display stale conflicts/actionable errors without dropping input. Avoid exposing submit/approve operations that silently publish unsaved fields.

Acceptance: same-item/revision access tested, contributor isolation, invalid graph/media rejects preview/release, approved revision stable despite later draft, restore provenance, all editable types preview meaningfully, no analytics/noindex/no-store for private routes.

## Packet 6 — validated release and production publishing

Dependencies: 5 plus verified Vercel access. Local release implementation may proceed while provider access is blocked.

1. Add immutable release records containing exact approved revision map, schema version, content/asset hashes, creator/time and idempotency key. Require current publisher role and AAL2; row locks or equivalent compare expected revision map before preparation. Never trust caller-supplied unvalidated approval JSON.
2. Export a strict artifact with no private identities/secrets and validate all payloads, references, asset readiness and public URL uniqueness. Build uses one pinned artifact and one pinned API snapshot. Both output validators consume the same data; repository JSON stays migration input/fallback until verified cutover.
3. Serialize production promotion with existing hourly YouTube job; retries idempotent and stale builds cannot overwrite newer desired release. Status preparing/queued/building/verifying/live/failed distinguishes provider acceptance from verified live content.
4. Use existing Vercel project only. Configure server env/production callbacks, deploy protected admin routes, inspect output/headers and verify live release marker/hash/commit. Replace stale `.openai/hosting.json` path/target guidance intentionally. No public success claim until live marker and health agree.
5. Roll back to known-good deployment and create a new auditable release from previous content map; preserve database revisions and retained media. Reconcile desired/live after urgent rollback.

Acceptance: stale approvals/idempotency/revoked publisher/MFA tests; private payload cannot reach artifact; build/deploy/webhook errors do not show Live; concurrent sync/publish verified; live admin accessible to invited owner only; old known-good site remains on failed build; rollback and verification rehearsed. Provider access absent → explicit blocked deployment step, not a replacement site.

## Packet 7 — operations, privacy and acceptance

Dependencies: preceding capabilities. Incremental CI can start after 0.

1. Add PR/main nonmutating CI (npm ci, content validation, tests, check, build); keep scheduled sync mutation separate. Add release E2E and role-denied/stale cases with safe dedicated accounts.
2. Document clean checkout/environment/migrations/seed setup, exact deployment target, backup/export of DB plus Storage, restore drill, owner/MFA recovery, incident actions and retention policy. Verify hosted advisors/settings, not only local config.
3. Health/freshness checks and actionable failure alerting; no unnecessary periodic updates. Add sync failure expiry-maintenance path without defeating mass-removal guards.
4. Update privacy for actual account/audit/media behavior and support/retention; future visitor submissions remain out of scope. Test production headers/CSP with player requirements and server bundle secret exclusion.
5. Rehearse desktop/mobile keyboard workflows, zoom, focus, errors, permissions, real iPhone/Safari playback/session/share and critical-path performance. No invented audit scores or claims of physical-device testing from viewport emulation.

Acceptance: complete owner setup/invite → contributor draft → preview → editor review/MFA → release → verified live page → rollback → recovery proof. Each gate has dated evidence. Outstanding hosted/physical checks stay marked unverified, with explicit consequences.

## Definition of done

CMS-complete requires all seven implementation packets and acceptance gates, with no unresolved production-critical data-loss, authorization or release defects. Missing optional public expansions do not prevent CMS completion. A local implementation may be complete while deployment is blocked, but must be labeled accordingly. A passed build or unit suite alone never proves production completion.

## Progress log

Final remediation verification November6: **74 tests pass;123-file Astro check zero errors/warnings/hints;111-page/111-route build and both validators pass**. Windows generated-cache lock resolved by stopping local Astro dev watcher for check and restoring it afterward. Both latest review findings fixed locally; no cloud application/deployment/browser check. Archive integration still not complete.

Latest explicit standalone review originally requested changes; **both findings are now fixed locally**. Canonical archive reference traversal validates reactivation for both draft and approved pointers, with committed rejection/state-preservation regressions. Site scalar fields share a definition/mapper/component, keeping hero/teaser independent; no-op and explicit list clearing are covered. Full suite **74 passed**; build and both validators **111 HTML pages/111 routes**,253files. Hosted archive migration/UI/types and multi-session/browser checks remain separate, unfinished work. No cloud write or deployment.

Recovery verification November6: full suite **73 passed**, Astro check **121 files / 0 errors, warnings or hints**, sequential Astro/Vercel build and both output validators **111 HTML pages /111 required routes**,253files. Six earlier type errors resolved. No deployment, hosted migration or browser verification. Packet1 existing-record header/hero controls and Packet2 private creation are now locally built; archive remains a tested local database foundation, not an enabled hosted feature. Generated lockfile remains6206lines.

| Packet | State | Evidence / next action |
|---|---|---|
| 0 Correctness | Complete locally (November 6, 2026) | YouTube series form now preserves inherit (omitted), unclassified (`null`) and selected overrides; merge tests confirm all three. Private performance previews omit Copy page link. Existing dirty-form `beforeunload` guard covers review/restore submits and picker change events; no new browser-level transition test was added because loss was not reproduced. `npm test`: 63 passed; `npm run check`: 114 files, 0 errors/warnings/hints; sequential `npm run build`: 111 HTML pages and 111 required routes valid. No cloud/content mutations. |
| 1 Editable contracts/library | In progress | Library has exact-count DB pagination, stable-ID search, kind/status filters and readable revision labels; readable-name search needs a DB contract. Typed `site.about`, `site.footer`, `site.header`, existing-performance hero selection and existing portrait-teaser selection have editor controls and authenticated home/About previews. Focused selection tests pass 4/4; full suite/check/build for this slice await serialized verification. `docs/CMS-EDITABLE-INVENTORY.md` tracks remaining arbitrary hero media, optional landscape source, header destinations, community-picks and SEO fields. No release mapping or migration. |
| 2 Create/archive | Partial local implementation | Artist/performance private-create route/helper linked from library; canonical validation and existing allowed media/video/reference choices; save revision mapped to item ID for redirect. Local additive archive migration and PGlite role/MFA/reference/history guards implemented, not applied hosted and no archive UI/types integration. New-record preview/release handling remains unfinished. Recovery checkpoint: 73 tests pass, clean check across121files; final build pending below. |
| 3 Team/recovery | Planned | Verify provider/server invitation capability. |
| 4 Media | Planned | Image-only validated path first; no upload policies until ready. |
| 5 Review/preview/inbox | Planned | One exact snapshot assembler, no parallel source of truth. |
| 6 Release/deployment | Planned / external access blocked | Existing Vercel project list empty at last check. |
| 7 Operations/acceptance | Planned | Keep hosted/physical checks explicit. |
