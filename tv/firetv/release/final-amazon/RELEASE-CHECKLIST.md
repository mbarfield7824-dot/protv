# PROtv Fire TV 1.0.0 (code 4): release checklist

Updated 2026-10-25. `[x]` done and verified · `[ ]` open · **OWNER** needs the owner.

## Phase 1: Secure the release
- [x] Signed APK matches SHA-256 `e52fea8c45c54bfc4f60bd34d7f67e4d70064f4e43fc837e79fef7df36bbe0b9`
- [x] Signer is the PROtv Amazon upload key (`3014…5a7f`); keystore opened, alias `protv-amazon-upload`
- [x] Backup script prepared: `D:\protv-firetv-artifacts\tools\Backup-ProtvFireTvKey.ps1` (7-Zip AES-256 archive + hash + restore test; no secrets printed)
- [ ] **OWNER** Passwords saved in password manager
- [ ] **OWNER** Backup 1 verified (USB drive)
- [ ] **OWNER** Backup 2 verified (second USB drive, stored separately)

## Phase 2: Finalize the source
- [x] Code-4 changes reviewed; 109/109 unit tests, lint 0 errors
- [x] Committed to `feature/firetv-final-rc-20261024` as `f0d8e92` (Fire TV app files only); not merged to main
- [x] Release documentation updated to code 4 with checksum, signer and provenance

## Phase 3: Physical Firestick test (option B)
- [x] Prior debug RC APK and code-3 APK preserved with checksums
- [ ] **OWNER** Approve uninstalling the debug RC; enable ADB debugging and give the Firestick IP
- [ ] Confirm device identity (model AFTMM, serial) before uninstalling
- [ ] Uninstall `com.protv.firetv`; install signed code 4; confirm version 1.0.0 / code 4 and launch
- [ ] Capture logcat (filtered to the app; no credentials)
- [ ] **OWNER** Run `physical-test-checklist.md` (23 checks)

## Phase 4: Store assets
- [x] Listing text, features, keywords, release notes (`store-listing.md`)
- [x] Icon 1280×720 and background 1920×1080 meet spec
- [ ] Capture 1920×1080 screenshots from code 4: Home, Search, Playback, Sign-in QR, Settings
- [ ] **OWNER** Confirm screenshots may show catalog posters (see Phase 5)

## Phase 5: Content and privacy compliance
- [x] Privacy label answers from APK dependencies and backend data (`amazon-console-answers.md` §3)
- [x] Account deletion URL and Privacy Policy URL live and recorded
- [x] Catalog rating inventory: 49 titles, 2 rated (PG, TV-MA), 47 unrated
- [ ] **OWNER** Confirm the 49 live titles and US-only territory for Amazon
- [ ] **OWNER** Content facts for Dead Air, The Bundy Chronicles, Sita Sings the Blues (rating questionnaire)

## Phase 6: Developer Console
- [ ] **OWNER** Browser access for Claude, or owner enters the prepared answers
- [ ] Upload code-4 APK; check per-device compatibility; deselect Vega OS
- [ ] Listing text, images, privacy label, deletion URL, rating, pricing (Free), US-only
- [ ] **OWNER** Non-admin reviewer account entered in the console
- [ ] Save and clear all validation errors

## Phase 7: Live App Testing
- [ ] Create a LAT release with code 4; add the owner as tester
- [ ] Install the Amazon-distributed build on the Firestick (needs the code-4 sideload removed first)
- [ ] Sign-in, playback and navigation on the Amazon-signed build
- [ ] Fire OS 16: **untested** (no Fire OS 16 device or API 36 emulator available)

## Phase 8: Submission
- [ ] **OWNER** Final approval
- [ ] Binary confirmed as code 4; submit; record confirmation
