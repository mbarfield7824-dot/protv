# Fire TV release test results

## Release build identity

- Package: `com.protv.firetv`
- Owner-approved first public release target: version `1.0.0`, code 3.
- Current release build: version `1.0.0`, code 3; unsigned and not an upload candidate.
- Frozen verified RC1 app source: `d2a6965250a9cc928c38c99f175332dbaa04c788`
- Rollback tag: `firetv-rc1-rollback-20261024`
- Physical device: Amazon Fire TV Stick AFTMM, Fire OS device product `mantis`.

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `:app:testDebugUnitTest --rerun-tasks` | PASS | 104 tests, 17 suites, 0 failures/errors/skips; rerun after the version 1.0.0/code 3 update. |
| `:app:lintRelease` | PASS with warnings | 0 errors, 10 warnings. Review lint XML before a production release; warnings include target SDK age and other existing recommendations. |
| `:app:assembleRelease` | BUILD PASS, SUBMISSION FAIL | `com.protv.firetv`, version `1.0.0` / code 3; output is unsigned and is not a production submission artifact. |
| Release APK ZIP alignment | PASS | `zipalign -c 4` succeeded on the current version 1.0.0 APK. |
| Release APK signature | FAIL / unsigned | `apksigner` reports missing signature manifest; do not upload. |
| Release signing configuration | PASS (negative checks) | `signingReport` shows no release signer when credentials are absent; a partial `PROTV_RELEASE_*` configuration is rejected. No real signing credential or keystore was used. |
| Android release unit-test task | Not configured | No `testReleaseUnitTest` task was found. |
| Backend tests | PASS | 261 tests, 0 failures. |
| Frontend tests | PASS | 117 tests, 0 failures. |
| Frontend lint/build | PASS with warning | ESLint passed; Vite production build passed with an existing large-chunk warning. |
| Dependency audits | PASS | Root, backend, and frontend npm audits each report 0 vulnerabilities after compatible dependency updates. |

Current unsigned APK SHA-256: `AA6BE8D12FF77466D40DD1BF0C6B866094C67F76DB84576018106EE032EC9ADB`.

Android unit tests, release lint, release assembly, package/version inspection, alignment, and signing-configuration checks were rerun from the current working tree on 2026-10-24 after the approved version bump. The release has 0 lint errors and 10 warnings, and the `app-release-unsigned.apk` remains unsigned; do not upload it. Backend Firebase Admin usage was migrated to the v14 modular API and the backend test suite passed. The frontend's vulnerable transitive `@grpc/grpc-js` dependency was pinned to a patched compatible 1.x release; no forced Firebase downgrade was used. Backend/frontend sources were unchanged by the release-version update. These changes were not installed on the Firestick or deployed.

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
