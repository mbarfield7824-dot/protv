# Roku certification readiness (v0.5.6 candidate)

Checked against Roku's published certification criteria on 2026-10-23.
**Not submitted and not certified.** "Evidence" says how each item is known;
anything without physical-TV evidence still needs the owner's device test.

## Mandatory

| Requirement | Status | Evidence |
| --- | --- | --- |
| 3.2 Launch beacon; home screen within 15 s | Implemented, timing unmeasured | `AppLaunchComplete` sent once (automated test). Measure launch time on the TV |
| 4.6 Back returns to the previous screen; Back on Home exits | Implemented | Automated focus tests; owner confirmed navigation on the TV (v0.5.5) |
| 4.7 Trick-play thumbnails for VOD over 15 min | Implemented, unverified | Custom player shows Mux preview thumbnails while seeking (automated test). Confirm on the TV |
| 4.8 Captions where required by law | **Open** | No title has caption tracks (live manifests checked). Needs a legal call on which titles require them |
| 4.10 Bookmarks for VOD over 15 min, kept 30+ days | Implemented | Signed-in: account progress; guests: on the TV, 50 most recent titles, no expiry (automated tests) |
| 5.1 Deep linking for supported media types | Implemented, unverified | `contentId` + `movie`/`episode` (automated tests). Verify with Roku's Deep Linking Tester |
| 6.4 FHD and HD splash screens | Done | 1920x1080 and 1280x720 in the manifest |
| Stability: no crashes, no lingering UI | Fixed in code, unverified | v0.5.6 fixes the lingering player bar; needs a 1-2 hour soak test on the TV |
| Store listing: privacy policy, support contact, rating, artwork, screenshots | **Owner** | watchprotv.com/privacy exists; confirm it covers TV sign-in, saved sign-in and guest progress |
| Signed package from Roku's Packager on a developer-mode device | **Owner** | Requires the physical Roku; not done |

## Recommended

- A captions on/off control in the PROtv player once tracks exist (the native
  `*` panel is unavailable because the native player UI is off).
- Account deletion on the website (needed for Google Play and Apple, and
  expected by privacy law), linked from the Roku Account screen.
- Rights documentation ready for public-domain titles, in case Roku asks.
- Memory and frame-rate checks with the Roku developer tools during a soak test.

## Optional

- Roku Search feed, Continue Watching on the Roku home screen.
- Instant Resume (required only above 5 million streaming hours a month).
- FHD-native UI (the app is HD and scaled; allowed).
