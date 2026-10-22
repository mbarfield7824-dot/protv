# Device validation and certification plan

**Unchecked means unverified.** This is not a certification claim. Record Roku
model, OS, build ZIP hash, title ID and actual outcome for every device session.

## First physical test

- [ ] Owner approved replacing the existing sideloaded app.
- [ ] ZIP installs, compiles on Roku, launches without runtime errors on 8085.
- [ ] Production catalog loads; loading, empty, malformed and offline states
      are legible; initial failure can be retried using Home.
- [ ] Wordmark, safe areas, hero and rail labels fit 720p/1080p/4K displays.
- [ ] All movie frames are 2:3; episode frames 16:9; artwork not cropped.
- [ ] 32 approved artworks match owner-approved sources, including minor
      source aspect-ratio differences; two held IDs show branded panels.
- [ ] Creator art, embedded JPEG art, failed URLs and missing art render safely.
- [ ] Hold Left/Right to scroll; move across long/short rows and categories.
      No clipped focus, unexpected wrapping or memory growth.
- [ ] Back restores exact title/rail after details/player; navigation remains
      reachable; Back on navigation exits; Home button returns to Roku Home.
- [ ] Search with remote keyboard, mixed case/multiple words/genres, empty
      input, no results, Cancel, Back and repeated openings.
- [ ] Open a movie and episode; verify springboard metadata and Play retry.
- [ ] Public Mux HLS actually decodes with audio/video on Roku.
- [ ] Pause/play, rewind/fast-forward/seek, long press, native overlays, Back,
      finish/end-of-stream, captions/audio tracks if supplied.
- [ ] Network loss before load, during authorization and during playback:
      visible errors, recovery, no infinite spinner or leaked player.
- [ ] Rapid Play/Back and warm deep links cancel stale authorization tasks.
- [ ] Link a non-admin test account using the displayed URL/code; approve on
      the website and confirm pending, approved, timeout/expiry, offline/retry
      and rate-limit states without exposing device secrets in debugger output.
- [ ] Confirm the website approval is interactive, sign-in reaches the intended
      viewer, Continue Watching contains only that viewer's exact catalog IDs,
      and a second viewer cannot see the first viewer's progress.
- [ ] Start/resume a movie and episode; verify poster progress bar, seek
      position, 20-second checkpoint debounce, pause/Back/finish flush and
      remote progress after app restart/relink. Confirm guest playback performs
      no account-progress requests and sign-out clears the Roku session.
- [ ] Verify Firebase ID-token refresh while the app remains active and
      expired/invalid-session recovery. Account credentials are intentionally
      memory-only; after a Roku process restart the viewer must link again.
- [ ] Confirm account linking was built with the existing public Firebase web
      client key, not a service-account/Admin credential.
- [ ] Signed eligible media tested when a suitable test title exists. Live
      catalog on audit date had zero signed titles; local token-rule tests
      do not establish live signed playback.

## Deep links

Replace the IP below with the actual device's local address. These are local
ECP **POST** commands to the developer app, not production write requests.
Run only after installation and device-owner permission.

```powershell
curl.exe -d "" "http://<ROKU-IP>:8060/launch/dev?contentId=sCWQqVE5WIoNNN5wAGQ2&mediaType=movie"
curl.exe -d "" "http://<ROKU-IP>:8060/input/dev?contentId=sCWQqVE5WIoNNN5wAGQ2&mediaType=movie"
curl.exe -d "" "http://<ROKU-IP>:8060/launch/dev?contentId=5FHvg3BEwBlk9qqNdZT5&mediaType=episode"
curl.exe -d "" "http://<ROKU-IP>:8060/input/dev?contentId=unavailable-title&mediaType=movie"
```

- [ ] Cold movie/episode launches start the matching authorized content.
- [ ] Warm movie/episode inputs work from home, search, detail and playback.
- [ ] Invalid/missing ID, wrong media type, removed title, unsupported series
      and plain app launch remain usable with meaningful feedback.
- [ ] Later: series picker/smart bookmarks and Roku Search feed.

## Before store submission

- [ ] Confirm current Roku certification requirements, target OS and minimum
      device performance. This preview uses StandardKeyboardDialog, not the
      deprecated legacy KeyboardDialog.
- [ ] Validate voice/remote accessibility, Audio Guide, contrast, readable
      focus, caption preferences, aspect ratios and native trick-play UX.
- [ ] Add owner-approved channel icons, splash and store screenshots; the
      minimal manifest intentionally has no final distribution assets.
- [ ] Verify launch/render/playback timings and memory on low-end hardware;
      embedded JPEG cache has a per-image limit but still needs device profiling.
- [ ] Validate website linking, token refresh/logout/expiry, rate limiting and
      cross-device Continue Watching on physical hardware before advertising
      Roku compatibility.
- [ ] Confirm privacy policy, terms, support contact and account deletion
      URLs; do not substitute existing footer hash anchors for public policies.
- [ ] Validate content rights/ratings, accessibility and regional availability,
      ads/RAF if monetization is enabled, no unauthorized Mux assets.
- [ ] Add resume-aware movie/episode and series deep-link certification samples.
- [ ] Run Roku Static Analysis, Deep Linking Tester and certification tests;
      review diagnostics, then obtain owner release approval before signing/
      packaging/uploading via the Roku developer account.

Local compiler/model tests cannot validate SceneGraph rendering, actual focus
event propagation, Roku networking/TLS/codec support, certification or playback.
