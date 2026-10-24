# Fire TV release test results

## Release build identity

- Package: `com.protv.firetv`
- Owner-approved first public release target: version `1.0.0`, code 3.
- Current release build: version `1.0.0`, code 3; signed with the new owner-authorized upload key.
- Frozen verified RC1 app source: `d2a6965250a9cc928c38c99f175332dbaa04c788`
- Rollback tag: `firetv-rc1-rollback-20261024`
- Physical device: Amazon Fire TV Stick AFTMM, Fire OS device product `mantis`.

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `:app:testDebugUnitTest --rerun-tasks` | PASS | 104 tests, 17 suites, 0 failures/errors/skips; rerun after the account screen update. |
| `:app:lintRelease` | PASS with warnings | 0 errors, 10 warnings. Review lint XML before a production release; warnings include target SDK age and other existing recommendations. |
| `:app:assembleRelease` | PASS | Signed package `com.protv.firetv`, version `1.0.0` / code 3. |
| Release APK ZIP alignment | PASS | `zipalign -c 4` succeeded. |
| Release APK signature | PASS | `apksigner` verifies v1 and v2 signatures. |
| Release signing configuration | PASS | Dedicated RSA-3072 PKCS#12 upload key; public certificate fingerprint below. Key and DPAPI-encrypted credential file are outside Git with restrictive ACLs. |
| Android release unit-test task | Not configured | No `testReleaseUnitTest` task was found. |
| Backend tests | PASS | 262 tests, 0 failures, including recent/revoked-auth and idempotent deletion-request coverage. |
| Frontend tests | PASS | 120 tests, 0 failures, including request-page, confirmation, and reauthentication states. |
| Frontend lint/build | PASS with warning | ESLint passed; Vite production build passed with an existing large-chunk warning. |
| Dependency audits | PASS | Root, backend, and frontend npm audits each report 0 vulnerabilities after compatible dependency updates. |

## Revalidation on 2026-10-24

| Check | Result | Notes |
|---|---|---|
| Android `:app:testDebugUnitTest --rerun-tasks` | PASS | 104 tests, 0 failures/skips. |
| Android `:app:lintRelease` | PASS with warnings | 0 errors; 10 existing warnings. No Android source was changed in the current account-review work. |
| Existing signed APK | PASS | SHA-256 unchanged; `apksigner` verified v1 and v2, one signer, certificate fingerprint matches the recorded upload certificate; `zipalign -c -v 4` passed. |
| APK package metadata | PASS | `com.protv.firetv`, versionName `1.0.0`, versionCode `3`, minSdk `23`, targetSdk `35`; Fire TV launcher feature and activity present. |
| Merged release permissions | REVIEWED | APK declares `INTERNET`, `ACCESS_NETWORK_STATE`, Google `READ_GSERVICES`, `WAKE_LOCK`, and app-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. The source app manifest itself declares only `INTERNET`; remaining permissions are merged from dependencies. |
| Backend full suite | PASS | 267 tests, 0 failures, including deletion admin authorization, user-only status, duplicate submission, status transitions, audit history, creator-linkage verification, and completion gating. |
| Frontend full suite | PASS | 122 tests, 0 failures, including admin request review and requester status. |
| Frontend lint/build | PASS with warning | Lint passed; Vite build passed with the existing large-chunk warning. |
| Amazon assets | PASS for technical dimensions | Four real device captures are 1920x1080, 8-bit RGB PNGs; Fire TV app icon is 1280x720 and background 1920x1080, both 8-bit RGB PNGs. Catalog art rights remain an approval blocker for public use. |
| Signing backup | PENDING | Signing files have restricted local ACLs, but no owner-controlled, separate offline backup destination was available; no backup or restore test was performed. |

Signed APK: `tv/firetv/app/build/outputs/apk/release/app-release.apk`

APK SHA-256: `CABFA00EDFDC0E565E5F8BD08E22DB3A4AA2A3A9ACFE19919966A14E01940301`

Upload signer certificate SHA-256: `301433275FDC7D791DCFC6C436499C2B517586DE9548EEF021F7C2A8482115A7F`

The signed build was checked with `apksigner`, `zipalign`, and `aapt`: `com.protv.firetv`, version `1.0.0`/code `3`, minSdk `23`, targetSdk `35`. Amazon's current Fire OS 16 documentation identifies API 36 as the OS base and says targets below API 24 might be blocked, while API 24–27 can show a compatibility warning; target 35 is above that documented floor. The package-specific device result still cannot be confirmed in Developer Console until the binary is uploaded. The local upload key uses alias `protv-amazon-upload`; its private key and password were never copied to Git or printed. The APK was not uploaded to Amazon.

The currently installed Firestick remains on the previously owner-verified debug RC1 (`0.2.0-rc1`/code `2`), last update time `2026-10-24 17:26`. Its debug certificate differs from the new production upload certificate, so this signed APK must not be sideloaded as an in-place update. No APK was installed and no app data was changed.

The website request page, Fire TV account entry point, and canonical Admin Command Center review section are implemented in this branch. The backend records idempotent `pending_review` requests after recent interactive authentication and revocation checking, restricts admin review to the existing Firebase admin claim, and records request/status history with actor UID, reason, and timestamps. Admin approval does not perform deletion; Completed is blocked without a fulfillment verifier. Creator project/content/contract mapping, statutory deadline, and retention are explicitly flagged for verification. No deployment occurred. Actual fulfillment awaits the decisions and cross-service data work in `privacy-data-review.md`.

Android validation was rerun from the current working tree on 2026-10-24. Backend Firebase Admin usage was migrated to the v14 modular API and the backend suite passed. The frontend's vulnerable transitive `@grpc/grpc-js` dependency was pinned to a patched compatible 1.x release; no forced Firebase downgrade was used.

The signed historical APK is package `com.protv.firetv`, version `0.1.0` / code 1, SHA-256 `07FAE38C9B875907CA953F612DFB03175A73ABD452EC2EAA35A68AA935ADA92F`, signer SHA-256 `c24578b1e19db01745712b289bc9a944009da2633a39334ccc44fbb0491f7e91`. It is not the current source build; no matching private key was found in the searched project, Gradle, Android, Documents, Downloads, or Desktop locations. Do not treat it as the current release.

## Physical verification

Owner reported all nine checks passed for RC1:

1. Homepage and posters
2. Featured titles
3. Sidebar navigation
4. OK pause/resume
5. Play/Pause button
6. Seeking and Back
7. Playback overlay dismissal
8. Continue Watching after restart
9. My List and login

The homepage scroll fix was separately installed in place, retained the existing app data, and was physically confirmed by the owner. During this release-package work, the connected device was read-only checked: package `com.protv.firetv`, version 0.2.0-rc1/code 2; `firstInstallTime` remained 2026-09-27 and `lastUpdateTime` 2026-10-24 17:26. No new APK was installed and no content was played. The 1.0.0/code 3 build has not been installed.

## Firestick screenshots

Selected authentic 1920x1080 device captures are in `artwork/`. They were copied from the session evidence folder and are not generated mockups. Review any visible catalog title/poster rights before using these images in a public store listing.
