# PROtv Mobile 1.0 Plan

**Architecture decision:** React Native with TypeScript, Expo SDK 58, and
Continuous Native Generation (CNG). The Android app is first; iOS and iPadOS
remain in the same project and architecture from day one.

**Launch model:** Free to watch. No purchase flow or subscription paywall is
included in Mobile 1.0. Keep playback/ad integration modular so PROtv can
choose and add advertising later without replacing catalog or player screens.

**Project boundary:** all app work lives in `mobile/`. The public website,
backend, Roku app, and Fire TV app are references and must not be modified by
this plan.

## Architecture decision

| Option | Maintainability and cost | PROtv fit |
|---|---|---|
| React Native + TypeScript + Expo CNG (selected) | One touch-first UI, navigation, design system, API contract, auth state, and feature implementation across Android and iOS. Expo supplies a versioned cross-platform module set and repeatable native project generation. Native code remains available through config plugins/modules when platform playback, identity, or advertising needs it. | Best cost/coverage balance for a small team and an existing React/TypeScript product. It avoids two full UI stacks while retaining platform-native HLS playback through Expo Video's Android and iOS implementations. The website's DOM/CSS and Mux Player component are not reused. |
| Separate Kotlin/Compose and SwiftUI applications | Strongest platform-specific control and native team fit; the existing Fire TV Kotlin code offers reference patterns. Each viewer screen, auth flow, catalog integration, accessibility behavior, and future feature still needs two implementations and separate testing/release work. | Technically sound but highest ongoing staffing and parity cost for a new mobile product with no iOS foundation. Reconsider if platform-specific requirements or staffing justify the duplication. |
| React Native with a third-party player and native ad SDKs from the outset | Could add advanced player features quickly, but creates native dependency/version churn and locks ad/player architecture before ad requirements are approved. | Not selected for the first prototype. Start with Expo Video for native HLS and define an ad adapter seam. Add and validate a dedicated Mux/ad native SDK only when required capabilities are known. |

### Cost/maintainability conclusion

React Native is the recommended maintainable and cost-effective approach for
the requested content, search, account, creator-entry, and responsive-layout
features. React and TypeScript familiarity helps, but web source itself is not
portable: React Native has different layout, accessibility, navigation, and
media primitives. The shared layer owns view models, repository contracts,
navigation, and feature behavior; native player engines and store integration
remain behind tested platform abstractions. Use Expo CNG so Android/iOS native
projects are generated from config rather than hand-diverged.

## Product and design direction

Create a premium, cinematic streaming experience using PROtv's own typography,
wordmark, voice, iconography, artwork, and colors. Use familiar streaming
patterns such as a high-impact featured title, horizontal content rails,
poster-led browsing, persistent bottom navigation, and full-screen playback;
do not copy Netflix's brand assets, exact screen designs, trade dress, or
marketing language.

Mobile navigation:

- **Home:** featured title, Continue Watching, curated rails, and a concise
  route to category browsing.
- **Search:** immediate title/series/episode search with clear empty/error
  states.
- **Categories:** browse/filter the existing catalog by supported category
  and genre.
- **My PROtv:** sign-in/account state, Continue Watching, My List, history,
  and Creator Portal access.
- **Title/series detail:** artwork, description, maturity metadata, episodes,
  and a clear play/resume action.
- **Player:** immersive full-screen native HLS playback with accessible
  controls, buffering/error/retry states, subtitles/audio tracks where
  available, and resume position.

Phone layouts are the first design target. Tablets use the same components
with adaptive rails, wider grids, and more efficient detail layouts rather
than a separate tablet codebase.

## Data and integration boundaries

- **Catalog and search:** use the existing public `GET /v1/catalog?view=all`
  contract, with supported view/query parameters; use existing series and
  title endpoints for structured details. Do not query Firestore directly.
- **Playback:** request `GET /v1/catalog/titles/:id/playback`, validate the
  response against the requested title and on-demand stream type, then form
  the Mux HLS URL from `muxPlaybackId`. Attach the backend-provided playback
  token only when returned. Never embed Mux signing material or log playback
  tokens.
- **Account:** use Firebase client authentication and send refreshed Firebase
  ID tokens to existing `GET/PUT /users/me/favorites` and
  `GET/PUT/DELETE /users/me/progress` endpoints. Keep profile-specific caches
  separate and clear them on user change/sign-out.
- **Creator access:** call existing `POST /auth/creator-sso` with a Firebase
  bearer token and open the returned external URL in a system browser. This is
  a Creator Portal entry point, not creator/admin tooling inside the viewer
  app. The current backend requires an interactive email/password or Google
  session and verified email; do not silently promise Apple-only account
  access until that existing backend contract is reviewed.
- **Ads:** launch without paid entitlements or a subscription purchase path.
  Keep an optional `AdPlaybackAdapter`/ad-event seam alongside playback.
  No ad is shown when the adapter is absent. Later VAST/IMA or another network
  must be implemented and consent/disclosure-reviewed per platform; do not
  port the website's DOM Google IMA integration into native code.
- **Environments:** local fixture mode is the default until explicit API and
  Firebase client config is provided. Live data requires a developer-selected
  staging API/Firebase project; production URLs and credentials are not
  embedded in the app. Release builds must reject non-HTTPS API endpoints.

## Working Android prototype scope

The initial prototype lives entirely in `mobile/` and demonstrates:

- The four-tab PROtv shell and premium original branding.
- Home rails, category filtering, search, title details, series and episodes.
- My PROtv, My List, and Continue Watching with local sample state.
- Firebase email/password sign-in and registration when Firebase client
  settings are configured; explicit setup messaging otherwise.
- Creator Portal SSO through the existing endpoint when a verified supported
  account and staging API are configured.
- Full-screen HLS playback: a clearly marked non-production test stream when
  using local fixtures, and backend-issued Mux playback URLs in configured API
  mode.
- Adaptive phone/tablet layout and iOS/iPad target configuration.

Fixture interactions must be identified as prototype/local state. They must
not simulate successful production authentication, API writes, or creator
access when those services are not configured.

## Release and policy gates

1. **Foundation/prototype:** complete isolated UI/navigation, fixture mode,
   API/Auth repository seams, Mux HLS path, and automated type/build checks.
2. **Android staging integration:** configure a dedicated Firebase Android
   app and staging API, validate cross-device favorites/progress, search and
   series contracts, creator SSO, and playback using authorized staging
   content. Test small and large phones/tablets, accessibility, lifecycle, and
   network failure recovery.
3. **iOS parity:** keep the bundle identifier, tablet support, deep links,
   provider model, and platform-specific playback architecture in the Expo
   configuration from the beginning. Before iOS distribution, configure
   Firebase iOS and OAuth clients, verify native browser/callback behavior,
   review Sign in with Apple requirements, and run iPhone/iPad physical-device
   tests on macOS/EAS.
4. **Account deletion blocker:** do not submit either store build until the
   owner/legal decisions and server/web deletion flow in
   [the account-deletion plan](account-deletion-plan.md) are resolved and the
   in-app flow is end-to-end tested. This mobile project does not implement a
   new production deletion endpoint.
5. **Store readiness:** complete Google Play target API and Data safety /
   deletion declarations, Apple privacy disclosures, age/content ratings,
   rights/territory checks, privacy/terms/support links, reviewer instructions,
   signing, and staged rollout plans. Revalidate each store's current rules
   immediately before submission.

## Non-goals for Mobile 1.0

No paid subscriptions or payment processing; no video downloads, live
streaming, casting, picture-in-picture, push notifications, ad delivery,
creator/admin dashboards, backend changes, or production integrations unless
separately approved and scoped. Ad support remains an architectural option,
not launch monetization.

## Reference implementation

The starter Android prototype is in [mobile/](../mobile/README.md). Expo SDK
documentation is versioned with the project; SDK upgrades and native-player
changes must follow that version's compatibility guidance.
