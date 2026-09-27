# PROtv Fire TV foundation

Standalone native Kotlin/Compose for TV application. Open this directory in Android Studio or
run `.\gradlew.bat :app:clean :app:assembleDebug` with the Android SDK configured and a JDK
supported by the included Gradle wrapper (Android Studio's bundled JDK is suitable).

`com.protv.firetv.data.api` loads the public, viewer-safe `GET /v1/catalog?view=all` response;
`com.protv.firetv.ui` renders its title rail. Future authentication and playback code belongs
under `com.protv.firetv.auth` and `com.protv.firetv.playback`. The app has no dependency on
the web frontend and contains no Firebase credentials.

Set the public backend base URL at build time with the Gradle property `protvApiBaseUrl` or
environment variable `PROTV_TV_API_BASE_URL`. Include the backend route prefix if there is
one: local Express serves `/v1/catalog`, while Vercel serves `/api/v1/catalog`. For example,
`.\gradlew.bat :app:assembleDebug -PprotvApiBaseUrl=http://localhost:5000/` builds a local
debug client; `localhost` on a TV/emulator means that device, not the build computer. Use an
address reachable from the TV when testing there. Debug builds allow HTTP for local testing;
release builds require an HTTPS base URL. An unset base URL produces an explicit configuration
message in the app rather than a synthetic catalog or a silent fallback. Do not put private
API origins in checked-in Gradle files; the endpoint requires no credentials.

Run `.\gradlew.bat :app:testDebugUnitTest` and then
`.\gradlew.bat :app:clean :app:assembleDebug` to test and clean-build.
Titles use the backend's stable `id` and viewer-safe title, category, and artwork fields.
Coil loads HTTP(S) artwork and decoded base64 JPEG artwork returned by the existing catalog.
Catalog cards are D-pad focusable but do not open detail or playback screens yet.

`minSdk 23` establishes a modern Android TV baseline without claiming compatibility with
older Fire OS devices before device testing. `compileSdk 37` uses the installed Android SDK
for building, not as a Fire TV runtime requirement. `targetSdk 35` targets established
Android 15 behavior rather than adopting API 37 runtime changes without TV testing.
