# Sonic Collective — remaining work

> **DEFERRED by Victor (2026-11-11): all real upload testing waits until later.** This covers A1, G1 and any real-photo upload through Media or the gallery editor, up to a release going live. Nothing below in those rows should be started or chased until Victor says to resume. Everything else can proceed.

Written 2026-11-11. The original CMS plan (Packets 0–7) is finished, deployed and rehearsed; this lists only what is left.
Status of the product: production builds from release `ea664a7a-cc56-495c-9c64-38722ad05184` (chosen with the owner Make live button); 153 automated tests pass.
Owner column: **You** = needs your account or a decision. **Claude** = can be built and tested without you (some still need you to run one SQL block).

## A. First real use (highest value, finds what tests cannot)

| # | Item | Owner | Effort | Done when |
|---|---|---|---|---|
| A1 | **[DEFERRED]** Upload a real image at Media, pick it as an artist portrait, approve, prepare a release, Make live | You (Claude verifies after) | 15 min | The image appears on the public artist page; Releases page says Live; marker shows the new release. This is the only path never run live: a library image through a production release |
| A2 | Invite one real contributor and have them draft and submit something | You | 30 min | Contributor sees only their own items, cannot approve or request changes, and an editor can review their draft |
| A3 | Make one real content edit end to end (edit, approve, release, Make live) | You | 15 min | Public page shows the change; history, feedback and status boxes all read correctly |

## A+. Galleries (built Nov 11; verify with real photos)

Artists and performances can each have a photo gallery (max 24, each photo with a required description and optional caption). Built and tested on production with throwaway records: data rules, public grid + enlarge viewer, editor (add, reorder, caption, remove), and multi-photo upload inside the editor with in-browser shrinking.

| # | Item | Owner | Effort | Done when |
|---|---|---|---|---|
| G1 | **[DEFERRED]** Add real photos to a real artist, approve, prepare a release, Make live | You (Claude verifies) | 20 min | Photos show in the artist page grid with working enlarge viewer on the public site; the 800px grid copies load, not the 2400px originals. Not yet exercised live: a gallery going through a release |
| G2 | **[DONE]** Resize photos in the browser on the Media page form too | Claude | done | Uploads over 4.5 MB from Media no longer fail on Vercel (only the gallery uploader shrinks today) |
| G3 | **[DONE]** Archive library images (Media page; files are kept, nothing deleted). Verified live: refused while in use, allowed after removal | Claude | done |  Unused test photos can be removed; guards refuse archiving an image still referenced by approved content or a release |
| G4 | **[NOT NEEDED]** HEIC (iPhone) photos | n/a | n/a | The server image library here reads only the AVIF flavour of HEIF, not HEIC. The upload boxes accept JPEG, PNG and WebP only, and iPhones convert to JPEG automatically in that case. Revisit only if a photo ever arrives as HEIC |
| G5 | **[DONE, verified live: button reorder saved]** Drag to reorder (handle plus Earlier/Later buttons, keyboard friendly). Bulk captions not built | done | Position numbers remain the source of truth |

Test photos (Upload test photo one / two) are archived and no longer selectable; their private files are kept in storage. Archived throwaway records (not visible to visitors): acceptance-test-artist, guard-check-artist, picker-check-artist, gallery-check-artist, upload-check-artist.

## B. Decisions only you can make

| # | Decision | Notes |
|---|---|---|
| B1 | Keep or revoke the Vercel API token | It powers the build-status panel and the Make live redeploy. It can deploy and delete across the whole team. If revoked: Make live still records the choice but cannot start the rebuild itself (you would redeploy in Vercel) |
| B2 | Enrol an authenticator, or leave optional | Optional today. Enrolling protects only that account; approvals, archiving, releases, team changes and Make live then require it |
| B3 | Run the thermo-nuclear code quality review | Earlier review covered only the first image feature. Later work (history, inbox, comments, releases, backups, Make live, picker) has tests but no separate review. Run it yourself, before any large change |
| B4 | Rotate the `YOUTUBE_API_KEY`? | Only if it has been shared or you are unsure of it |

## C. Safety net

| # | Item | Owner | Effort | Done when |
|---|---|---|---|---|
| C1 | **[DONE]** Back up Supabase Auth accounts | Claude | done | Backups now include login accounts (no passwords) and the rehearsal checks every referenced account is present. Recreating accounts in a real second project is untested |
| C2 | **[BUILT, needs you]** Schedule the CMS backup (weekly) | You add 3 secrets | 10 min | Workflow cms-backup.yml is in place and encrypts before storing (the repo is PUBLIC). Add repository secrets SUPABASE_URL, SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE, then run it once from the Actions tab and confirm an encrypted artifact appears |
| C3 | Real restore into a second Supabase project | You + Claude | 2 h | Documented, rehearsed once, steps in `docs/CMS-BACKUP.md` |
| C4 | Supabase plan check | You | 5 min | Know whether your plan includes platform backups (the Free plan has none) |

## D. Small improvements (all Claude, low risk)

| # | Item | Effort |
|---|---|---|
| D1 | **[DONE]** Keep what you typed after a refused save (editor form; the review-reason box is not covered) | done |
| D2 | **[DONE]** Library picker pages 24 at a time; every image stays selectable (search not built) | done |
| D3 | Clean embedded metadata: 102 older images carry an empty EXIF stub; videos carry the ffmpeg encoder tag | 1–2 h; videos need ffmpeg installed |
| D4 | Email or notify on a failed production build | 2 h; needs a notification channel from you |
| D5 | **[DONE]** Releases page marks releases that were live before ("Previously live (date)"); every release already has a Make live button, so reverting is one click | done |
| D6 | Remove AI-tool mentions from `docs/*.md` if the repository will ever be public | 30 min |

## E. Known limits (accepted, no action unless needed)

- Login accounts, Vercel/GitHub settings and the YouTube snapshot are outside the CMS backup.
- Private library images show in previews only as references, not pixels, until a release is live.
- The archived test artists (`acceptance-test-artist`, `guard-check-artist`, `picker-check-artist`, `gallery-check-artist`, `upload-check-artist`, `restore-check-artist`, `reorder-check-artist`) remain in the database, archived and invisible to visitors.
- `CMS_RELEASE_ID` in Vercel is now only a fallback; the Make live choice in the database wins.
- Claude cannot edit or delete Vercel environment variables (blocked by the tool permissions); you do that in the dashboard.

## F. Routine (recurring)

- Weekly: run `npm run cms:backup`, then `npm run cms:restore-rehearsal`, copy the backup somewhere private.
- Per content change: edit, approve, Prepare release snapshot, Make live, check Releases page says Live.
- After any change to `supabase/migrations/`: the migration must be run in the Supabase SQL Editor by you before the code that depends on it is pushed.
- If a build fails on Vercel: the live site keeps serving the previous version; read the failure on the Releases page.

## Suggested order

1. A1 → A3 (real use). 2. B1–B2 (decisions). 3. C2 then C1 (safety net). 4. D1, D2, D5. 5. B3 before any large new feature.

## Where things are

- Handoff notes and verification history: `docs/CLAUDE-HANDOFF.md`
- Backup procedure and rehearsal log: `docs/CMS-BACKUP.md`
- Operations: `docs/CMS-OPERATIONS.md`
- Production: https://sonic-collective.vercel.app — admin at `/admin/` (owner `dmstudio.admin@gmail.com`)
