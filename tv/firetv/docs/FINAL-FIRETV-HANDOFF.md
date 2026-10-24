# PROtv Fire TV 0.2.0-rc1 handoff

**Status: owner-confirmed RC1 physical checks passed; release/submission blockers remain. Not an Amazon submission.**

## Candidate identity and artifacts

- App: PROtv for Fire TV
- Package: `com.protv.firetv`
- Version: `0.2.0-rc1` / version code `2`
- `minSdk`: 23; `targetSdk`: 35; compile SDK: 37
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Unsigned release APK: `app/build/outputs/apk/release/app-release-unsigned.apk`
- Source branch: `feature/firetv-final-rc-20261024`

Release output is deliberately unsigned. No production signing key is present in this repository. Do not replace the preserved signed APK at `app/release/app-release.apk` with either candidate.

The candidate includes the current native Fire TV app, QR-based viewer account linking, dynamic public catalog, catalog-authorized playback, portrait-safe image presentation, favorites, locally persisted and backend-synced Continue Watching, playback controls and caption menus when streams expose tracks.

## Install and rollback

Use the **debug APK** for physical sideload testing:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb install -r ".\app\build\outputs\apk\debug\app-debug.apk"
& $adb shell monkey -p com.protv.firetv 1
```

`-r` preserves app data only when the installed package's signing certificate is compatible. This local debug candidate uses the local debug key, fingerprint recorded with the build. If installation returns `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, **stop**. Do not uninstall, clear storage, or use `-d` to bypass a signing/version check. Use a separate test device or ask the owner to choose an authorized signing path.

Before install, pull/record the existing package and preference hashes if preserving a test session matters. The signed production APK is preserved at `D:\protv\tv\firetv\app\release\app-release.apk`; its SHA-256 is recorded in the build evidence. A separately preserved last-known debug APK is in the session-state files referenced in the completion report. To roll back in place, install an owner-signed, certificate-compatible APK with an acceptable version code. Never uninstall or clear data as a rollback shortcut.

## Concise physical test checklist

Run on a real supported Fire TV. Record model, Fire OS/API, network and app build.

1. **Install/start:** update without clearing data; cold launch, background/resume and restart.
2. **Sign in:** guest browse; QR/code activation on a second device; auth persists after restart; sign out and confirm guest mode. Do not publish reviewer passwords in this repository.
3. **Home/discovery:** newest-date hero, refresh without APK update, Movies, TV, categories, Search, title metadata and My List. Check the backend's restricted titles remain absent.
4. **Remote/focus:** D-pad in all directions, Select/Back, drawer open/dismiss and focus restoration; Play/Pause, dedicated Pause/Play, seek and speed/audio/subtitle menus without accidental activation.
5. **Continue Watching:** interrupt/restart, sign out/in and (if available) second device; resume correct title/position; verify completed-title behavior and no duplicates. Do not clear app data.
6. **Playback:** eligible movie, episode and supported music/video; buffering/reconnect; captions only where stream tracks exist; close player and verify home scroll/focus returns. Do one longer session with owner approval.
7. **Network/errors:** airplane/offline while browsing and playing, restore Wi-Fi, retry catalog/playback/account sync. Verify visible failure/retry, not a frozen or blank screen.
8. **Visual/stability:** 1080p readability at viewing distance, poster geometry and fallbacks, all focus states, five-plus minute navigation, memory/ANR/logcat crash check.

Capture actual device screenshots of hero, movie and TV rails, Search, details/player controls, account flow and Continue Watching. Keep credentials and personal content out of screenshots/logs.

## Current functionality and intentional TV differences

- Fire TV is a D-pad-first browse/playback client, not a web browser or an authoring workstation. Creator submissions continue in the existing creator portal; the TV sign-in screen offers a browser/QR handoff instead of file upload.
- The app uses the viewer-safe catalog endpoint and requests playback by title ID from the backend. It does not construct an alternative playback authorization path. Signed creator playback tokens are held in memory for the playback request; do not log or save them.
- Category rails and Search operate on the current downloaded public catalog; refresh is explicit. There is no TV-specific season/episode management interface or complex creator editing.
- Account, favorites and watch progress require network access for server synchronization. Local watch progress is a recovery checkpoint, not a competing server history.
- Captions/audio tracks appear only when present in the stream. Playback tests on eligible content and availability of caption tracks remain physical-review tasks.

## Amazon Appstore preparation (not submission)

Official references checked 2026-10-24:

- [Submission overview](https://developer.amazon.com/docs/app-submission/understanding-submission.html)
- [Fire OS device filtering and Fire TV compatibility](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html)
- [Fire TV app test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html)
- [App listing details and image assets](https://developer.amazon.com/docs/app-submission/appstore-details.html)
- [Submission workflow](https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html)

Current manifest declares Leanback, marks touchscreen optional, sets landscape, and requests Internet only. `minSdk 23` excludes API-22 Fire TV devices; confirm the intended supported-device list in Developer Console and with the owner. The APK must be manually matched to supported devices in that console; the manifest alone does not enroll every Fire TV.

Before submission, the owner/developer account must:

- Complete the Amazon developer account, target-device selection, product listing and pricing choice.
- Upload a properly production-signed, zip-aligned binary; protect the signing key outside source control. The release APK here is unsigned.
- Supply owner-approved app icons, Fire TV screenshots, and listing text. The existing `tv_icon`/`tv_banner` are launcher assets, not a verified substitute for all requested marketing assets.
- Review Amazon content policy, trademark/IP/territory rights for the live catalog, and any required documentation. The app must not expose titles restricted by current backend rules.
- Approve accurate privacy disclosures. The current website [Privacy page](https://watchprotv.com/privacy) discusses account details, My List, providers and a support contact; its wording should be reviewed against TV Firebase authentication, favorites, watch-progress synchronization, and any analytics actually enabled. No account deletion API/in-app deletion flow was found in this code snapshot; the published Privacy page directs account/privacy questions to `support@watchprotv.com`. Obtain owner/legal confirmation of the user deletion process before store submission.
- Prepare reviewer access instructions using an owner-authorized test account, eligible non-restricted content, network requirements and QR/code sign-in. Do not invent or commit test credentials.
- Confirm content rating, marketplace availability, business/contact details, and all legal approvals with the owner. This handoff assigns no rating and creates no legal approval.

### Draft store listing (owner/legal review required)

**Display title:** PROtv

**Short description:** Browse eligible movies and entertainment, manage your list, and continue watching on your Fire TV.

**Long description:** PROtv brings a television-friendly catalog of eligible movies and other supported video to Fire TV. Browse featured titles and categories, search the catalog, save favorites, and resume supported playback. Sign in by linking your account from a phone or computer, or browse as a guest. Catalog availability and playback depend on current rights, account and network authorization.

Do not publish this draft until owner approves product claims, catalog rights, territories, privacy language and imagery. It makes no claim that the service is permanently ad-free.

### Marketing asset checklist

- Verify large/small icon dimensions and transparency against the current Amazon image-asset guide.
- Capture fresh actual Fire TV screenshots at required resolutions; no mockups substituted for app screenshots.
- Include Home/hero, category rail, Search, details, player controls/captions if available, and sign-in/guest flow.
- Check every screenshot for private account details, restricted titles and misleading promotional claims.
- Optional promotional image/video only after owner approval. No purchase or submission was made.

## Build, test and release sequence

From `tv/firetv` with a configured JDK 25/Android SDK and local ignored Firebase configuration:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease --console=plain --no-daemon --max-workers=2
```

Set `PROTV_TV_API_BASE_URL=https://watchprotv.com/api/` for the HTTPS release endpoint. Do not commit local configuration or credentials. Confirm the APK package/version, supported ABIs, manifest and SHA-256; compare the debug signature before updating an existing app.

### Validation evidence (2026-10-24)

- The command above completed successfully: **103 unit tests across 17 suites**, with 0 failures, errors or skips; `lintDebug`, `assembleDebug` and `assembleRelease` also completed.
- Lint reported **0 errors and 10 warnings**: target SDK 35, six dependency-update advisories, fixed orientation on newer Android, deprecated `allowBackup`, and the densityless TV banner. These were not changed without device/platform compatibility review. The SDK command-line tools also warned that they encountered SDK XML v4 while supporting through v3.
- Watch-progress reconciliation tracks pending local writes and the server timestamp they were based on. A pending offline update is replayed only if that server baseline is unchanged; a newer remote update wins regardless of TV clock skew. Successful writes adopt the backend `updatedAt`, and failed writes remain available for retry.
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`; SHA-256 `4377A6C2E0505BDF37B1679AFED1F5349FB8D2D63D2131507B68AA1B4AAAF239`. Package/version: `com.protv.firetv`, `0.2.0-rc1` (2), min/target SDK 23/35. APK signature and zip alignment verified. Debug signer SHA-256: `d1fd4ef346ccd1bc94e690d49e448640b863f5374157b426e8b6c97a91bf30d2`.
- Release output: `app/build/outputs/apk/release/app-release-unsigned.apk`; SHA-256 `CBA8CCC70BCB05CAB04FA3EF27166DF24DD75CFF767D33ED1C16882645A4E565`. It is zip-aligned but **unsigned**, so it is not an installable production release.
- Read-only live check returned 49 eligible titles (44 movies, 5 episodes). All seven records currently marked `rights-verification-required` were absent from the catalog; each title-detail and playback-by-ID request returned 404. No media was played. The backend's `releaseEligible`/viewer-catalog filter remains authoritative.
- Playback diagnostics now report only an error class/code, not exception traces that could include a signed stream URL or token.
- No ADB device was attached during the initial candidate validation, so those results did not establish installed-app certificate compatibility or physical Fire TV behavior.

### RC1 homepage scroll correction (2026-10-24)

- Root cause: when UP moved focus from a rail into the hero, the focused control's bring-into-view request scrolled the tall first list item to expose that control, leaving the hero's upper content clipped.
- On hero focus, the existing home list now animates to item 0 with the list's natural zero offset. Normal row focus, layout, and sidebar behavior are unchanged.
- Added a regression test that enters hero focus from a lower row and verifies the top-restoration request is emitted.
- Revalidated: **104 unit tests across 17 suites**, 0 failures/errors/skips; lint and debug assembly succeeded.
- Installed the corrected debug APK in place on AFTMM after confirming the signer matches. Existing app data was preserved (`firstInstallTime` unchanged); the installed app launched successfully as `0.2.0-rc1` / version code 2.
- Corrected debug APK SHA-256: `5C3926EA217AE08D2B828F09F685510D5420509F0084501673B8BAE04CC76CE7` (same debug signer fingerprint listed above).
- ADB D-pad traversal reached the bottom row and returned to the top; device screenshots showed the full hero, featured content, and first rail. Opening and dismissing the drawer from the lower rows preserved the scroll position. The owner then physically verified scrolling and drawer behavior on the Firestick and confirmed the fix looks good.

## RC1 freeze and Amazon readiness review (2026-10-24)

### Owner-reported physical validation

The owner confirmed **9/9** checks passed on the Firestick:

1. Homepage and posters
2. Featured titles
3. Sidebar navigation
4. OK pause/resume
5. Play/Pause button
6. Seeking and Back
7. Playback overlay dismissal
8. Continue Watching after restart
9. My List and login

These are owner-reported results, not independently repeated during this release audit. The scroll and drawer behavior were separately verified on the device and confirmed by the owner.

### Freeze and build evidence

- Frozen source: `d2a6965250a9cc928c38c99f175332dbaa04c788` on `feature/firetv-final-rc-20261024`.
- Rollback tag: `firetv-rc1-rollback-20261024`, pushed to `origin` at the frozen source commit.
- Re-ran `:app:testDebugUnitTest`: **104 tests, 17 suites, 0 failures, 0 errors, 0 skipped**.
- `:app:lintRelease` completed with **0 errors and 10 warnings**. `:app:assembleRelease` completed, but its APK is unsigned. No `testReleaseUnitTest` task is configured.
- Current unsigned release APK SHA-256: `16D637CF361E16091E4C6531C1954CB8807ED3F50421C864E3F9B0FCFEEB543A`. It passes zip alignment and does not pass APK signature verification.
- No signing keystore or release signing configuration was found in the Fire TV project. A separately preserved signed APK in the other local checkout is package `com.protv.firetv`, version `0.1.0` / code `1`; it is not the current RC1 build and its private signing key is not present in the project. Do not use it as the release candidate.
- The installed RC1 app and app data were not changed during this audit. No catalog records, production services, Roku files, or signed APKs were changed.

### Amazon Appstore checklist

Official references: [presubmission checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html), [device filtering](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html), [listing details and image requirements](https://developer.amazon.com/docs/app-submission/appstore-details.html), [privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html), and [account/data deletion information](https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html).

- **Identity and compatibility:** package `com.protv.firetv`; current RC is `0.2.0-rc1` / code `2`, min/target/compile SDK `23/35/37`. The manifest declares the Leanback launcher, optional touchscreen, landscape, and Internet only. `minSdk 23` excludes API-22 Fire OS 5 devices; choose and verify the supported device set in Developer Console. The Amazon documentation reviewed describes manifest-based device filtering but does not establish a fixed current numeric target-SDK threshold; confirm the console's current checks. Final production version/name and version code remain to be approved and checked against the console.
- **Amazon assets:** Amazon's Fire TV listing guide specifies a 1280x720 PNG app icon, 3–10 1920x1080 landscape screenshots, and a 1920x1080 landscape background image. The project has a 320x180 launcher banner and a vector launcher icon; these are not the required store assets. Seven authentic 1920x1080 Firestick captures exist in the local session evidence directory, but they mainly show home/scroll/drawer states; choose and approve a representative, diverse set and prepare the store icon/background. Draft listing copy is in this document; it is not approved.
- **Rating and reviewer access:** content-rating questionnaire, marketplace/territory selection, support details, and an owner-authorized reviewer account/instructions are not completed. No rating or credentials have been invented.
- **Privacy and deletion:** the TV app uses Firebase Authentication and backend account/favorites/watch-progress services. Amazon's privacy-label questionnaire must reflect the app and its third-party SDKs; the current published Privacy page does not explicitly cover TV watch progress or provide a clear deletion-request page. The reviewed app/backend source contains no account-deletion flow. Amazon says apps that allow account creation must provide a web page for account-deletion requests; its console deletion questions are currently optional, and apps without submitted information are identified as not sharing it. Verify an actual deletion-request process and URL, then obtain owner/legal approval before completing or publishing disclosures.
- **Rights:** the 2026-10-24 Roku rights report records 49 titles live and seven already restricted. Preserve those seven restrictions. Among the live titles, the report still lists material open items and unresolved/re-review categories; this audit made no catalog changes. Owner/counsel must approve the actual launch catalog and territories before submission.
- **Binary and signing:** the current release build is unsigned. Obtain the private key matching the intended Amazon package signing identity (or owner approval for a new identity only if no existing listing/update identity must be preserved), configure signing securely outside source control, rebuild, and verify the final signature. Do not submit the debug or unsigned APK.

## Known limits and blockers

- The corrected RC1 APK remains installed on an AFTMM Firestick. The owner reports all nine RC1 physical checks passed; only the scroll/drawer checks were separately reverified during the recent fix work.
- No build artifact is production-signed; do not submit or install the unsigned release.
- Release signing, final launch-rights approval, privacy/deletion disclosures, content rating, supported-device selection, listing assets/text, and reviewer access remain outstanding.
- Static/unit tests cannot prove device decoding, HDMI audio, actual remote behavior, live auth acceptance, stream tracks, or Appstore acceptance.

## Rollback

Do not clear app data. Reinstall only an APK signed by the same key as the installed app and accepted by Android's version rules. Keep the previous artifact and its SHA-256 before the update. If signing or version checks fail, stop and use a separate device; do not uninstall or replace the signed release with the debug key.
