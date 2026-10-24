# Fire TV release test results

## Current candidate identity

- Package: `com.protv.firetv`
- Version: `0.2.0-rc1`, code 2
- Frozen app source: `d2a6965250a9cc928c38c99f175332dbaa04c788`
- Rollback tag: `firetv-rc1-rollback-20261024`
- Physical device: Amazon Fire TV Stick AFTMM, Fire OS device product `mantis`.

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `:app:testDebugUnitTest --rerun-tasks` | PASS | 104 tests, 17 suites, 0 failures/errors/skips. |
| `:app:lintRelease` | PASS with warnings | 0 errors, 10 warnings. Review lint XML before a production release; warnings include target SDK age and other existing recommendations. |
| `:app:assembleRelease` | BUILD PASS, SUBMISSION FAIL | Output is unsigned. It is not a production submission artifact. |
| Release APK ZIP alignment | PASS | `zipalign -c 4` succeeded. |
| Release APK signature | FAIL / unsigned | `apksigner` reports missing signature manifest; do not upload. |
| Release signing configuration | PASS (negative checks) | `signingReport` shows no release signer when credentials are absent; a partial `PROTV_RELEASE_*` configuration is rejected. No real signing credential or keystore was used. |
| Android release unit-test task | Not configured | No `testReleaseUnitTest` task was found. |
| Backend tests | PASS | 261 tests, 0 failures. |
| Frontend tests | PASS | 117 tests, 0 failures. |
| Frontend lint/build | PASS with warning | ESLint passed; Vite production build passed with an existing large-chunk warning. |
| Dependency audits | PASS | Root, backend, and frontend npm audits each report 0 vulnerabilities after compatible dependency updates. |

Current unsigned APK SHA-256: `28C84B6143C91A0184D29B764B4C1056ECEFFF03A542F2CEC35054D3F36278E0`.

Android unit tests, release lint, release assembly, and signing-configuration checks were rerun from the current working tree on 2026-10-24. The release has 0 lint errors and 10 warnings, and the `app-release-unsigned.apk` remains unverified/unsigned; do not upload it. Backend Firebase Admin usage was migrated to the v14 modular API and the backend test suite passed. The frontend's vulnerable transitive `@grpc/grpc-js` dependency was pinned to a patched compatible 1.x release; no forced Firebase downgrade was used. These are validation/preparation changes only; they were not installed on the Firestick or deployed.

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

The homepage scroll fix was separately installed in place, retained the existing app data, and was physically confirmed by the owner. During this release-package work, the connected device was read-only checked: package `com.protv.firetv`, version 0.2.0-rc1/code 2; `firstInstallTime` remained 2026-09-27 and `lastUpdateTime` 2026-10-24 17:26. No new APK was installed and no content was played.

## Firestick screenshots

Selected authentic 1920x1080 device captures are in `artwork/`. They were copied from the session evidence folder and are not generated mockups. Review any visible catalog title/poster rights before using these images in a public store listing.
