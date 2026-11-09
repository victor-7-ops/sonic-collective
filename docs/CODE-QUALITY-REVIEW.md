# Thermo-nuclear code quality review

Current checkpoint (November 6, 2026): see [Claude handoff](CLAUDE-HANDOFF.md#current-verified-checkpoint--november-6-2026) for authoritative status. Archive/team/invitations/private media/release export and optional artifact builds are implemented, with 98 passing tests, clean 141-file Astro check and 111-route builds. This is not CMS completion or deployment. Public asset integration, remaining contracts/revision workflows, operational rehearsals and existing Vercel access remain open. Earlier checkpoint descriptions below are historical. This new batch has not received the standalone quality review.

## Latest review — November 6, after 73-test checkpoint

### Subsequent remediation — both findings fixed locally

P1: the unapplied archive migration now has one `content_references` traversal reused by inbound archive guards, revision insert validation and reactivation. Unarchive checks distinct current draft and approved revisions and locks references before clearing archive state. Committed tests cover draft-only and approved-only stale targets; rejected requests preserve version, archived_at, history and audit. Roles/MFA/optimistic checks remain intact. Hosted application and multi-session testing remain pending.

P2: scalar site settings now use `site-form.ts` definitions shared by `SiteSettingsFields.astro` and the form mapper. The main editor no longer duplicates About/footer/header fields. Hero/teaser selection remains explicit and separate from scalar fields and ordered spotlights. Tests cover legacy and extended no-op round trips, valid/invalid media selections and list preservation. Empty picker submission includes a hidden blank marker so explicit clearing remains distinguishable from omission; this has a regression test.

Verification is recorded in the completeness plan/handoff below once the final build finishes. Original findings are retained as history; they are no longer open code findings. This is remediation, not a claim of independent re-review or production readiness.

Final verification: **74 tests passed**, Astro check **123files /zero diagnostics**, build/output validators **111pages/111routes**. Editor detail page reduced117→85lines; site-form65lines, settings component6physical lines, archive migration142lines. Generated lockfile6206lines remains above threshold. No hosted/browser or multi-session tests performed.

Explicitly requested by Victor's “go run it.” Reviewed the latest About/footer/header/hero controls, create flow, library/CI integration and local archive migration against the standalone rubric. Earlier remediated findings remain below as history. **Verdict: changes requested. Do not apply the archive migration yet.** No application fixes or cloud writes performed during this review.

### P1 — Unarchive bypasses the reference invariant

`supabase/migrations/20261106023243_editorial_archive.sql:115` checks inbound references only when archiving. Outgoing archived-reference checks live separately in the revision-insert trigger at line38. Unarchive at line144 merely clears archived_at; it does not insert a revision or validate the restored draft/approved pointers. A performance can be archived, its now-unreferenced artist archived, then the performance unarchived successfully. The result is an active draft/approved record referencing an archived artist. The normal save path would reject that reference.

**Reproduced locally:** an ignored copy of the existing PGlite test (`.local/archive-review.test.ts`) adds this three-step transition and expects unarchive rejection. It failed with `Missing expected rejection`, demonstrating the current RPC accepts it. This is a new failing regression case; it does not invalidate the earlier 73-test result, which omitted this transition.

Remedy: give current payload shapes one canonical reference traversal/validation boundary. Validate both draft and approved revisions before reactivating a record, with appropriate reference locks and the same checks used for new revisions. Preserve role/MFA/version checks, immutable history and audit. Do not simply remove archive guards. Add the reproduced scenario as a committed regression and cover reactivation through both draft and approved references. Test concurrency separately; the single-session PGlite test is not multi-session evidence.

### P2 — Site editing is becoming a manually duplicated field contract

`src/lib/editorial/forms.ts:60–84` constructs nested About/footer/header objects field by field and now also resolves media references, rewrites spotlight ordering and clears related teaser fields. The corresponding editor independently repeats labels, field names, required/max lengths and object structure. Shared site schemas and defaults form additional copies. The rendering page's current117lines hide large nested markup/branch blocks. This is the same growth pattern the earlier mutation extraction was intended to prevent: every new site field requires coordinated edits in several unrelated representations.

Remedy: isolate site form mapping and hero/teaser normalization from the general artist/performance field loop. Use a small typed site field definition for repeated scalar labels/paths/input limits shared by the renderer and mapper; keep the existing Zod schema authoritative at the trust boundary. Keep ordered reference selection and hero changes explicit rather than hiding extra mutations inside scalar parsing. One focused SiteSettingsFields component can remove the giant site branch from the content page. Do not add a generic page-builder/ORM or weaken validation. Add a no-op round-trip test for a complete legacy site and a complete extended site, proving unrelated fields/order remain unchanged.

### Scope limits and size

- Creation now correctly resolves the save RPC's revision UUID to its item UUID and uses canonical create schemas; the previous six type errors are fixed. Public route IDs are stable. No new high-conviction structural issue flagged in those narrow helpers.
- New-record preview remains intentionally unfinished (`preview.ts` rejects unknown baseline IDs); this is an outstanding product gap, not review approval of a complete creation journey.
- Header/hero controls, CI, library pagination and create source were inspected. No fresh hosted/browser/physical-device verification was performed. Current archive remains local-only with no archive UI/types/hosted application.
- Current changed handwritten files checked: detail page117lines, form mapper84lines, archive migration151lines. None crosses1,000. Generated lockfile6,206lines was already above the threshold; keep generated, no decomposition requested.
- Previous checkpoint:73 tests, clean121-file Astro check,111-route build. This review ran only the focused archive reproduction, which failed as described. Full suite was not redundantly rerun and no passing build is claimed for a future fix.

Resolve these findings and record verification before applying the archive migration or extending more site controls. A new review result does not erase previously recorded completed work.

November 6, 2026. Explicitly requested by Victor. Scope: current uncommitted CMS implementation, including untracked source, SQL, tests, auth routes, admin UI, public component extraction, preview, adapter/configuration and validation changes. Review against the standalone thermo-nuclear-code-quality-review rubric; no Thermos reviewers invoked. Original verdict: **changes requested**. All three findings subsequently addressed below; no independent second review claimed.

## Remediation checkpoint

- Mutation orchestration moved to typed `src/lib/editorial/actions.ts`. Page delegates POST actions and renders outcomes. Validation and optimistic save/restore RPC remain intact. MFA feedback now uses the Supabase assurance-level API, with database enforcement still authoritative; provider prose is no longer parsed. Review conflicts now return 409 explicitly.
- `editorialPickerOptions` preserves absent selected IDs as existing references without widening RLS. Regression test models a visible artist plus an unassigned collaborator and preserves both values and their order.
- Picker emits a bubbling change event after successful add/remove/reorder; no-op moves return without emitting. The existing owning-form guard receives it without picker-specific logic. Browser exercised reorder-only input and a navigation attempt; editor remained open. Browser did not expose a beforeunload dialog through its dialog API, so dialog text itself is not verified.
- 60 tests pass, including action save conflict, item-bound restore, stale review, low-assurance MFA, and relationship preservation. Full build/output validation passes for 111 public pages. Mobile artist preview checked at 390×844 without horizontal overflow; physical iPhone remains unchecked.
- No real drafts, approvals, memberships or cloud schema changed during this checkpoint. Vercel recheck still returns no projects for the existing team; release publishing and deployment rollback remain unfinished.

## Findings

### P2 — Separate content mutation orchestration from page rendering

`src/pages/admin/content/[id].astro:22–47` now dispatches save, restore, submit, approve and request-changes, loads historical payloads, validates content, performs RPC calls, translates provider errors and tracks conflicts inside the rendering page. The same page also loads picker references/history and renders a large type-dependent form. Adding restore has grown a nested action branch; the compressed lines obscure the actual size of this flow. Approval's MFA message is additionally inferred from a provider message substring.

Move the mutation flow into one typed editorial action module with explicit outcomes (redirect, preserved-input validation error, conflict, permission/MFA error). Keep the page responsible for loading/rendering its view. Reuse the existing save RPC and payload validators; do not introduce a generic repository/service hierarchy or remove database authorization. Use a stable database error contract for MFA instead of provider prose when the RPC contract is next revised. Test save/restore stale versions and review failures at this boundary. This removes action branching from the rendering layer and gives route behavior a testable home.

### P1 — Picker option filtering can silently discard existing relationships

`src/pages/admin/content/[id].astro:49–51` obtains options through RLS-visible content items; `src/components/EditorialPicker.astro:8` only renders those options, even for already-selected IDs. Contributors can own a performance without owning every related artist. A selected artist omitted by RLS is rendered as the blank placeholder. `applyEditorialForm` then replaces artistIds with the submitted nonblank values. A simple title edit can therefore lose a collaborator if another visible artist remains, or fail required-artist validation when none remain. The same generic picker loses selections for missing references in other contexts.

Preserve selected IDs absent from the editable option set as explicitly labeled existing references. Do not widen draft-content RLS merely to populate a selector. Keep the full ordered relationship value intact on a no-op submission and test an assigned performance with an unassigned co-artist. If a separate reference catalog is introduced later, give it its own deliberately limited contract.

### P2 — Picker DOM mutations bypass unsaved-change tracking

`src/components/EditorialPicker.astro:18–21` adds/removes/reorders rows programmatically, while the editor's beforeunload guard (`src/pages/admin/content/[id].astro:85`) only observes input/change events. Those DOM mutations do not emit either event. An editor who only reorders or removes homepage picks can leave the page without the intended unsaved-change warning.

Have the picker emit one bubbling change event after a successful value/order mutation so the owning form uses the same dirty-state contract as native fields. Test remove and reorder without typing, plus a failed/no-op movement. Keep this behavior inside the picker; do not add picker-specific event branches to the editor.

## Size, design and validation assessment

- Generated `package-lock.json`: 6,206 lines, already above 1,000 before this change. Generated lockfiles should remain generated; no decomposition proposed. No reviewed handwritten file crosses the 1,000-line threshold. Low physical line counts do not excuse dense multi-operation lines.
- Shared public page components are a useful reuse boundary for previews; avoid creating a second public renderer.
- Database row locks, immutable revisions, composite revision/item foreign keys and current-membership checks should be retained during simplification. Related save/approval changes are transactional; no recommendation to move them into sequential client writes.
- Existing content validators, schemas and optimistic-save RPCs are appropriate canonical owners. The proposed release pipeline is not implemented and cannot be approved by this review.
- Previous checkpoint: 56 tests passed; focused SQL restore test passed; Astro check clean; build/output validators passed for 111 pages. This review did not rerun the suite or mutate cloud data. Existing tests do not exercise contributor picker rendering or picker-only dirty-state behavior.
- No code changes applied as part of this review. This is a maintainability review with concrete behavior implications, not a full security audit or production deployment approval.

The original findings below are retained as review history. Remediation is recorded above and in CLAUDE-HANDOFF.md; a second independent review was not run.
