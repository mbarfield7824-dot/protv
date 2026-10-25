# PROtv Fire TV 1.0.0 (code 5): release checklist

Updated 2026-10-25. `[x]` done and verified · `[ ]` open · **OWNER** needs the owner.

## Phase 1: Secure the release
- [x] Upload key: alias `protv-amazon-upload`, certificate `3014…5a7f`; original on C: (`%LOCALAPPDATA%\PROtv\firetv-signing`)
- [x] D: backup verified 2026-10-25 12:00:48: archive `7b5e7d69…37c0cd` restored, restored keystore hash matches the original (`d3b918ee…4bcc`), opened with the stored credentials, alias and certificate match. Log: `D:\protv-firetv-artifacts\key-backup-log.txt`
- [ ] **OWNER** Password-manager entry checked with `Backup-ProtvFireTvKey.ps1 -CheckPasswordEntry` (MATCH)
- Note: `D:\PROtv-signing\protv-release.jks` is a different, older keystore (probably the 0.1.0 key). Keep it.

## Phase 2: Finalize the source
- [x] Code 4 changes (`f0d8e92`): targetSdk 36, Back opt-out, on-screen web links, deletion card, empty sections hidden
- [x] Code 5 fix (`7ff427f`): menu section-switch crash and Settings focus (found on the Firestick)
- [x] 109/109 unit tests, lint 0 errors; branch `feature/firetv-final-rc-20261024`, not merged to main
- [x] Signed APK code 5: SHA-256 `08df95f7d48b18222e9d63b6e5c121e67033302ddf80e39c1a995044283152d5`, v1+v2, signer `3014…5a7f`

## Phase 3: Physical Firestick test
- [x] Device identified: AFTMM, serial G070VM2213661NEC, Fire OS 6.7.1.1, 192.168.1.218
- [x] Debug RC (code 2) APK and package record preserved; owner approved the uninstall
- [x] Uninstalled the debug RC; installed code 4; installed code 5 over it; installed APK hash matches
- [x] 14 of 23 checks PASS (see `physical-test-checklist.md`); code-4 crash fixed and regression-tested on code 5
- [ ] **OWNER** Sign-in checks #13–#20 (needs a phone and a PROtv account)

## Phase 4: Store assets
- [x] Listing text, features, keywords, release notes (`store-listing.md`)
- [x] Icon 1280×720 and background 1920×1080 meet spec
- [x] Five 1920×1080 24-bit PNG screenshots from code 5 in `screenshots/`
- [ ] **OWNER** Confirm the catalog posters and film frames shown may be used in the store listing

## Phase 5: Content and privacy compliance
- [x] Privacy label answers from APK dependencies and backend data (`amazon-console-answers.md` §3)
- [x] Account deletion URL and Privacy Policy URL live and recorded
- [x] Catalog rating inventory: 49 titles, 2 rated (PG, TV-MA), 47 unrated
- [x] Per-title rights and artwork review for Amazon (`AMAZON-LAUNCH-CATALOG.md`): A 28 / B 6 / C 15; the old "8 cleared" list is superseded
- [x] Found: the Fire TV app shows no CC BY attribution for the 4 Blender films; 3 posters need replacing; 6 thumbnails point at Google image caches
- [ ] **OWNER** Launch catalog decision (recommended: group A via a Fire TV allowlist; needs a backend deploy and app code 6)
- [ ] **OWNER** Creator schedules cover Amazon; artwork origin and tool terms
- [ ] **OWNER** Dead Air content facts (the only open rating fact with group A)
- [ ] Retake the store screenshots once the catalog is limited

## Phase 6: Developer Console
- [ ] **OWNER** Browser access for Claude (no browser tool in this session), or owner enters `amazon-console-answers.md` §0–§6
- [ ] Upload code-5 APK; check per-device compatibility; deselect Vega OS
- [ ] Listing text, images, privacy label, deletion URL, rating, pricing (Free), US-only
- [ ] **OWNER** Non-admin reviewer account entered in the console
- [ ] Save and clear all validation errors

## Phase 7: Live App Testing
- [ ] Create a LAT release with code 5; add the owner as tester
- [ ] Install the Amazon-distributed build on the Firestick (uninstall the code-5 sideload first; Amazon re-signs the app)
- [ ] Sign-in, playback and navigation on the Amazon-signed build
- [ ] Fire OS 16: **untested** (no Fire OS 16 device or API 36 emulator available)

## Phase 8: Submission
- [ ] **OWNER** Final approval
- [ ] Binary confirmed as code 5 (`08df95f7…52d5`); submit; record confirmation
