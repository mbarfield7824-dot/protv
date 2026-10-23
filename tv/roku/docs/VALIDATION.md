# Roku validation record

## Device bug fixes (v0.5.1) - 2026-10-23 (local time)
Owner device test of v0.5 reported three defects; fixes are not yet device-verified.
- Playback: OK and Play/Pause that reach the scene toggle pause/resume;
  no focus function can take focus from the playing video; rail rebuilds
  wait until playback ends; guest registry writes happen on pause, Back and
  finish (otherwise once a minute); native bars use PROtv blue.
- Sign-in: account results are bound to the request that produced them (a
  late result previously read the newer request's empty result, a runtime
  error that halts a sideloaded app); a repeated press while a request runs
  is ignored with a notice; timer durations are floats.
- Guest control: the top-right Guest/greeting is a focusable button (Up from
  the featured actions, the first rail or the account actions); OK opens
  Account; Back returns to it.
- npm run check: 0 diagnostics. npm test: 9/9, 162 model assertions, 100
  scene regressions (33 new, driving the full sign-in flow with fake requests,
  the player keys and the Guest control). npm run smoke: passed.
- ZIP: dist/protv-roku.zip, 670,369 bytes, SHA-256
  ecbef1bfb579eb0e2c5f0dccdbefdef86eb06a82a20012a5d62c72755b6bf671.

## Completion sprint (v0.5) - 2026-10-23 (local time)
- B1 account linking: the packager injects the website's existing public
  Firebase web key (ROKU_FIREBASE_API_KEY, else the gitignored
  frontend/.env) into the ZIP only; source keeps an empty key.
- B2 saved sign-in in the app's registry section; refresh at launch; offline
  refresh keeps it, Firebase 4xx or Sign Out deletes it.
- B3 AppLaunchComplete once per launch (certification 3.2).
- B4 resume via content.PlayStart (seek before play removed).
- B5 Roku certification 4.7 requires trick-play thumbnails for VOD over
  15 minutes; Mux returns EXT-X-IMAGE-STREAM-INF with roku_trick_play=true
  (verified on the live manifest). Signed streams would need it in the token;
  the live catalog has no signed titles.
- D1 portrait 2:3 cards for Continue Watching and episodes; D2 quiet catalog
  reload on returning Home after 15 minutes; D3 guest Continue Watching on
  this TV (certification 4.10 bookmarking applies to guests too).
- Series screen: seasons from real season numbers, episodes by number.
- **Defect fixed (present since the first Roku commit):** the init node loop
  assigned the Account screen node to m.account, so guests were treated as
  signed in (Account showed "Signed in", My List writes silently dropped) and
  m.account.visible would fail after sign-out. The screen is now
  m.accountScreen.
- Token expiry is kept as an integer (a Float lost ~100 s of precision).
- npm run check: 0 diagnostics. npm test: 9/9, 162 model assertions, 67
  scene regressions. npm run smoke (live, read-only): 56 titles, AI Cinema
  (The Bundy Chronicles) in its view and Home row, 5 series grouped with no
  episode lost, playback authorization 200, HLS master 200 with Roku
  trick-play playlist.
- ZIP: dist/protv-roku.zip, 669,391 bytes, SHA-256
  cfb2c11bcea2cd42940e6186279a091545ebb7933a386ce12c25449e0aadb3bb.
- **Not device tested.** Memory, focus rendering, LabelList behaviour,
  registry persistence and trick-play thumbnails need hardware confirmation.

## Owner device feedback fixes (v0.4) - 2026-10-23 (local time)

- Right-side space: full-width hero wash, 176 x 264 poster, wider copy,
  rails start at x=112 and run to the screen edge.
- Hero description: synopsis without "Rights:" notes; fragments starting
  mid-word are hidden. **Production data issue (not changed):** His Girl
  Friday (`LiMNMZWXBxJj3LoP73kU`) description is only
  "na. Rights: Public domain." and needs its synopsis restored.
- Cut-off rails: browse arrangement fits two full rails (152..684); the
  hero arrangement fades the next rail out instead of cutting it.
- Sidebar: collapses to icons, expands with labels on focus; "Continue".
- Creator invite tile ends the creator row.
- `npm test`: 8/8, 135 model assertions, 51 focus/layout regressions.

## Signature home (v0.3) - 2026-10-22 (local time)

Supersedes the v0.2 layout notes below. Owner decisions: blurred colour wash
(no artwork cropping), only destinations with content, all four signature
features, creator submissions at the forefront.

- Icon sidebar, living hero (crossfading wash + 8 s spotlight rotation),
  Play / More Info / My List, PROtv Discover moods, My List via existing
  favorites routes, Continue Watching time left, greeting, creator-first
  ordering and badges.
- `npm run check`: 0 diagnostics. `npm test`: 8/8 passed, including 125
  BrightScript model assertions and 43 SceneGraph focus regressions.
- HTML mock-ups (headless Chrome, live public catalog) cover the creator
  spotlight, Black Cinema browsing, Continue Watching + My List and Discover.
  CSS blur approximates the Roku low-resolution wash; not device evidence.
- **Production issue found (not changed):** both live creator posters,
  `/api/posters/creator-<sha256>.{jpg,png}`, return HTTP 500, so creator
  titles currently show branded fallback panels on every platform.
- **Not device tested.** Confirm wash smoothness, crossfade performance,
  9-patch seams, RowList label offsets and memory on hardware.

## PROtv blue overhaul (v0.2) - 2026-10-22 (local time)

Supersedes the layout, colour and sidebar notes in the section below; the
account, progress, playback and artwork rules are unchanged.

- Purple theme removed; black / royal blue / electric blue / white only.
  The sidebar and collapse toggle are replaced by a top tab bar.
- New `PillButton` component; redesigned `PosterCard` (140 x 210 / 256 x 144,
  focus ring + zoom, subtitle line); new featured, detail, account and about
  layouts; channel icon and splash screen added to the manifest.
- `npm run check`: 0 diagnostics. `npm test`: 8/8 passed, including 103
  BrightScript model assertions and 40 SceneGraph focus regressions (tabs ->
  featured actions -> rails, account and detail actions, status toasts).
- HTML mock-ups mirroring the XML geometry were rendered in headless Chrome
  with live public catalog posters (home, featured focus, detail, account).
  They approximate Roku fonts and 9-patch rendering; they are not device
  evidence. `dist/layout-validation.svg` predates v0.2 and is obsolete.
- **Not device tested.** Roku font metrics, 9-patch seams, RowList row-label
  offset and card zoom need confirmation on hardware.

## Premium UI redesign - 2026-10-22 (local time)

Branch: `feature/issue-7-roku-phase-1`. Scope: Roku files only. Existing
untracked root `audit-reports/` preserved. Owner will install manually; no
installation was performed. No production or Fire TV files changed.

### Final manual-install package

- ZIP: `dist/protv-roku.zip` (**34,597 bytes**, 11 runtime entries).
- SHA-256: `199504c7e518543e5be513c9fbcece08debf4500d9ad1eaedee6ddc73c977e1f`.
- Final `npm run build` passed the BrightScript compiler and all seven test
  groups. Packaging tests compare two builds byte-for-byte.
- The ZIP contains the existing public Firebase web-client configuration,
  injected from the local PROtv frontend environment at build time only. No
  website, backend, Fire TV, catalog or creator-art files were changed.
- The runtime ZIP contains only the app manifest, SceneGraph/BrightScript
  sources and a UI-only gradient background. No installation was performed.

### Layout and automated coverage

- BrighterScript compiler check passes.
- Seven Node test groups pass: **95 model assertions** and **38 controller
  assertions**, plus XML/node references, geometry, account contracts and
  byte-reproducible runtime-only packaging.
- Controller tests execute the actual scene BrightScript with mock focus nodes:
  vertical sidebar navigation, collapse-toggle reachability, sidebar/rail/hero
  Play transitions, synopsis focus/return and status-strip visibility. They do
  not simulate SceneGraph layout, font metrics or native scrolling.
- Geometry checks require the expanded/collapsed content columns to end at the
  1248px safe boundary; the 120 x 180 featured portrait clears the right safe
  margin; eight 112 x 168 movie posters plus focus borders fit horizontally;
  and two 242px rows fit between y=198 and the 684px bottom safe boundary.
  Episode art is 192 x 108. Artwork remains aspect-ratio contained and
  load-size bounded; three-line captions remain below each poster.
- `dist/layout-validation.svg` was rendered in a local browser at 1280 x 720.
  The preview shows the featured panel, selected sidebar, Play control and two
  visible category rows. Its explicitly labeled generic poster frames are
  geometry placeholders, not catalog entries or artwork.
- Movie/episode browsing, guest playback, native Video controls, activation,
  progress contracts and exact approved/held artwork selection are preserved.
- Runtime images use `loadWidth`/`loadHeight` before URI assignment, bounding
  decoded texture sizes without changing source bytes or approved URLs.
  Large 1024 x 1536 approved sources could contribute to texture pressure in
  the old layout; no device trace establishes that as a historical failure.

### Read-only production checks

The pre-layout read-only `npm run smoke` passed at `2026-10-23T00:04:05.740Z`: 56 titles (51 movies,
5 episodes), 32 exact approved URLs, both holds, seven Black Cinema titles,
search, detail, playback authorization and one valid HTTP 200 HLS master.
No video segments, authentication requests or progress writes.

Public image diagnostics evaluated the same source precedence as the shipped
normalizer, without changing URLs, transforming artwork or exposing URL query
strings. Of 56 titles, 47 image sources downloaded and decoded on the host,
including all 32 approved posters. Two IDs are intentionally held, one has no
supported source, and six returned HTTP errors:

| Title / exact ID | Observation |
| --- | --- |
| The Lost Camp / `creator_20752565-9909-4c2b-9f53-c9719ca26769` | Existing watchprotv.com artwork route HTTP 500 |
| Dead Air / `creator_89303465-51e3-46bb-bd21-ff5ed2db2c49` | Existing watchprotv.com artwork route HTTP 500 |
| House on Haunted Hill / `p532d2Aqpb3bC2rvYkQw` | publicdomainmovie.net HTTP 429 |
| Sita Sings the Blues / `vuvTzWOcVJJeg12CsTq9` | publicdomainmovie.net HTTP 429 |
| The Phantom of the Opera / `WeNPJRItOH2nOdbwLkDG` | publicdomainmovie.net HTTP 429 |
| The Bundy Chronicles / `sqKR6c5Cq7MD9lg1GDxG` | Existing fbcdn.net source HTTP 403 |
| Merri Melodies shorts / `v_1789872561270_i3svw5cbz` | Localhost HTTP source is deliberately rejected; localhost is not this computer from Roku |
| `MZ6Q6DI2S62pP8laH9Ku`, `XMj306OZSbomES2Zz0Fz` | Intentional artwork holds, not download failures |

These HTTP responses are exact host-side observations at test time, not proof
of the causes of every earlier Roku failure. Backend error internals, external
403/429 policy, device TLS/decoder behavior and memory remain unverified.
Do not replace creator art, relax holds or proxy external art to hide failures.
The UI retains branded panels. Runtime diagnostics now identify the title ID
and surface (rail/featured/detail) without URLs, tokens or credentials.
Local sanitized receipts: `out/artwork-diagnostics.json` and
`out/live-contract-report.json` (not included in the ZIP).

### Comparison and remaining manual validation

The implementation follows the supplied reference's compact left navigation,
PROtv branding, purple selection/focus treatment, cinematic featured title and
Play action, and multiple horizontal catalog rows. Only the existing functional
Home, Search, Account and About destinations are present. Since available
featured artwork is portrait-only, the hero uses a dark purple-to-black UI
gradient with a contained poster rather than stretching art into a landscape.
The preview deliberately omits actual catalog artwork and titles; runtime art
and groupings continue to come from the approved live catalog.

**No physical Roku screenshot was captured and the ZIP was not installed.** The
local preview verifies the 720p geometry and hierarchy but not Roku font
metrics, SceneGraph rendering or native scrolling. On the reported Streaming
Stick 3840RW / 720p device, verify launch, sidebar collapse/expand and label fit,
native button focus contrast, both visible rail headings/captions, vertical and
horizontal scrolling, long-title wrapping, all artwork types, synopsis
scrolling, featured Play, Play/Resume, native transport/subtitles and Back
position restoration. Account activation and live Continue Watching/resume also
need physical-device verification. The host-side HLS check is not decoded
playback verification.

The older implementation's historical validation follows; its ZIP checksum and
counts are not the premium redesign package.

---

## Historical Phase 2 validation

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
