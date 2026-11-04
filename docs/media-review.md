# Media review

Prepared November 4, 2026 from the supplied Downloads media. Originals remain untouched. FFmpeg/ffprobe 9.0.1 and Sharp 0.35.5 were used. Generated output paths and measured geometry are recorded in `src/data/media-manifest.json`; the ignored detailed report is `.local/media-report.json`.

- 18 performance artworks produce 640, 960, 1440 WebP and 960 JPEG derivatives, retaining source aspect ratio with contain behavior.
- Ten artist cards reuse the selected appearance's matching supplied artwork, reduced at 480/800 WebP and 800 JPEG. They are deliberate landscape cards, so group and collaboration context remains intact rather than cropping out members. They are labeled as performance artwork.
- Eleven supplied shorts were re-encoded to 540×960 H.264/AAC with faststart and posters. Source files remain untouched.
- Rena's pink-outfit recording supplies a decorative silent portrait excerpt from 00:08 to 00:16; poster is the 00:08 frame. Visual inspection confirms Rena, microphone, and matching pink outfit with no visible cut or mismatch in the poster. The loop has no audio stream. It is a separate teaser and is not shown as Playscape footage.
- Playscape Vision Usseewa poster and Rena Inochi no Namae teaser poster were visually inspected. Other variants use deterministic size/format conversion from their named supplied artwork.
- The original logo JPEG is retained at `/media/brand/logo.jpg`; no new logo artwork was fabricated.

The 8-second loop's resulting size is approximately 0.9 MB. Encoded short output sizes and probed dimensions/durations are available in `.local/media-report.json`. Audible shorts were not listened to; quality was not assessed. The supplied files are the only media sources used.
