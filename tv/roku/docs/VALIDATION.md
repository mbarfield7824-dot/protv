# Phase 2 validation record

Date: 2026-10-22. Node 24.19.0, npm 11.17.0, Windows.

## Local build and automated tests

- `npm run build` passed. This runs the pinned BrighterScript compiler,
  automated tests and deterministic ZIP packager.
- BrighterScript `0.73.7` compiled the Roku project successfully.
- `npm test` passed all 5 Node test groups. The actual shipped BrightScript model
  passed **94 assertions** using `brs 0.45.0`.
- Account/progress model checks cover device-session response validation and
  expiry, Firebase custom-token/refresh shapes and viewer identity, activation
  polling states, bounded retry/backoff, guest access, sparse/bad progress maps,
  exact catalog-ID joins, completion filtering, newest-first order, resume
  position, debounced checkpoints and forced pause/exit flush.
- Structural checks cover XML well-formedness, component/script/node
  references, movie/episode artwork geometry, progress-bar wiring, API route /
  authorization headers, no registry token persistence, ZIP root and exact
  runtime allowlist.
- The ZIP includes 10 runtime files and the website's **public** Firebase web
  client key injected via `ROKU_FIREBASE_API_KEY`; the key is not in Roku source.
  Two packages generated under the same build configuration compare
  byte-for-byte.

Fresh package: `dist\protv-roku.zip`, **16,304 bytes**.

SHA-256: `9b24ea77d771d1684f3f384dae0537b3ea2caa0d3192b17c4ba2f37301d8290d`.

## Read-only production smoke check

`npm run smoke` passed at `2026-10-22T19:01:48.428Z`:

| Probe | Result |
| --- | --- |
| Public all-catalog GET | HTTP 200; 56 unique IDs |
| Supported types | 51 movies, 5 episodes |
| Approved poster URLs | 32 exact rollout URLs preserved |
| Held artwork IDs | Both returned; branded title panels remain in effect |
| Black Cinema | 7 public titles |
| Public Black Cinema movie search | HTTP 200; nonempty results |
| Title details | HTTP 200; exact ID `sCWQqVE5WIoNNN5wAGQ2` |
| Playback authorization | HTTP 200; matching on-demand Mux response |
| HLS master playlist | HTTP 200; valid `#EXTM3U`; no segments fetched |
| Native decode/playback | Not exercised |

The full live catalog ran through the shipped BrightScript normalizer. Smoke made
no authentication/device-session/progress requests and performed no Firestore,
catalog, artwork or playback writes. No media segments were fetched. A
sanitized receipt is in `out\live-contract-report.json`.

## Not verified

- Physical Roku installation was **not attempted**, as requested; the new Roku
  stick's activation problem still blocks hardware testing.
- No live account was linked. Firebase custom-token exchange/refresh, the
  website approval UI, cross-device progress, and actual user-scoped writes were
  not exercised against a test account. These paths are covered by offline
  contract/model checks, not an end-to-end authenticated service test.
- No device runtime logs, remote focus/input behavior, native seek/resume,
  pause/Back flush timing, codecs, captions, audio tracks or decoded playback
  are claimed. HLS playlist availability is not video playback verification.
- Roku OS secure-storage behavior is not claimed. This implementation uses
  in-memory credentials only and requires account re-link after process restart.
- No Roku certification/store submission was performed.

No production backend, website source, Fire TV source, catalog, creator content
or approved poster was modified.
