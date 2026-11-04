# YouTube sync operations

`npm run youtube:sync -- --fixture tests/fixtures/youtube-cycle.json --dry-run` validates a local fixture without a key or writes. Fixture runs never masquerade as live runs; `--output <project-relative-path>` explicitly writes a fixture candidate for development.

Live mode requires `YOUTUBE_API_KEY` in the runner environment before any request. Requests send the key using `X-Goog-Api-Key`; logs contain outcome summaries and sanitized failure reasons, not request URLs or response bodies. `--dry-run` performs the live read and validation but skips snapshot writes. Normal successful changes atomically replace ignored `.local/youtube-snapshot.json`; no-change runs skip the write unless the seven-day maintenance refresh is due.

`--previous <project-relative-path>` selects the durable prior snapshot. The path must stay inside this project. `--output` also stays inside the project. `--maintenance` performs expiry maintenance without API access. If the removal guard stops a cycle, review the authoritative channel result before rerunning with `--allow-mass-removal "reason for accepting removals"`.

`npm run youtube:hydrate -- --preview` is for local preview. A publication runner must supply `YOUTUBE_PUBLICATION_ORIGIN` and `YOUTUBE_FEED_URL` through its supported service context; the feed must be `/youtube-feed.json` on that exact origin. The hydrated baseline and proof are ignored under `.local/`. Credentials must not be put in either file or in command-line arguments.

The API key and the hosted Sites runner are not configured by this project packet. No automatic schedule or live synchronization is active until those capabilities are verified separately.
