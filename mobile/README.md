# PROtv Mobile prototype

This is a separate React Native project for the PROtv Mobile 1.0 prototype.
It does not share a build with the website, backend, Roku app, or Fire TV app.
The app is free to watch; no in-app purchases or ads are enabled.

## Run the Android prototype

1. Install Node.js compatible with the Expo SDK in this project.
2. From `mobile/`, run `npm ci`.
3. Run `npx expo start` and scan the QR code with Expo Go on an Android phone,
   or press `a` when an Android SDK/emulator is installed.
4. Without local configuration, the app uses clearly identified sample catalog
   data, local-only My List/progress state, and a public Mux HLS test stream.
   This is not production media, a production login, or a backend write.

The local HLS sample is only for player plumbing. For actual PROtv playback,
set `EXPO_PUBLIC_API_URL` to an approved staging API URL. The app will request
the existing `/v1/catalog/titles/:id/playback` endpoint and use its Mux
playback ID and optional server-generated token. Never add a Mux private key,
Firebase Admin service account, or production secret to this app.

## Firebase and staging setup

Copy `.env.example` to `.env` and populate the `EXPO_PUBLIC_FIREBASE_*` client
configuration values for a dedicated development/staging Firebase app, plus
an HTTPS staging `EXPO_PUBLIC_API_URL`. Client config values are compiled into
the app and are not secrets. Do not copy backend service-account credentials
or production key files. Restart Expo after editing environment values.

Firebase email/password login, registration, verification email, and password
reset are enabled only when the Firebase client configuration is complete.
Favorites, progress, and Creator Portal SSO use the existing authenticated
backend endpoints only when the staging API is configured. The current backend
Creator Portal contract requires a verified email and an email/password or
Google sign-in provider.

## Project architecture

- Expo Router provides shared navigation and responsive screens.
- TypeScript repositories preserve the current catalog, playback,
  favorites/progress, and creator SSO request shapes.
- Expo Video provides native-backed HLS playback on Android and iOS. The
  backend remains responsible for authorization and Mux signing.
- `AdPlaybackAdapter` is a planned integration seam, not an enabled ad
  implementation; launch remains free to watch without paid subscriptions.
- iOS and iPadOS targets are configured from the beginning. iOS builds and
  physical-device validation require macOS or an approved EAS build profile.

## Checks

```powershell
npm run typecheck
npm run export:android
```

Android emulator/device launch requires Android Studio's SDK/ADB and a Java
toolchain. The current development host does not have those installed, so a
local Android APK build is not available here. Do not point the prototype at a
production API or Firebase project.
