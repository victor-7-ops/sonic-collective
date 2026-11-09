# CMS archive foundation

The fixed archive migration is applied to Sonic Supabase, generated types are refreshed, and archive/restore controls plus active/archived/all library filters are implemented. No real content has been archived during verification.

The additive migration `20261106023243_editorial_archive.sql` adds `archived_at` and an authenticated archive/unarchive RPC. Each operation requires an active owner or editor, AAL2, and the current optimistic version. It increments the item version and appends an immutable `archive` or `unarchive` audit record; revisions and approvals remain intact. Contributors cannot archive. Archived items cannot be edited or reviewed until unarchived.

Before archiving an item, the RPC blocks active draft or approved references to its stable ID from performances, YouTube reviews, homepage featured/hero selections, clips, and series assignments. One reference traversal is shared by the inbound archive check, revision inserts, and unarchive validation of both current draft and approved revisions. The validator locks referenced items and rejects new references to already archived items or reactivation with stale references. This is a bounded guard for the current payload shapes; extend it with any future reference fields before adding those fields to editing. Unarchive preserves the same revisions and does not itself publish anything.

Archive does not alter repository-backed public content or retained deployments. Restore preserves revisions and does not publish. Publication cutover and release retention remain separate work.

Validation is the focused PGlite test `tests/editorial-archive.test.ts`, which applies every migration in order and covers role, MFA, stale-version, reference-denial, audit, edit-blocking, and history-preservation behavior. PGlite is not a substitute for hosted Supabase verification.
