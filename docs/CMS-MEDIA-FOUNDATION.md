# CMS private media

The media migration is applied to the Sonic project. Victor privately configured the server-only `SUPABASE_SECRET_KEY`; a read-only admin request verified access. Never print or commit it. Without the key, uploads fail closed.

The private `editorial-media` bucket has no client object-read/write policy. RLS limits asset metadata to current permitted members; only trusted server operations write assets. After rechecking membership, the server signs ready derivative previews for 60 seconds. Originals are never signed to users.

The upload route bounds the multipart body before parsing, accepts JPEG/PNG/WebP up to 15 MiB, validates complete containers, rejects animation and excessive dimensions/pixels, applies orientation, strips metadata and creates a WebP derivative. It writes pending metadata, original and derivative before marking ready. Failure cleanup targets only the new UUID paths and rechecks completion before deleting.

The admin gallery and upload form are enabled. Automated helper, route and database-policy tests pass as part of the 98-test suite. No actual hosted upload or cleanup rehearsal has been performed. Assets remain private and cannot yet be selected as public catalog artwork; approval, public release-manifest mapping and retention integration remain unfinished.
