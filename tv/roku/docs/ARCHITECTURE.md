# Issue #7: read-only architecture audit

Audit date: 2026-10-22. Baseline `c289521` on
`sync/protv-tv-current-20261020`. Implementation branch:
`feature/issue-7-roku-phase-1`. No push, merge or deployment authorized.

## Inventory before implementation

- No Roku, BrightScript, SceneGraph, manifest, Roku build configuration or device
  tooling found in tracked files or the available local/remote branch names.
  The available `origin/main` TV tree also contains no Roku project. Remote refs
  were inspected as present locally, not refreshed; inaccessible/unfetched work
  cannot be ruled out. No Roku IP, password, developer account or device assumed.
- Existing [Fire TV application](../../firetv/README.md) is native Kotlin/Compose,
  not reusable Roku UI code. Its public catalog, playback and account contracts
  **are** reusable. Fire TV development remains paused and its files untouched.
- [Catalog router](../../../backend/src/catalog/router.js) and
  [read model](../../../backend/src/catalog/readModel.js) provide viewer-safe,
  release-filtered metadata. Production public GET returned 56 items: 51 movies,
  5 episodes. IDs remain exact, including mixed-case and underscore IDs.
- Production base: `https://watchprotv.com/api`. GET `/v1/catalog?view=all`,
  `?view=movies`, `?q=...`, `/titles/:id`, `/titles/:id/playback`, `/series`,
  `/series/:key`, `/podcasts`, `/podcasts/:id` already exist.
  Browse uses `{items:[...]}`; detail is an object. Search matches title,
  category, subgenre and genres, all words, at most 200 characters.
- Metadata: title, description, credits, type, category, subgenre, genres, year,
  duration/runtime, maturity, artwork, publication dates where available,
  series/season/episode context. No public server-owned featured ranking.
- Playback returns `{id,streamType:"on-demand",muxPlaybackId,playbackToken?}`.
  Released signed creator media requires the short-lived token. Reauthorize
  each play; never derive a public fallback for signed media. No Mux API keys
  or signing keys belong in the client.
- [Device sessions](../../../backend/src/auth/deviceSessions.js) already support
  website activation. [Viewer endpoints](../../../backend/src/routes/users.js)
  already support Firebase-ID-token favorites and watch progress.
- Music/podcast public projections exist, but none appeared in the 56-item live
  result. Creator submissions and administrative tools are separate privileged
  website/backend features, deliberately absent from this viewer client.

## Artwork boundaries

Owner-approved rollout evidence exists locally under
`audit-reports/approved-32-production-rollout-2026-10-21/ROLLOUT-SUMMARY.txt`.
32 immutable approved URLs are already in the production `posterUrl` field.
Read that field rather than recreating artwork or copying an operational
Firestore snapshot into the client. The Roku project does not depend on that
untracked audit directory.

Held replacements: `MZ6Q6DI2S62pP8laH9Ku` (The Incredible Petrified World) and
`XMj306OZSbomES2Zz0Fz` (Within Our Gates). Force branded title panels for these
IDs; this is an **artwork hold**, not an invented playback/publication hold.
All other artwork is displayed as supplied, contained without crop/stretch.
Movie frames are exactly 2:3, even when source dimensions are slightly different.
Episodes use 16:9 contained frames, preferring existing hero/thumbnail imagery.
Embedded JPEGs are cached to `tmp:` by a background Task, never rewritten.
Unusable HTTP/localhost art and load failures show explicit branded panels.
Creator assets, metadata, production records and held replacements are unchanged.

## Native design

Only [tv/roku](../) is changed. `source/main.brs` creates the SceneGraph screen
and forwards cold/warm launch arguments. `HttpTask` does read-only HTTPS work
off the render thread with CA validation, timeout and explicit errors.
`source/model.brs` holds directly executable pure contract/grouping rules.
`ProtvScene` implements navigation, featured/editorial selection, Black Cinema,
all movies, category rails, episodic rail, search, details and native `Video`.
`PosterCard` presents unmodified art with a branded load-error fallback.

HD logical canvas with title-safe content kept within x=64..1216 and
y=24..684. v0.2 replaces the sidebar with a top tab bar and uses only the
PROtv blue palette. `PillButton` provides focusable primary/secondary/tab
buttons drawn from generated 9-patch art. SceneGraph RowList supplies the
rails (one full row plus a peek of the next); native StandardKeyboardDialog
and Video supply input and playback controls. No HTML wrapper, Android
dependency, synthetic catalog or production writes.

Search runs against the downloaded public catalog using the existing all-term
semantics; it avoids a network call per remote key. Featured is an explicit
editorial ID list, not a claim of server ranking or newest release dates.
The featured area pairs an eyebrow, title, metadata, summary, Play and More
Info with a contained 168 x 252 portrait on a framed panel. The public catalog
has no backdrop field, so the ambient background is UI art, never film artwork
stretched into a landscape. Cards are 140 x 210 (2:3) and 256 x 144 (16:9);
rounded corners come from a background-coloured corner mask, so artwork is
never cropped. Details use a contained 280 x 420 framed portrait and native
ScrollableText synopsis/credits.

## Phase 2 account and progress contracts

The Roku implementation uses existing services only; no website/backend route,
Firestore schema or production data was changed.

### TV activation and Firebase session

- `POST /auth/device-sessions` returns `sessionId`, `deviceSecret`, `userCode`,
  `verificationUrl`, `expiresAt`, and `interval`. The current implementation
  issues a 10-minute session with a 5-second polling interval.
- Show the official verification URL and short code separately. Do not put the
  code/device secret in the URL. Poll `GET /auth/device-sessions/:sessionId`
  using `X-Device-Secret`; exchange `POST
  /auth/device-sessions/:sessionId/exchange` with the same header after approval.
  The backend verifies the secret hash, one-time consumes the session and
  returns `{customToken}`. Website approval remains an interactive signed-in
  user action.
- The Roku exchanges that Firebase custom token at
  `identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken` using the
  existing website's public Firebase client API key. That response has no
  localId; the viewer ID is the ID token's user_id/sub claim. Firebase ID and rotating
  refresh tokens are saved in this app's registry section so the TV stays
  linked (v0.5); a refresh uses the existing Firebase Secure Token REST
  contract and runs at launch before any account request. The ID token is sent only as
  `Authorization: Bearer ...` to existing user-scoped API routes. No password,
  device secret or Firebase Admin key is saved, and no token is logged.
- Polling uses the backend interval and retries transient network/HTTP failures
  with capped backoff, bounded by the backend expiry. Invalid/expired codes,
  rate limits, unavailable responses, and Firebase/session failures have
  explicit user-facing states. Sign Out cancels in-flight work, clears in-memory
  account/progress state and returns to guest-capable browsing.

### Continue Watching

- `GET /users/me/progress` returns the backend-normalized map keyed by exact
  catalog video ID. Roku joins only IDs currently present in the downloaded
  catalog, ignores malformed entries, sorts by `updatedAt`, and uses the
  existing Fire TV completion cutoff (`progressPercent < 95`).
- Resume uses `positionSeconds` only when it is positive, below duration and
  below the existing 95% completion cutoff. The progress rail uses the existing
  poster/episode art with a separate UI progress bar; source art is untouched.
- `PUT /users/me/progress/:videoId` uses `{positionSeconds,durationSeconds}` and
  the signed-in ID token. Checkpoints are debounced to at least 20 seconds of
  advancement; pause/player Back/finish force a best-effort flush. The server
  overwrites the per-title map entry, so repeated checkpoints do not append
  duplicate history events. Guests never call these routes.
- Failed writes remain retryable during playback or from Account; playback is
  not blocked by progress-network errors. Each new account starts with a fresh
  in-memory progress map, preventing cross-viewer leakage.

## Remaining requirements and capability gaps

1. **No per-device sign-out/revocation.** The exchange endpoint consumes the
   one-time activation session, but the backend has no endpoint to revoke a
   Firebase refresh token for just this Roku. Local Sign Out discards Roku's
   in-memory tokens; an already issued ID token remains valid until ordinary
   expiry. Calling Firebase Admin's UID-wide revoke would also sign out other
   devices and is intentionally not used. Minimal future proposal: add a
   user-bound, per-device server session with an opaque refresh credential and
   authenticated revoke endpoint; never change the existing viewer routes to
   trust unauthenticated device IDs.
2. **Saved sign-in uses the ordinary Roku registry (owner-approved, v0.5).**
   It is private to this app but not encrypted. Only the viewer session is
   saved (never activation secrets); Sign Out and Firebase 4xx rejections
   delete it. Revisit if Roku offers verified protected storage.
3. **No activation cancel/reject contract.** The current service reports
   pending/approved/consumed/expired. It has no reject state or TV cancel
   endpoint; an unwanted code expires after 10 minutes.
4. The backend has no progress TTL/completion marker. Roku follows Fire TV's
   95% hide-from-Continue-Watching rule but leaves completed entries in server
   history. Titles removed from the catalog are omitted from the rail, not
   deleted from the account. Explicit `DELETE /users/me/progress/:videoId`
   exists but is not exposed as a Roku watch-history action.
5. Local package builds need `ROKU_FIREBASE_API_KEY`, the public web client key
   already used by the PROtv website. It is injected into the ZIP at build time,
   not committed. It is not a privileged API key. Without it, the app explicitly
   leaves account linking unavailable while guest viewing/playback still works.
6. My List/favorites, series smart bookmarks, Roku Search feed ingestion, and
   server-owned featured ranking remain unimplemented. No Roku Search feed or
   pagination protocol was found.
7. No dedicated caption-track projection exists in the public catalog.
   Native Video can expose tracks in HLS; actual captions/audio/seek, codec
   support, token expiry/retry and accessibility still need a physical device.
   Website footer `#privacy` / `#terms` links are insufficient evidence of
   published legal/support/account-deletion paths; confirm before certification.

No production website/backend/Fire TV changes, Firestore writes outside the
existing viewer progress route, media downloads or stream-segment fetches are
part of local development validation.
