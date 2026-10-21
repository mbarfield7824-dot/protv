# PROtv Fire TV foundation

Standalone native Kotlin/Compose for TV application. Open this directory in Android Studio or
run `.\gradlew.bat :app:clean :app:assembleDebug` with the Android SDK configured and a JDK
supported by the included Gradle wrapper (Android Studio's bundled JDK is suitable).

`com.protv.firetv.data.api` loads the public, viewer-safe `GET /v1/catalog?view=all` response;
`com.protv.firetv.ui` groups it into PROtv category rails (`ui.home.buildCategoryRails`) on a
single TV home screen themed with the locked PROtv palette (`ui.theme`). Selecting a title calls the public
`GET /v1/catalog/titles/{id}/playback` endpoint via `com.protv.firetv.playback`, validates
the on-demand response, and plays its Mux HLS stream with Media3, including the
short-lived playback token returned for released signed creator media. Remote keys reach the
player before focus routing (`playback.PlayerRemoteKeyPolicy`), so they work regardless of
which control holds focus: the Play/Pause button toggles playback, Play and Pause act directly,
and Fast Forward/Rewind seek (holding repeats). While the controls are hidden, Select toggles
play/pause and reveals them, and the D-pad reveals them. While they are visible, Select and the
D-pad operate the focused Media3 control; the My List or sign-in action appears only alongside
those controls, reachable with Up. Controls hide completely after 2.75 seconds without input while
playing (without Media3's extra progress-bar fade), even with a transport button focused. Paused
controls stay visible; Media3 suspends its hide timer while a settings popup is open. Showing the
controller defaults focus to Play/Pause, never settings; navigating an already-visible controller
does not reset the highlighted control. Speed, audio and subtitles remain explicit menu actions.
`PlaybackPlayerView` delegates visible-controller Select directly to `PlayerControlView`, avoiding
the outer Media3 view's post-click timer reset that would otherwise hide controls under a popup.
When the controls hide, focus returns to the player. Back exits
and releases the player, returning focus to the previously focused title. Leaving the app pauses
playback; returning shows the paused controls. Opening sign-in from the player pauses playback
until sign-in closes. Viewer sign-in reuses the website's device activation flow; Firebase
custom-token sign-in is handled by Firebase Auth, and pending device secrets are
encrypted with an Android Keystore key. The QR code contains only the public
activation URL; viewers enter the displayed code on the website. The app remains
usable for guest browsing and playback.

## Catalog/progress service compatibility

The premium home requires the additive publication-date projection in
`backend/src/catalog/readModel.js` for live recency ordering. Older servers without dates remain
browseable and use the manual hero fallback; New Releases explicitly explains the missing metadata
instead of using film release years or fabricated dates. Refresh picks up dates after deployment.

The progress route correction in `backend/src/routes/users.js` stores a nested `watchProgress`
map rather than literal dotted field names. GET also recovers older dotted entries without
changing the response contract; PUT/DELETE clean the affected legacy field. Deploy those backend
changes to restore older server-only sessions and cross-device sync. The TV's local checkpoint
store independently preserves new sessions across restarts even against the older service.

Set the public backend base URL at build time with the Gradle property `protvApiBaseUrl` or
environment variable `PROTV_TV_API_BASE_URL`. Include the backend route prefix if there is
one: local Express serves `/v1/catalog`, while Vercel serves `/api/v1/catalog`. For example,
`.\gradlew.bat :app:assembleDebug -PprotvApiBaseUrl=http://localhost:5000/` builds a local
debug client; `localhost` on a TV/emulator means that device, not the build computer. Use an
address reachable from the TV when testing there. Debug builds allow HTTP for local testing;
release builds require an HTTPS base URL. An unset base URL produces an explicit configuration
message in the app rather than a synthetic catalog or a silent fallback. Do not put private
API origins in checked-in Gradle files; the endpoint requires no credentials.

## Firebase viewer sign-in

Register an Android app with package name `com.protv.firetv` in the existing PROtv
Firebase project (do not create another project). In Firebase Console open **Project
settings → General → Your apps → Add app → Android**, enter `com.protv.firetv`, and
finish registration. No SHA certificate fingerprint is required for the existing
custom-token sign-in flow. Copy the new Android app's **App ID** (it must have the
`1:<project-number>:android:<hash>` shape); do not use the website's web App ID and
do not add a service-account key or creator SSO secret to this app.

Place the downloaded `google-services.json` in `app/`. Gradle selects the Android
client whose package is `com.protv.firetv` and reads its App ID, project ID, and API
key for the existing Firebase Auth initialization. A present file with a missing or
duplicate matching Android client fails the build with a configuration error. The
file is excluded from source control. If it is absent, the Firebase API key and project
ID already used by the website are read from `../../frontend/.env` when present; the
Android App ID must still be supplied separately. Explicit Gradle properties
`protvFirebaseApiKey`, `protvFirebaseApplicationId`, and `protvFirebaseProjectId`, or
the corresponding `PROTV_FIREBASE_API_KEY`, `PROTV_FIREBASE_APPLICATION_ID`, and
`PROTV_FIREBASE_PROJECT_ID` environment variables, override file and website values.
Never check configuration values into source control. Run
`.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`. If the Android App ID is
not configured, sign-in displays a setup message while guest browsing and playback
continue. This local build has not been verified against live Firebase authentication.

Firebase Auth persists the signed-in viewer and manages token refresh. An uncompleted
activation session is separately AES-GCM encrypted with a key held in Android
Keystore so the TV can resume after an app restart. Cancel clears the local session;
the backend has no cancellation endpoint, so its code expires within ten minutes.
The current backend reports pending, approved, expired, and consumed activation
states; it does not currently expose a viewer-driven rejection operation.

The Firebase API key and Android app ID are client configuration, not authorization
secrets; never place service-account credentials in the Android app. Authenticated
favorites and watch-progress calls use Firebase ID tokens issued at runtime; neither
the token nor account data is written to build configuration.

Run `.\gradlew.bat :app:testDebugUnitTest` and then
`.\gradlew.bat :app:assembleDebug` to test and build a debug APK without cleaning or
removing existing artifacts.
Titles use the backend's stable `id` and viewer-safe title, category, and artwork fields.
Coil loads HTTP(S) artwork and decoded base64 JPEG artwork returned by the existing catalog.
The navigation drawer is hidden by default and overlays full-width content with a 225ms slide.
LEFT from hero Play, the first card of a rail, a first-column Search result, Search's Back button,
Settings actions, or an empty section opens it at the current destination. Search starts on its Back
button so LEFT opens navigation without entering the native keyboard. RIGHT enters the search
field; native keyboard/cursor handling is unchanged. Back leaves editing before browsing results
or opening navigation from the Back button. Other card and hero
carousel LEFT actions retain normal navigation. UP/DOWN select a drawer item; SELECT activates it
and closes the drawer. RIGHT or Back dismisses it and restores the exact invoking control without
resetting scroll positions. Its separate dialog focus window prevents focus from entering content
behind the drawer. It does not participate in playback key dispatch.
Home, Movies, TV, Music, Podcasts,
New Releases, Continue Watching and My List filter the real viewer catalog. Search opens catalog
search; Settings provides account linking/management, catalog refresh and account sync. Back from a
section returns Home. Rail and title identity are both retained for focus restoration after playback.

Above the rails, the featured hero (`ui.home.FeaturedHero`) prioritizes recently published Originals
(within 30 days), then other titles by PROtv addition date, then the existing manual featured IDs,
then a deterministic catalog fallback. It uses publishedAt, approvedAt, createdAt, submittedAt in
that order, never the film's original release year. No owner-pin field exists in the current catalog,
so no synthetic pin support is assumed. Only the server's published/playable catalog is used.
Rotation is rebuilt on refresh, pauses while hero controls, sidebar or More Info are focused,
and has explicit previous/next actions. More Info opens actual synopsis and metadata with Play.
Its backdrop prefers the catalog's dedicated landscape
`heroImageUrl`, then a 1280x720 still from the title's public `muxPlaybackId`; a portrait-only
title is shown as single key art on the brand atmosphere, and with no artwork the branded
PROtv atmosphere and wordmark remain, so the hero is never an empty black field. Play uses the
same playback path as the rails.

Branding follows the website (`ui.theme.ProTvBrand`): the official text wordmark (white "PRO",
gradient "tv"), the black/midnight/indigo atmosphere with brand-blue glows, and one shared focus
treatment: content buttons turn white, while the sidebar has a blue/violet gradient with a glowing
focus border. Rail cards are 16:9 landscape cards, 120dp wide (about six in the main area).
Suitable landscape thumbnails fill the card edge-to-edge, with cropping limited to 15% of an image
dimension. Portrait, square and unusually wide art is contained directly on the screen, never
stretched or duplicated as a background. Titles retain compact 11sp labels. Focused cards scale to
1.06 with a white border and an electric-blue glow; tighter rail spacing preserves room for focus.
The border and progress bar follow the actual contained image bounds, not an empty landscape slot.
Search uses the same landscape cards in an adaptive grid; the hero's portrait fallback keeps its
separate 2:3 shape.
Hero Play and catalog cards are D-pad selectable; the catalog, scroll positions and last-focused
control are held above the home/player swap, so Back from playback returns to the same focused
hero or title without reloading. Search covers catalog title, category, genre, format, and
description metadata. Signed-in viewers can add or remove titles from My List in the player;
the home screen then shows personalized My List and Continue Watching rails. Playback position
is checkpointed every five seconds and on pause/exit before the player is released. Checkpoints are
committed locally under a key derived from the Firebase UID (not the display email), then synced
through the existing authenticated viewer-progress endpoint. Account restoration reads cached
progress before the network, merges by most recent timestamp, preserves backward seeks, and retries
locally newer entries. Favorites failure does not discard restored progress. Continue Watching
shows remaining runtime and a progress bar, and restores after process restart.
The account button opens the existing QR device-activation flow. Creator Portal access opens
the fixed HTTPS portal in an installed browser so its own authentication, uploads, agreements,
and approval checks remain in the existing creator workflow.

The app requests the live, viewer-safe backend catalog on launch; the backend marks that response
`no-store`. Use **Refresh** to fetch newly published content and updated artwork without rebuilding
the APK. Music titles and podcast episodes can appear as playable catalog items, but dedicated
podcast-show/episode navigation, series detail pages, and native title-detail pages are not yet
implemented. Registration, password recovery, and other account settings remain in the website
authentication flow; the Android app does not create a parallel account service. Account deletion
and age-profile restrictions are not exposed by the viewer APIs used here. Ads are not implemented.
The creator portal requires a browser on the device and its supported creator sign-in; Android does
not reproduce the submission, upload, agreement, or review workflow natively.

The manifest remains TV-only (`leanback` required and landscape). Phone and tablet layouts and
touch-specific navigation are not implemented or claimed. Holds and release schedules are enforced
by the backend playback endpoint.

`minSdk 23` establishes a modern Android TV baseline without claiming compatibility with
older Fire OS devices before device testing. `compileSdk 37` uses the installed Android SDK
for building, not as a Fire TV runtime requirement. `targetSdk 35` targets established
Android 15 behavior rather than adopting API 37 runtime changes without TV testing.
