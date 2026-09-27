# PROtv Fire TV foundation

Standalone native Kotlin/Compose for TV application. Open this directory in Android Studio or
run `.\gradlew.bat :app:clean :app:assembleDebug` with the Android SDK configured and a JDK
supported by the included Gradle wrapper (Android Studio's bundled JDK is suitable).

The only implemented package is `com.protv.firetv.ui`. Future code belongs under
`com.protv.firetv.data.api` (PROtv backend API contract), `com.protv.firetv.auth`, and
`com.protv.firetv.playback`; no network, authentication, or playback behavior is present yet.
This project has no dependency on the web frontend.

`minSdk 23` establishes a modern Android TV baseline without claiming compatibility with
older Fire OS devices before device testing. `compileSdk 37` uses the installed Android SDK
for building, not as a Fire TV runtime requirement. `targetSdk 35` targets established
Android 15 behavior rather than adopting API 37 runtime changes without TV testing.
