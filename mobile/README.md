# PROtv Mobile 1.0

This is the separate React Native project for PROtv Mobile.
It does not share a build with the website, backend, Roku app, or Fire TV app.
The app is free to watch; no in-app purchases or ads are enabled.

## Run Android development builds

1. Install Node.js compatible with the Expo SDK in this project.
2. From `mobile/`, run `npm ci`.
3. To build, install, and launch the native Android development app, run
   `npx expo run:android` from `mobile/` with an Android SDK, ADB, and a
   compatible Java toolchain configured. To use Expo Go instead, run
   `npx expo start` and scan its QR code on an Android phone.
4. Copy `.env.example` to ignored `.env.local` and supply the approved HTTPS API
   base URL (including `/api` where applicable) and Firebase **client** configuration.
   The approved deployment is `https://watchprotv.com/api`.
   Set `EXPO_PUBLIC_DEMO_MODE=true` explicitly to use fixture content instead.
   Live failures show an error/retry state and never silently switch to fixtures.

The local HLS sample is only for player plumbing. For actual PROtv playback,
set `EXPO_PUBLIC_API_URL` to an approved API URL. The app will request
the existing `/v1/catalog/titles/:id/playback` endpoint and use its Mux
playback ID and optional server-generated token. Never add a Mux private key,
Firebase Admin service account, or production secret to this app.

## Firebase and account configuration

Populate the `EXPO_PUBLIC_FIREBASE_*` client configuration values for the
approved Firebase project, plus an HTTPS `EXPO_PUBLIC_API_URL`. Client config values are compiled into
the app and are not secrets. Do not copy backend service-account credentials
or production key files. Restart Expo after editing environment values.

Firebase email/password login, registration, verification email, and password
reset are enabled only when the Firebase client configuration is complete.
Favorites, progress, and Creator Portal SSO use the existing authenticated
backend endpoints only when the API is configured. The current backend
Creator Portal contract requires a verified email and an email/password or
Google sign-in provider.

The approved Creator Portal origin is `https://creators.watchprotv.com`.
The app opens the existing server-issued SSO URL in the system browser and
rejects other origins; it does not implement a second Creator Portal.

Account & privacy includes profile updates, verification email, password reset,
sign-out, the approved privacy policy, and a deletion support request.
`EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` must remain false until the separately
reviewed `DELETE /users/me` backend is approved, deployed, and validated. It
requires recent password reauthentication and removes the viewer profile and
Firebase account. Administrative/creator claims require support review.
The supplied `/delete-account` website path is not a verified deletion workflow.
This backend gate and the mobile gate are independent and both default off.

## Signed Android builds

Create ignored `.env.signing.local.json` with `storePassword` and `keyPassword`
(at least 12 characters). Keep it restricted to your Windows account.
Run:

```powershell
.\scripts\build-android-release.ps1
```

The script generates a private RSA upload key only if one does not already exist,
then builds the standalone APK and AAB for ARM64 and x86_64. The config plugin
persists release signing through native regeneration and rejects missing release
signing variables instead of falling back to the debug key.

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Private key: `.local-release/protv-upload.jks` (**never commit or distribute**).

Back up the key and passwords securely; future updates must preserve signing
identity. A release APK does not need Metro. Replacing a debug-signed installation
with the upload-signed APK requires uninstalling the debug app first.

The app icon uses the supplied blue PROtv artwork. The standard icon is a
1024-pixel square; the Android adaptive foreground includes transparent padding
to protect the wordmark under launcher masks. No monochrome icon is configured,
so Android themed-icon support is not claimed. Icon/config changes require a
native rebuild without `-SkipPrebuild`.

This Windows workstation previously required short native-module junctions at
`D:\g`, `D:\r`, `D:\s`, and `D:\t` to avoid CMake path limits. Dependency installation
may replace those junctions; restore them only after checking package versions.

## Project architecture

- Expo Router provides shared navigation and responsive screens.
- TypeScript repositories preserve the current catalog, playback,
  favorites/progress, and creator SSO request shapes.
- Expo Video provides native-backed HLS playback on Android and iOS. The
  backend remains responsible for authorization and Mux signing.
- Native player controls support seeking; saved progress is restored below the
  completion threshold and synced on pause, exit, background, and periodically.
  Series episodes are sorted by season/episode, with an explicit next-episode
  action after completion. Playback errors offer a retry with a fresh Mux URL.
- `AdPlaybackAdapter` is a planned integration seam, not an enabled ad
  implementation; launch remains free to watch without paid subscriptions.
- iOS and iPadOS targets are configured from the beginning. iOS builds and
  physical-device validation require macOS or an approved EAS build profile,
  Apple signing credentials, and actual iPhone/iPad acceptance tests.
  Native Firebase persistence is platform-specific so server exports do not
  execute React Native-only Firebase APIs.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
```

Android emulator/device launch requires Android Studio's SDK/ADB and a Java
toolchain. The native debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.

## Remaining release gates

- Dedicated test-account verification of registration, recovery, persisted login,
  My List/progress sync, account management, and verified-email Creator SSO.
- Deletion deployment approval, complete data-retention review (including Creator
  Portal records), end-to-end deletion tests, and a real public deletion page.
- Owner-approved privacy text, Google Play Data Safety declarations, store listing,
  D-U-N-S/developer registration, and physical phone/tablet verification.
- Dependency audit still reports Zod and deepmerge advisories with no compatible
  patched version in the current Expo/Firebase dependency chain. Do not force
  Expo/Firebase downgrades or override Zod 3 with incompatible Zod 4.
- Apple credentials, macOS build/signing, and iOS/iPadOS device verification.

Free viewing remains enabled. No advertisement SDK, billing, subscriptions,
background audio, microphone, or storage permission is enabled for launch.

## Android release-candidate acceptance

The upload-signed 1.0.0 APK/AAB were built locally and their signatures verified.
The standalone APK was installed on the API 36 x86_64 Pixel emulator with Metro
stopped. Live acceptance covered the 51-title approved catalog (46 movies,
5 episodes), artwork, Search, API-derived categories, series details,
My PROtv guest state, account/privacy navigation, login UI, and Creator guest
access rejection. A real Mux catalog episode played; native pause/resume and a
seek from approximately 84 to 517 seconds worked. Landscape controls were fully
visible. Phone portrait/landscape and tablet-sized emulator layouts were checked.
The final APK displayed the corrected 23-minute episode runtime and "Not rated"
for missing ratings. No fatal JavaScript/native error was observed during these
checks. API contract tests and the undeployed backend deletion/progress tests passed.

This is a release candidate, not an assertion of store readiness. Authenticated
account actions, cross-device synchronization, Creator SSO, deletion, physical
Samsung tablet behavior, and iOS remain unverified. No production mutation,
backend deployment, or store submission was performed.
