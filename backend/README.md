# PROtv Backend Setup Guide

## What We've Built
- **Express.js** API server with routes for auth and videos
- **Firebase** integration (Firestore database + Authentication)
- **Modular structure** ready for Roku/Firestick apps later

## Project Structure
```
backend/
├── src/
│   ├── server.js           # Main Express app
│   ├── firebase.js         # Firebase config & helpers
│   ├── routes/
│   │   ├── auth.js         # Login/signup endpoints
│   │   └── videos.js       # Video endpoints
│   └── middleware/
│       └── auth.js         # Token verification
├── package.json            # Dependencies
├── .env.example            # Environment variables template
└── .env                    # Your actual secrets (create from .env.example)
```

## Setup Steps

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" and name it "PROtv"
3. Enable Firestore Database
4. Enable Authentication (Email/Password)
5. Go to Project Settings > Service Accounts > Generate new private key
6. Download and save as `serviceAccountKey.json` in the backend folder

### 2. Set Environment Variables
```bash
# Copy the template
cp .env.example .env

# Edit .env and add:
# - Path to your serviceAccountKey.json
# - Your Firebase Project ID (from console)
# - Keep PORT as 5000
```

### 3. Install & Run
```bash
# Install dependencies (already done)
npm install

# Start the server
npm start

# You should see:
# ✓ PROtv Backend running on port 5000
```

### 4. Test with Postman
1. Download [Postman](https://www.postman.com/downloads/)
2. Create requests to test:
   - `GET http://localhost:5000/health` → Should return `{ status: "Backend is running!" }`
   - `GET http://localhost:5000/videos` → Should return empty array `[]`

Video filesystem storage is a local-development fallback only. On Vercel or
with `NODE_ENV=production`, unavailable Firestore fails explicitly rather than
reading or writing `backend/.data`; a missing Firestore video returns 404.

### Owner access

Content uploads, catalog edits, reviews, and Mux ingestion require a Firebase
custom claim. In Vercel, add a protected `OWNER_EMAIL` environment variable
containing the email address of the PROtv owner account. Deploy it, then sign in
to `/admin` with that verified account using email/password or Google and select
**Activate Owner Access** once. Custom-auth sessions cannot claim owner or
access privileged Admin and Creator SSO endpoints. Sign out and back in
afterward so Firebase issues the account a token with the admin claim.

For a local backend with valid Firebase Admin credentials, the equivalent is:
```bash
npm run grant-admin -- owner@example.com
```

## API Endpoints (Phase 1)

### Auth Routes
- `POST /auth/signup` - Create account
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "displayName": "John Doe"
  }
  ```

### Video Routes
- `GET /videos` - Get all videos
- `GET /videos/:id` - Get single video
- `GET /videos/categories/list` - Get all categories
- `POST /videos` - Add new video (requires authentication token)

### Shared viewer catalog (version 1)

These public, read-only routes run alongside `/videos` (prefix paths with `/api`
on Vercel). They return only approved, ready records with a nonblank Mux
playback ID. Catalog items are an explicit viewer-safe field projection; no
internal rights, approval notes, source URLs, or administrative fields are
included.

- `GET /v1/catalog?view=all|movies|documentaries&q=...` returns `{ "items": [...] }`.
  `view` defaults to `all`; `q` is optional, limited to 200 characters, and
  matches every whitespace-delimited term against title, category, subgenre,
  and genres without case sensitivity. Invalid view/query values return 400.
  Results are ordered by catalog ID.
- `GET /v1/catalog/series` returns `{ "items": [...] }` with Series key, title,
  category, artwork, season count, and episode count.
- `GET /v1/catalog/series/:key` returns a Series summary plus seasons in
  ascending numeric order, each containing episodes sorted by episode number
  then catalog ID. Unknown keys return 404. Only episodes with an explicit
  nonblank series title and positive integer season/episode numbers are grouped.
- `GET /v1/catalog/titles/:id` returns the same viewer-safe title projection
  used by browse and Series. Titles outside the playable catalog return 404.
- `GET /v1/catalog/titles/:id/playback` returns
  `{ "id": "...", "streamType": "on-demand", "muxPlaybackId": "..." }`
  for a playable title, or 404 otherwise. This is a public on-demand
  availability response, not a player, signed playback or an access entitlement.

Podcast domain foundation (P1): `PODCAST_SHOW` and `PODCAST_EPISODE` live in
the existing `videos` catalog. A Show's catalog `id` is stable across title
edits; it has title, optional description, host/creator, category, genres, and
`artworkUrl`. It is a nonplayable parent, even if playback fields are present.
A Podcast Episode has `podcastShowId` referencing an existing Show record,
a positive integer `episodeNumber`, its own title/artwork, and the existing
video/Mux metadata. A title match is not a Show reference. Existing TV
`EPISODE` records continue using `seriesTitle` and season/episode numbers;
Movies and Music are unchanged. P2a adds authenticated Admin backend authoring
and video ingestion; P2b adds the Podcast tab to the authenticated website
Admin experience. An interrupted Episode transfer can be checked again with
the protected status endpoint from that tab without starting a new ingestion.
P3a adds public website discovery at `/podcasts` and a stable-ID Show page at
`/podcasts/:showId`. They use only `GET /v1/catalog/podcasts` and
`GET /v1/catalog/podcasts/:id`; Podcast search also uses eligible Episodes
from `GET /v1/catalog`.
Both search surfaces retain successful public-source results when another
source fails, display incomplete/unavailable states, and offer retry.
Failed Podcast requests never trigger mock-content substitution.
Each search source has a 10-second deadline; timed-out sources report an
error and are aborted. Retry and unmount cancel superseded search requests.
P3b adds Watch Episode links using stable Episode IDs and the existing
website player/Mux path. Podcast player loads revalidate the public video
response with title and playback endpoints, with a 10-second combined
deadline, explicit unavailable/retry
states, and a return link to the Podcast Show. Shows remain nonplayable;
the existing public parent/approval/readiness checks are unchanged.
Generic video create/edit/approval/ingestion routes still reject Podcast types.

Podcast Admin routes (prefix with `/api` on Vercel) require an interactive
Firebase Admin session with the admin claim:

- `POST /admin/podcasts/shows`: create a draft Show. Accepts `title`
  (required), `description`, `artworkUrl`, `host`, `creator`, `category`,
  `genres` (string array). `contentType: PODCAST_SHOW` is optional. IDs are
  generated independently of titles; media and Mux fields are rejected.
- `PATCH /admin/podcasts/shows/:id`: edit those display fields; omissions
  preserve existing fields. An approved Show must continue to satisfy all
  publication metadata requirements on edit.
- `POST /admin/podcasts/shows/:id/approve`: publish only if title, description,
  artworkUrl, host or creator, and category or genres are present.
- `POST /admin/podcasts/episodes`: create a draft video Episode with required
  `title`, `podcastShowId` (existing Show ID), positive integer
  `episodeNumber`, `rightsHolder`, and `rightsVerificationNotes`. Optional
  display fields are `description`, `thumbnailUrl`, `posterUrl`, `category`,
  and `genres`. `contentType: PODCAST_EPISODE` is optional. A draft Show may
  have draft Episodes. Rights notes are required for review, not proof of
  legal clearance.
- `PATCH /admin/podcasts/episodes/:id`: edit the same metadata after checking
  the effective merged record and parent. Actual parent or rights changes
  on an approved Episode reset it to draft and clear approval metadata;
  normalized unchanged values do not.
- `POST /admin/podcasts/episodes/:id/upload-url` (empty JSON object): creates
  a Mux direct-file upload URL, returning `videoId`, `uploadId`, `uploadUrl`.
- `POST /admin/podcasts/episodes/:id/from-url` with an HTTP(S) `sourceUrl`:
  starts Mux URL ingestion, returning `videoId`, `assetId`. Both ingestion
  actions validate the existing draft Episode and parent before calling Mux.
  Check readiness through the existing Admin `GET /videos/:id/status` or
  authenticated Mux webhook; neither approves the Episode.
  Retries of errored ingestion replace active Mux references and clear the
  prior playback ID and duration. Attempt-conditional catalog writes reject
  competing starts and stale status/webhook results; a Mux resource created
  before a rejected claim may require manual cleanup.
- `POST /admin/podcasts/episodes/:id/approve`: approves only a valid Episode
  with `status: ready` and nonblank `muxPlaybackId`. An unpublished parent
  still hides it from public discovery.
- `POST /admin/podcasts/shows/:id/unpublish` and
  `POST /admin/podcasts/episodes/:id/unpublish`: return to draft and clear
  approval metadata. Show unpublish does not rewrite Episodes.

The approval endpoints accept only optional `approvalNotes`; creation ignores
client-supplied `approvalStatus` and always starts draft. Metadata edits reject
client approval, playback, and ingestion fields. Show/Episode content types
cannot change. Responses from these Admin routes are private Admin records;
public catalog and title projections never include rights notes or approval
metadata. No audio-only media is accepted.

The Show needs `approvalStatus: approved`, a valid ID, and a nonblank title;
it does **not** need `status: ready` or a Mux ID. Its Episodes appear publicly
only when the Show is published **and** each Episode is approved, ready,
playable, and references that Show by ID. Invalid or unpublished parents
make Episode browse, direct title, legacy video detail, and playback return
no result. Show records never enter playable catalog or TV Series grouping.
Public Show/Podcast Episode projections exclude private rights and approval
metadata. `GET /v1/catalog/podcasts` returns `{ "items": [...] }` with published
Show summaries; `GET /v1/catalog/podcasts/:id` returns one summary and its
eligible Episodes in episode-number order (404 otherwise).

The versioned catalog remains read-only; it does not add login or write endpoints.

### PROtv Live discovery (phase 1)

Live events are separate from on-demand `videos`, in Firestore `liveEvents`
documents keyed by stable event ID. A document has `title`, `description`,
`artworkUrl`, `scheduledStartAt` and `scheduledEndAt` (Firestore timestamps),
`status` (`draft`, `scheduled`, `live`, `ended`, or `cancelled`),
`accessPolicy` (`free` or `paid`), `published` (boolean), and optional
`createdAt`/`updatedAt` timestamps. `priceMinor` and `currency` may be reserved
for future paid events; neither purchases nor pricing are part of phase 1.
Internal stream/provider, payment, entitlement, and admin fields must stay
server-only.

- `GET /v1/live/events` returns `{ "items": [...] }` without authentication.
  Only explicitly published, **free, scheduled** events are discoverable.
  Draft, cancelled, live, ended, paid, and unpublished events are deliberately
  excluded until their later-phase behavior is defined. Results sort by
  scheduled start ascending, then event ID.
- `GET /v1/live/events/:id` returns the same viewer-safe projection, or 404
  for an unknown or non-public event.

The public fields are `id`, `title`, `description`, `artworkUrl`,
`scheduledStartAt`, `scheduledEndAt` (ISO 8601 UTC), `status`, and
`accessPolicy`. Invalid discoverable records or unavailable Firestore reads
fail closed with 503; there is no local-file fallback. These routes are
read-only and do **not** provide access checks, playback, or checkout. Prefix
the paths with `/api` on Vercel.

### PROtv Live administration (phase 2)

The backend mounts the following Firestore-only routes under `/admin/live`
(`/api/admin/live` on Vercel). Every request requires the existing verified
Firebase ID token with the `admin` custom claim and an interactive
email/password or Google session. Responses use `Cache-Control: no-store`.

- `GET /admin/live/events` returns `{ "items": [...] }` across all lifecycle
  states; `GET /admin/live/events/:id` returns one event or 404.
- `POST /admin/live/events` creates a server-generated ID and returns 201.
  `PATCH /admin/live/events/:id` updates the named event or returns 404.
  There is no hard delete.

Create requires `title` (1–200 characters), `description` (up to 5000
characters), an HTTPS `artworkUrl` (up to 2048 characters), ISO 8601
`scheduledStartAt` and `scheduledEndAt` with timezones (end after start),
`status` (`draft` or `scheduled` on creation), `accessPolicy` (`free` or
`paid`), and boolean `published`. PATCH accepts a nonempty subset and
validates the resulting event. Unknown fields, including IDs, timestamps,
pricing, stream credentials, and payment/entitlement data, return 400.
The server owns `createdAt` and `updatedAt`. Admin responses expose only
the public event fields plus publication state and these timestamps.

Lifecycle transitions: draft may remain draft or move to scheduled/cancelled;
scheduled may remain scheduled or move to draft/live/ended/cancelled; live
may remain live or move to ended/cancelled; ended and cancelled are terminal.
Publishing is allowed only for scheduled, free, complete events. Leaving that
state requires explicitly setting `published: false` in the same PATCH.
Firestore transactions validate and apply updates together. Storage failures
return a sanitized 503; no local JSON fallback, payment, or Live playback is
provided.

### Mux Live provisioning (phase 3A)

`POST /admin/live/events/:id/provision-stream` reserves and provisions exactly
one public-policy Mux Live stream for an **unpublished, scheduled, free** event.
It returns `201` with `state: "provisioned"`, `muxLiveStreamId`, and
`muxPlaybackId`; a retry returns the existing IDs without calling Mux.
`GET /admin/live/events/:id/stream` returns the sanitized provisioning state
(`unprovisioned`, `reserved`, `recovery_required`, or `provisioned`) and, only
when provisioned, the two IDs. Both routes require the existing interactive
Firebase Admin claim. Unknown events return 404, incompatible or uncertain
provisioning returns 409, and storage failures return 503. Neither endpoint
returns a stream key or ingest credentials.

The reservation is committed to `liveEvents` before contacting Mux. An
unresolved reservation or `recovery_required` state blocks all subsequent
creation attempts: Mux creation may have succeeded even if its response was
lost. A failed attach similarly requires manual reconciliation using the
event ID supplied as Mux passthrough before any future retry. There is no
automatic lease expiry, stream deletion, or reset route in this phase.
Only the Live stream and public playback IDs are stored; the Mux stream key
is never stored in Firestore or exposed by PROtv. An event with a public-policy
stream cannot be switched to paid access. Provisioning does not publish the
event, change its lifecycle status, enable public playback, or process webhooks.
Public-policy playback is only for this free test, not future paid events.

### Mux webhook

Set `MUX_WEBHOOK_SECRET` to the signing secret for the configured Mux webhook
endpoint (separate from the Mux API token secret). `/videos/webhook` refuses
requests without a configured secret or a valid signature over the exact raw
request body. The compatibility route `/api/mux/webhook` preserves the
existing Mux dashboard destination and delegates to the same signed handler
as `/api/videos/webhook` (locally, `/mux/webhook` and `/videos/webhook`).
The Admin upload screen can still poll `/videos/:id/status` with
an authenticated interactive Admin session to reconcile Mux processing when
a webhook is unavailable.

The same verified endpoint records `active`, `idle`, `disconnected`, `disabled`,
`enabled`, and `deleted` Live stream webhooks as private operational signals
for a provisioned event whose stored stream ID matches the signed webhook.
The event ID supplied at provisioning is used as passthrough to locate it.
Each webhook ID is recorded in a private `muxWebhookEvents` subcollection for
durable duplicate protection. These receipts are retained indefinitely for
now; define retention and cleanup as a future operational task.
`muxOperationalSignal` on the event is the
**last received** signal, not authoritative current stream state: Mux delivery
order and event timestamps do not establish the current state. Unknown streams
and unhandled Live signals are acknowledged without modifying an event.
Webhooks never publish events, change PROtv lifecycle or access policy, expose
playback, or trigger stream provisioning. Confirm the deployed signing secret
and Mux dashboard endpoint/subscriptions before real webhook acceptance.

## Next Steps
1. Set up Firebase project ✓
2. Test backend with Postman
3. Build database schema (videos, categories, users)
4. Set up frontend (React + Vite)
5. Connect frontend to backend
6. Integrate Mux for video streaming

## Troubleshooting
- **Port already in use**: Change `PORT` in `.env`
- **Firebase auth error**: Check `serviceAccountKey.json` path in `.env`
- **CORS errors**: Check `FRONTEND_URL` in `.env`
