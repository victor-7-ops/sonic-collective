# Historical checkpoint

The results below are dated November 4 and are retained as evidence for that version. Current CMS status, later counts and remaining checks are in `PROJECT-AUDIT.md`, `CLAUDE-HANDOFF.md` and `editorial-setup.md`.

# Release candidate verification

Date: November 4, 2026. Scope: local static build, fixture-backed upload integration, and browser QA. No publish or hourly task was performed in this checkpoint.

## Build and content

- Isolated Node runtime: v22.23.4; dependencies remain pinned by the checked-in lockfile.
- `npm run content:validate`: passed; 10 artists, 18 authored performances, 11 clips.
- `npm test`: 41/41 passed, including the T11 canonical/route helper cases.
- `npm run check`: zero Astro/type diagnostics.
- `npm run build`: passed on the clean uninitialized local snapshot; 34 HTML pages: six base pages, 18 authored performance routes, and 10 visible artist profiles. No imported routes are expected without a hydrated upload feed.
- Fixture-backed build: 36 HTML pages: six base pages, 18 authored performance routes, 10 visible artists, and two unmatched imported watch routes. The fixture includes one embeddable and one nonembeddable upload. No fixture is deployed.
- Fixture CLI reports simulation and never writes without an explicit `--output`; live sync without `YOUTUBE_API_KEY` exits before network access or writes. API header acceptance and live channel data remain unverified.
- Output inventory: clean build 171 files / 44,861 KiB; fixture build 173 files / 44,898 KiB. Both passed the output checks: no `.local`/`node_modules` tree, credential-like values, Windows source paths, or MP4 over 20 MiB in `dist`. The local shorts and teaser are prepared web assets, not original source exports.

## Browser evidence

- Browser target: local Astro preview at `http://127.0.0.1:4321`, isolated Playwright context.
- Width/height checks: 360×640, 390×844, 768×1024, 1024×768, and 1440×900. `documentElement.scrollWidth` equaled its client width at all five sizes.
- Homepage: Latest block emits six date-sorted cards after the curated archive and before Covers. The previewed fixture page uses canonical `/watch/<youtubeId>/` links.
- Catalog: imported title search narrowed results; Newest placed the dated imported upload first; series filters exclude null-series uploads. The catalog stays server-rendered in the static HTML.
- Nonembeddable fixture: direct YouTube link remained; no play control or iframe was created.
- Console: zero errors/warnings on the fixture homepage and watch page after replacing a deliberately invalid thumbnail in the local test fixture.
- Before-action player checks and actual playback, reduced motion, media coordination, Escape/focus restoration, hidden/offscreen pause, and local shorts were verified in the earlier T07/T08 checkpoints. Real Rena playback worked in the local browser; featured Usseewa returned YouTube error 150 and keeps its external fallback.
- Screenshots: `plans/sonic-collective/screenshots/t10-home-desktop.png`, `t10-home-mobile.png`, `t10-latest-desktop.png`, `t10-catalog-mobile.png`, `t11-performance-mobile.png`, and `t11-artist-desktop.png`.

## Metadata and release boundary

- The release defaults to `noindex,nofollow`; `robots.txt` disallows crawling. With no real `SITE_URL`, canonical/OG absolute URLs are omitted and sitemap output explicitly says it is deferred.
- No fabricated VideoObject data, upload dates, artist profiles, bios, or original-artist credits are emitted for imports.
- `npm run output:validate -- --publication` requires a publication hydration proof that matches the built feed and Site origin; an invocation without proof failed as expected. An initialized live baseline cannot become uninitialized without a reasoned explicit reset.
- YouTube API credentials, authenticated same-Site feed access, source/publish runner access, and the hosted schedule are not configured. Automatic updates are not active. The known YouTube error 150 is an individual-video embed limitation, not proof of a general hosting failure.

This is a locally verified release candidate. Deployment and hosted playback require the separate T12 capability checks.
