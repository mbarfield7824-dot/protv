# PROtv Android and iOS Readiness Audit and Plan

**Audit date:** 2026-10-30  
**Status:** Audit completed 2026-10-30. Its initial native recommendation is superseded by the reviewed React Native decision in [Mobile 1.0 Plan](mobile-1.0-plan.md). Production changes remain out of scope.

## Executive summary

PROtv has reusable viewer-facing web and backend capabilities, plus a working
Fire TV Android client that demonstrates Firebase account linking, catalog
access, Mux HLS playback, My List, and watch-progress behavior. That Fire TV
application is a television product, not a phone/tablet foundation: its
manifest requires Leanback, launches landscape, and advertises touchscreen as
optional. There is no tracked iOS/Swift application or Xcode project, and no
phone/tablet application was found in the repository.

The public website is built from `frontend/` according to
[vercel.json](../vercel.json#L1), not from the separate root `src/` tree.
Website React components and CSS are not directly portable to native Android
or iOS. The strongest immediate reuse is the existing backend API and the
Fire TV client's API/data/playback patterns.

**Initial recommendation (superseded):** separate native Android and iOS
clients. After reviewing cost and parity needs, the approved direction is a
separate React Native + TypeScript project with Expo CNG; see the [Mobile 1.0
Plan](mobile-1.0-plan.md). The Fire TV application remains separate and
unchanged.

**Release blocker:** account deletion is not implemented. The existing
[account-deletion plan](account-deletion-plan.md) says there is no website
control or backend deletion route and lists owner/legal decisions. Since
accounts can be created on the website, this needs an approved deletion
service and customer experience before either store submission. This is a
planning dependency, not permission to change the backend.

## Scope and method

This is a static repository review of the viewer website, backend contracts,
Firebase use, Mux playback integration, and the tracked Fire TV/Roku project
boundaries. It does not verify production data, live endpoints, Firebase or
Mux console configuration, store-account status, or legal conclusions. No
credential, service-account, or Mux private-key files were opened. Production
website, backend, Roku, and Fire TV source were not modified.

## Current-state findings

| Area | Finding | Readiness |
|---|---|---|
| Android phones/tablets | No mobile Android app was found. The existing Android app is under `tv/firetv/`. Its manifest requires Leanback, makes touch optional, and launches landscape; it cannot be submitted as a normal mobile experience without a separate app target and mobile UX. See [Fire TV manifest](../tv/firetv/app/src/main/AndroidManifest.xml#L4) and [Fire TV Gradle config](../tv/firetv/app/build.gradle.kts#L108). | Not started |
| iPhone/iPad | No tracked Swift source, Xcode project, or iOS app target was found. | Not started |
| Website | Vercel builds `frontend/` to `frontend/dist`; it is a React/Vite web app. Use it as the behavioral/product reference, not as evidence of React Native readiness. The root `src/` is a separate legacy tree. | Reference |
| Backend/catalog | `/v1/catalog` provides public browse, series, podcast, title, and on-demand playback data. The playback response can include a server-signed Mux token. These are the preferred mobile read/playback contracts. See [catalog router](../backend/src/catalog/router.js#L39) and [backend route mounting](../backend/src/app.js#L48). | Reusable |
| Firebase/account | The website uses Firebase email/password and Google sign-in. Authenticated favorites and watch-progress endpoints verify Firebase ID tokens. Fire TV already implements those account endpoints and Firebase Auth. See [web auth](../frontend/src/context/AuthContext.jsx#L1), [viewer endpoints](../backend/src/routes/users.js#L10), and [Fire TV account client](../tv/firetv/app/src/main/java/com/protv/firetv/account/ViewerAccount.kt#L30). | Reusable with mobile UX |
| Device activation | Fire TV uses the backend device-session flow and Firebase custom tokens. Phone/tablet users should normally sign in directly; reuse activation only for a deliberate cross-device sign-in feature. See [device-session API](../tv/firetv/app/src/main/java/com/protv/firetv/account/DeviceSessionApi.kt#L25). | Optional |
| Playback and ads | Web playback uses Mux Player and Google IMA; Fire TV uses Media3/ExoPlayer and its own player controls. Web components are not native player components. Native HLS, signed-token handling, ad playback, tracking, and subtitle behavior need platform-specific implementations and tests. See [web player](../frontend/src/components/VastMuxPlayer.jsx#L1), [Fire TV playback repository](../tv/firetv/app/src/main/java/com/protv/firetv/playback/PlaybackRepository.kt#L1), and [server playback response](../backend/src/catalog/router.js#L120). | Reuse contract, not player UI |
| Data and privacy | Favorites and progress are stored per Firebase user; the backend also accepts playback events and ad telemetry. The precise SDK data inventory and retention must be confirmed before completing store disclosures. | Needs privacy inventory |
| Account deletion | The profile has sign-out/password-reset controls but no deletion flow. The repository's deletion document identifies unresolved creator, safety-report, retention, and grace-period decisions. See [profile](../frontend/src/pages/Profile.jsx#L20) and [deletion plan](account-deletion-plan.md#L1). | Blocking |
| Tests | Fire TV includes unit and MockWebServer contract tests for account, catalog, and playback. No mobile phone/tablet or iOS UI/device test target was found. | Reusable patterns; mobile coverage absent |

The web viewer feature set to use as a parity baseline includes catalog browse
and search; movies/documentaries, music, series, and podcasts; title details
and playback; My List; Continue Watching and watch history; account sign-in;
safety reporting; and the content's age-rating, artwork, and subtitle metadata.
Admin and content-ingestion tools are explicitly out of viewer-app scope.
Live production playback, downloads, casting, picture-in-picture, push
notifications, and paid membership are not assumed as parity requirements;
product owners must decide whether to add them.

## Reusable components and boundaries

1. **Backend API (best reuse):** use the deployed API base URL from explicit
   build configuration, over HTTPS. Catalog and title endpoints are public;
   favorites/progress use Firebase bearer tokens. Preserve server-side
   eligibility and signed playback authorization; never place Firebase Admin
   credentials, Mux signing secrets, or service-account files in a mobile app.
2. **Firebase:** use platform Firebase Auth SDKs for viewer sign-in and obtain
   ID tokens for existing user endpoints. Use native secure persistence and
   clear user-scoped local caches on sign-out/account switch. Align enabled
   providers and OAuth package/bundle configuration with Firebase Console.
3. **Mux:** keep asset and signing operations server-side. Android should use
   Media3 HLS and iOS AVPlayer; both request playback authorization from the
   backend and must handle signed and public playback IDs. Revalidate any
   required Mux Data/ad SDK choices separately.
4. **Fire TV:** reuse API models, endpoint behavior, validation patterns,
   account/progress semantics, Media3 lessons, and selected pure Kotlin logic
   where extraction is safe. Its remote-first Compose UI, Leanback declaration,
   landscape lock, focus navigation, and TV store metadata are not mobile
   components. Do not alter the TV application as part of this work.
5. **Roku and website:** treat both as read-only product references. Do not
   port their platform UI or make changes to either project in this initiative.

## Native versus shared framework

| Approach | Benefits for PROtv | Costs and risks |
|---|---|---|
| Separate native apps (recommended) | Kotlin/Compose and Media3 align with the existing Android/Fire TV expertise and tests; SwiftUI/AVPlayer use Apple's native HLS and accessibility stack. Maximum control of phone/tablet layouts, lifecycle, playback, ads, and store review. | Two UI implementations and platform release pipelines; shared behavior must be held to one API contract and parity checklist. Fire TV UI still needs adaptation rather than direct reuse. |
| Kotlin Multiplatform (shared core, native UI) | Can share typed models, API clients, validation, and pure domain rules between Android and iOS while keeping native players and UI. Leverages the existing Kotlin patterns. | Adds Gradle/KMP/Swift interop and dependency support to an unstarted iOS project. Firebase and playback integrations should remain native unless a supported integration is proven. It does not make the TV UI phone-ready. |
| React Native | Familiar React/JavaScript and potential sharing of some framework-independent web logic; one mobile UI implementation. | Current website uses DOM, CSS, React Router, and Mux Player for web; these are not drop-in native controls. A native HLS player, Google IMA/ad integration, Firebase auth, and lifecycle/accessibility need native modules and focused validation. |

The proposed default is **native UI on both platforms with a stable shared API
contract**. Start with Android because it is the stated priority and has the
closest existing platform code. After a working Android playback/account
vertical slice, decide whether a KMP core reduces real duplication enough to
justify its maintenance. Do not select a shared UI framework solely because
the website uses React.

## Proposed architecture

- **Separate application targets:** `android-mobile` (phone/tablet, Kotlin and
  Compose) and `ios` (iPhone/iPad, SwiftUI). Keep them separate from `tv/firetv`
  and `tv/roku`; no TV project or production app changes are included.
- **Presentation:** responsive, touch-first browse/detail/account screens;
  Android phone/tablet adaptive layouts; iPhone/iPad layouts and multitasking
  behavior as designed; native accessibility semantics, dynamic text, and
  system navigation.
- **Domain/data:** typed catalog/title/account/progress models and repositories.
  Centralize endpoint definitions and response validation. Add shared pure
  domain code only after the KMP gate. Do not use Firestore client writes to
  bypass the existing backend authorization and validation.
- **Auth:** Firebase client SDK, provider sign-in, ID-token refresh, session
  expiry/recovery, sign-out, and account-scoped local state. Decide whether
  Sign in with Apple is included for iOS; Apple's third-party sign-in
  requirements must be assessed if Google sign-in is offered.
- **Playback:** backend title/playback request -> native HLS player -> progress
  sync and playback event tracking. Keep signed playback tokens transient and
  out of logs/analytics. Implement captions, audio/subtitle selection, seeking,
  failure recovery, background/foreground handling, and ad behavior per
  platform. Do not assume the website IMA/Mux Player integration works in a
  native player.
- **Environments:** separate development/staging/production API and Firebase
  configurations; release builds must reject non-HTTPS API endpoints. Use
  synthetic data for tests and a staging Firebase/Mux setup for device QA.

## Viewer feature parity requirements

Parity means completing the agreed viewer journey on both phones and tablets,
not matching desktop layout pixel-for-pixel:

1. Browse approved/playable titles, category rails, search, title details,
   series/seasons/episodes, podcasts, and music; loading, empty, offline, and
   retry states must be explicit.
2. Play eligible on-demand titles; preserve content metadata, maturity
   information, artwork, captions/subtitles, seek controls, playback errors,
   and safe signed/public playback behavior.
3. Sign up/sign in with approved providers, password reset/email verification
   as applicable, sign out, and recover expired sessions.
4. My List, Continue Watching, resume position, watch history, and remove from
   history; verify cross-device consistency, conflict handling, and signed-out
   behavior.
5. Safety-report entry point, privacy/terms/help access, and a user-visible
   account deletion initiation path. The deletion behavior must be backed by an
   approved server flow, not only local sign-out.
6. Ads and playback measurement only if confirmed as required product behavior;
   document consent, tracking choices, SDK data, and platform-specific ad
   fallback before release.

## Google Play and Apple release obligations

These are launch gates, not legal advice. Recheck the live store policies and
region-specific requirements at submission time.

| Requirement | PROtv action/gate |
|---|---|
| Google Play target API | For new standard Android mobile apps and updates, Google Play's current policy requires target Android 16 / API 36 from **2026-08-31**. Choose a separate mobile target SDK and min SDK; do not copy Fire TV's current target value. [Google target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) |
| Google Play account deletion | Because PROtv offers account creation, provide an in-app deletion path and a web deletion-request resource, and complete the Play Console Data safety deletion questions. The existing web/backend deletion flow is absent, so this blocks submission. [Google deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) |
| Apple account deletion | Apps that support account creation must let users initiate deletion in the app; do not substitute a support email or phone flow. Decide and implement the approved data-retention exceptions and completion communication. [Apple guideline 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) |
| Sign-in options | Review Apple's Guideline 4.8 if the iOS app offers Google or another third-party sign-in, including whether Sign in with Apple is required or an exception applies. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple) |
| Privacy/data disclosures | Inventory Firebase Auth, Mux/player, advertising, analytics, crash/diagnostics, identifiers, and retention. Keep the public privacy policy, Play Data safety form, and Apple App Privacy answers accurate and consistent; review each third-party SDK's declarations and current platform requirements. |
| Payments | The website currently describes subscription settings as unavailable. If mobile later sells digital video/music subscriptions or unlocks digital features, make an explicit product/storefront decision and follow the applicable store billing programs; Google Play generally requires Play Billing for Play-distributed digital purchases, subject to current exceptions/programs. [Google Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) |
| Content and listing | Complete current content-rating questionnaires, age/maturity handling, store listing, support/privacy links, rights/territory checks, ad disclosures, screenshots, and reviewer instructions. Verify the app's complete catalog matches licenses and permitted territories. |

## Testing strategy

- **Unit tests:** catalog parsing/eligibility, request validation, playback URL
  and signed-token handling, progress merge/conflict policy, auth-state changes,
  local cache scoping, and deletion UX state machine.
- **API contract tests:** mock the backend with fixtures for normal, empty,
  malformed, signed, unauthorized, rate-limited, and server-error responses.
  Exercise catalog/title/playback, Firebase bearer endpoints, and device
  activation only if included. Keep API tests isolated from production Firebase
  and Mux.
- **Android:** emulator and physical-device coverage across the approved min
  SDK, current Android, at least one common phone, and small/large tablets;
  portrait/landscape, window resizing, poor networks, app background/resume,
  audio interruptions, TalkBack, font scaling, and accessibility focus.
- **iOS:** simulator and physical iPhone/iPad coverage across the supported OS
  range; compact/regular layouts, iPad multitasking, VoiceOver, Dynamic Type,
  audio interruptions, background/foreground, and network failures.
- **Playback matrix:** public versus signed playback; HLS startup, seeking,
  captions, long-form resume, completed titles, expired/invalid token, missing
  media, buffering, network changes, and player teardown. Verify token values
  never appear in logs. Exercise test ad tags and no-fill/failure paths if ads
  are in scope.
- **End-to-end/staging:** synthetic viewer accounts and catalog only; confirm
  account isolation, favorites/progress cross-device sync, deletion request
  outcomes and retention, support/report flows, and rollout observability.
  Run store pre-review checks and an accessibility pass before production.

## Decision-gated plan and release checklist

### Gate 1 — Review and approve this audit

- Agree on target users, Android device/OS floor, iOS scope, viewer feature
  parity, release markets, and whether ads, live streams, casting, downloads,
  picture-in-picture, or paid membership are in scope.
- Approve native clients as the default or choose a shared framework after
  comparing a real native-player/auth spike. No app implementation before this
  review and explicit approval.

### Gate 2 — Resolve policy and backend prerequisites

- Owner/legal review: creator account deletion/retention, safety-report
  anonymization, grace period, retained data and policy wording, and who may
  authorize a backend deletion endpoint.
- Approve and implement the account-deletion service/web resource separately;
  define idempotency, recent-authentication, admin/creator handling, audit,
  user notification, and synthetic-emulator tests.
- Confirm supported authentication providers, iOS Sign in with Apple
  requirement, Firebase project/client setup, playback/ad telemetry scope,
  content ratings/territories, and any store billing behavior.
- Review a versioned mobile API contract and staging environment. No direct
  production Firestore, Mux, Roku, Fire TV, or website changes are implied.

### Gate 3 — Android first, then iOS

- Android: establish a new mobile package/application ID; select min SDK and
  target API 36 or newer at submission; use HTTPS-only release config; set up
  Firebase Android client/OAuth fingerprints; implement the approved viewer
  feature set and tests.
- After Android playback and account parity pass on phones and tablets, begin
  iOS with a unique bundle ID, Firebase iOS client, native player, required
  sign-in option, and iPhone/iPad layouts.
- Keep any shared core limited to proven domain/API behavior; do not couple
  platform player or UI code to a shared layer without platform-specific tests.

### Gate 4 — Store submission

- Verify Play Console app-content declarations, Data safety and deletion
  responses, privacy policy, content rating, app access/reviewer instructions,
  store listing, ads and billing disclosures, signing, AAB, and target API.
- Verify App Store Connect privacy answers, age rating, account deletion,
  sign-in behavior, privacy policy, SDK declarations, reviewer access, signing,
  TestFlight results, and any applicable payment/subscription treatment.
- Pass the device/accessibility/playback matrix; resolve all crash, security,
  privacy, licensing, and account-deletion blockers; stage rollout with a
  monitored rollback plan and support contact.

## Official policy references

- [Google Play target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Google Play account deletion and Data safety](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [Apple App Review Guideline 5.1.1(v): account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Apple App Review Guidelines: Sign in with Apple / account sign-in](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple)
