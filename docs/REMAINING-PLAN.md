# Sonic Collective — remaining work

> **DEFERRED by Victor (2026-11-11): all real upload testing waits until later.** This covers A1, G1 and any real-photo upload through Media or the gallery editor, up to a release going live. Nothing below in those rows should be started or chased until Victor says to resume. Everything else can proceed.

Written 2026-11-11, updated 2026-11-12. The original CMS plan (Packets 0–7) is finished, deployed and rehearsed; this lists only what is left.
Status of the product: production builds from release `ea664a7a-cc56-495c-9c64-38722ad05184` (chosen with the owner Make live button); 193 automated tests pass.

**Quick list of what is left (everything else is done):**
1. Move the backup passphrase into a password manager (file `~/sonic-collective-backup-passphrase.txt`, then delete it) — C2.
2. Run `nvm reshim` so `npm`/`npx`/`astro check` work again on this machine — H1.
3. Real photo upload tests A1 and G1 (deferred), invite a real contributor A2, one real content edit A3.
4. Decide: make the repo private (D6), failed-build alert channel (D4), authenticator (B2), Vercel token (B1), Supabase plan check (C4).
5. Optional builds: bulk captions, second-project restore test (C3), sweep of stale `pending` images (H3).
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
| B3 | **[DONE 2026-11-11]** Thermo-nuclear code quality review | Sampled review of the CMS code; findings and what was fixed are in section H. Rerun it yourself before any large change |
| B4 | Rotate the `YOUTUBE_API_KEY`? | Only if it has been shared or you are unsure of it |

## C. Safety net

| # | Item | Owner | Effort | Done when |
|---|---|---|---|---|
| C1 | **[DONE]** Back up Supabase Auth accounts | Claude | done | Backups now include login accounts (no passwords) and the rehearsal checks every referenced account is present. Recreating accounts in a real second project is untested |
| C2 | **[DONE, one step left for you]** Schedule the CMS backup (weekly) | You | 5 min | The 3 secrets are set and the workflow ran; the downloaded artifact decrypted and passed the restore rehearsal (2026-11-12). It then runs every Sunday 20:17 UTC and keeps artifacts 90 days. **Left for you:** store the passphrase in a password manager and delete `~/sonic-collective-backup-passphrase.txt`. Pitfall found: a stray carriage return from `openssl` on Windows made the saved passphrase differ from the secret; use `tr -d '\r\n'` when generating one |
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

## D+. Built later (done)

- Activity page at /admin/activity/ (who changed what and when).
- Content library search by artist name or song title, not only technical id.

## H. Code review follow-ups (review of 2026-11-11)

| # | Item | Status |
|---|---|---|
| H1 | Fix the NVM trust block (`NVM4306`: `npm`/`npx` refused) with `nvm reshim` or reinstalling Node 24. Until then `astro check` cannot run locally; tests and a TypeScript check of single files do | **You** |
| H2 | Backup unpack path check, stale `release.json` removed after a failed build, shell for `npm` only on Windows, `applyContentAction` helpers, shared role list, logged swallowed errors, image sniffing in `image-sniff.ts` | **DONE** (commits 1961109, 5036f27, 24a613b; live and verified) |
| H3 | Database-side sweep of assets stuck `pending` (needs a migration you apply). Failures are now logged but not swept | Optional |
| H4 | Gallery caption limit is 300 in the browser but 500 on the server; pick one | Optional |
| H5 | The gallery uploader pre-fills alt text from the file name; consider leaving it blank or flagging it | Optional |
| H6 | `actions.ts:52` casts a restored payload instead of parsing it first | Optional |
| H7 | No Prettier config; the dense one-line style is consistent but hard to scan | Optional |
| H8 | Not covered by the sampled review: migrations, most admin pages, most tests | Optional follow-up review |

## I. Starting a new Claude Code conversation (read this first)

Read in this order: this file, `docs/CLAUDE-HANDOFF.md` (history of what was built and verified), `docs/CMS-OPERATIONS.md`, `docs/CMS-BACKUP.md`.

**Where the next session runs:** the Claude desktop app, for now. Open the `site` folder (it is the git root) as the working folder so the project instructions and these docs load. Tools and permissions can differ from the terminal version, so check what is available (shell, browser testing, Vercel and GitHub access via `gh`) before relying on it. Victor's global instructions still apply.

**Project in one line:** private editorial CMS for the Sonic Collective music archive. Astro site, Supabase (Auth, Postgres, private Storage), Vercel hosting. The site code root is the `site/` folder; the git repo is `victor-7-ops/sonic-collective` (PUBLIC), branch `main`, remote name `github`. Production: https://sonic-collective.vercel.app, admin at `/admin/`.

**Rules from Victor (follow exactly)**
- No AI attribution anywhere: no `Co-Authored-By`, no AI mentions in commits, files or media. Commit as `victor-7-ops <70519898+victor-7-ops@users.noreply.github.com>`.
- Secrets never go in chat, source or public env vars. `SUPABASE_SECRET_KEY` lives only in the ignored `.env.local`, Vercel (Production, Sensitive) and GitHub Actions secrets. Read-only diagnostics use `node --env-file=.env.local`.
- Real upload testing (A1, G1, any real-photo upload through a release) is deferred until Victor says to resume. Throwaway-record tests are fine; archive them afterwards.
- Victor runs the thermo-nuclear code quality review himself; never run it automatically unless he asks. Never remove validation, error handling or security checks because a review suggests it. Flag any file over 1000 lines; do not split it automatically.
- Greeting on the first message of a conversation (see his global instructions). Terse style is active.

**How things work**
- Production build precedence: owner's Make live choice in the database (`editorial_live_releases`), then `CMS_RELEASE_ID` env (fallback), then repository content. Build entry is `npm run build:release` (`scripts/build-with-release.ts`, set in `vercel.json`).
- Database changes are SQL files in `supabase/migrations/`. Victor applies each one in the Supabase SQL Editor **before** the code that needs it is pushed. Claude cannot apply them.
- Claude can create but not edit or delete Vercel environment variables, and cannot generate Auth recovery links with the server key; those are blocked on purpose, do not work around them.
- Checks: `tsx --test tests/*.test.ts` (193 tests) and `astro check`. On Victor's machine NVM currently blocks `npm`/`npx` (`NVM4306`); run tools with `node --import tsx ...` or `node node_modules/<pkg>/...` until he runs `nvm reshim`. Do not bypass the block.
- Shell tips: Windows with Git Bash. Escaping backticks, `$` and regex inside `node -e` goes wrong; use the Edit/Write tools for code. Generated passphrases must be stripped with `tr -d '\r\n'` (a stray carriage return once broke decryption).
- Weekly encrypted backup runs from `.github/workflows/cms-backup.yml`; the passphrase lives only in the GitHub secret and Victor's password manager. Restore steps are in `docs/CMS-BACKUP.md`.

**State when this was written (2026-11-12):** all CMS packets and the review fixes are live (latest code commit `24a613b`); production serves release `ea664a7a`; 193/193 tests pass; weekly backup verified end to end. What is left is sections A to D and H above.

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

1. Passphrase into a password manager, `nvm reshim` (H1). 2. A1 → A3 (real use, when upload testing resumes). 3. B1–B2, D4, D6 (decisions). 4. C3, C4 (safety net extras). 5. Rerun the review (B3) before any large new feature.

## Where things are

- Handoff notes and verification history: `docs/CLAUDE-HANDOFF.md`
- Backup procedure and rehearsal log: `docs/CMS-BACKUP.md`
- Operations: `docs/CMS-OPERATIONS.md`
- Production: https://sonic-collective.vercel.app — admin at `/admin/` (owner `dmstudio.admin@gmail.com`)
