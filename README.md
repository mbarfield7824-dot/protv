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

## Advertising and creator revenue

PROtv supports Google IMA client-side VAST pre-rolls around the existing Mux Player. Advertising
is disabled unless `VAST_AD_TAG_URL` and `AD_EVENT_SIGNING_SECRET` are configured. If IMA or the ad
server fails, playback remains available and the failure is logged; browser telemetry never creates
revenue.

Player impressions are recorded with short-lived, title-bound signed sessions. Authoritative money
enters only through `POST /ads/provider-revenue`, signed with `AD_PROVIDER_WEBHOOK_SECRET`. Provider
event IDs are idempotent, and revenue is stored per catalog title in Firestore or the configured
local development file.

Creator revenue synchronization requires:

- `CREATOR_AGENT_REVENUE_URL`
- Matching `CREATOR_AGENT_REVENUE_SECRET` and Creator Agent `PROTV_REVENUE_WEBHOOK_SECRET`
- Matching PROtv and Creator Agent `PROTV_CREATOR_LINK_SECRET`
- An approved PROtv title explicitly linked to a published Creator Agent project

The Creator Agent calculates creator earnings from the revenue share frozen in the signed contract;
PROtv and the browser do not submit or choose that percentage.

## Creator publishing API

The private `POST /videos/integrations/creator-actions` endpoint accepts signed server-to-server
requests from the Creator Agent. It is not a browser publishing endpoint. Every request must carry
an exact-body SHA-256 HMAC in `X-PROtv-Signature`, a timestamp no more than five minutes old, an
idempotency request ID, verified ownership, explicit Administrator approval, and—for publishing or
distribution—a signed contract.

Publishing reserves a deterministic catalog ID before contacting Mux, preventing duplicate catalog
records during concurrent retries. Mux reads the master through an expiring, project-and-asset
scoped Creator Agent URL. The configured Creator Agent origin is allowlisted to prevent arbitrary
server-side URL ingestion. Distribution is refused until Mux reports a ready asset with a public
playback ID. Licensing and contracting requests record approved operational milestones only.

Configure both production systems with the same high-entropy secret:

```env
# PROtv backend
PROTV_PUBLISHING_SECRET=replace_with_a_high_entropy_shared_secret
CREATOR_AGENT_ORIGIN=https://protv-creator-agent.onrender.com

# Creator Agent
PROTV_ADAPTER=official-api
PROTV_API_BASE_URL=https://watchprotv.com/api
PROTV_PUBLISHING_SECRET=replace_with_the_same_secret
```

Publishing and distribution remain behind the Creator Agent’s existing ownership, review,
signed-contract, and Administrator confirmation gates. The API does not add deletion or
pipeline-modification capabilities.

## Creator Portal and SSO

The homepage and `/creators` route introduce the Creator Portal, explain Creator benefits, and
provide the upload, contract, and revenue workflow. The shared header includes a persistent
**Creators** link on desktop and mobile.

Signed-in viewers open the separate Creator Agent through a two-minute HMAC-signed identity
handoff. The handoff is placed in the URL fragment so it is not sent to the static web host,
removed from browser history before exchange, and can be consumed only once. Passwords and
session cookies are never shared between applications. Firebase email verification is required
before an identity can be linked.

Configure the PROtv backend with:

```env
CREATOR_PORTAL_URL=http://127.0.0.1:5180
CREATOR_SSO_SECRET=replace_with_a_high_entropy_shared_secret
```

Set the exact same secret as `PROTV_SSO_SECRET` in the Creator Agent. Use HTTPS public origins in
production.

## Next Steps
1. Set up Firebase project ✓
2. Test backend with Postman
3. Build database schema (videos, categories, users)
4. Set up frontend (React + Vite)
5. Connect frontend to backend
6. Integrate Mux for video streaming

## Public Domain Admin Bot

The owner-only Admin page includes a **Public Domain Bot** tab. It scans a configured local
directory, skips files that were already published, prepares catalog metadata and a poster,
uploads the video to Mux, waits for transcoding, and publishes only after every required step
has succeeded.

### Configuration

Add these values to `backend\.env`:

```env
PD_CONTENT_DIRECTORY=D:\Media\Public Domain
PUBLIC_API_BASE_URL=http://localhost:5000
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace_with_your_key
AI_MODEL=replace_with_your_text_model
```

Optional settings:

```env
PD_STATE_FILE=D:\PROtv-Data\pd-ingestion-state.json
PD_POSTER_DIRECTORY=D:\PROtv-Data\posters
PD_TRANSCODE_TIMEOUT_MS=900000
AI_IMAGE_BASE_URL=https://api.openai.com/v1
AI_IMAGE_API_KEY=replace_with_your_key
AI_IMAGE_MODEL=replace_with_your_image_model
```

If image generation is not configured, the bot creates a branded PROtv fallback poster. It
uses a Wikimedia Commons poster only when Commons explicitly identifies the image as Public
Domain, CC0, or Public Domain Mark.

### Running the bot

1. Put approved Public Domain video files in `PD_CONTENT_DIRECTORY`.
2. Start the backend and frontend.
3. Sign in with the PROtv owner account.
4. Open **Admin**, select **Public Domain Bot**, and choose **Run Safe Test**. This validates
   discovery, metadata, and poster preparation without creating catalog entries or contacting Mux.
5. When the report is clean, choose **Publish New Movies** and confirm the live run.
6. Keep the backend running while Mux processes the files. The page reports added, skipped,
   and failed movies and displays recent audit activity.

The bot records SHA-256 file hashes in its state file. Only successfully published hashes are
skipped permanently; interrupted or failed items can be retried. Source file paths and file
hashes are not returned by the public catalog API.

### Automatic web discovery

The **Automatic Content Hunt** searches once per day and can also be refreshed with
**Run Discovery Now**. It keeps a persistent Administrator review queue and preserves rejected
and approved decisions across later searches.

Sources are handled conservatively:

- **Internet Archive** items can be ingested only when their current item metadata includes an
  explicit Public Domain Mark, CC0 dedication, or Public Domain statement.
- **Wikimedia Commons** video can be ingested only when its structured file metadata identifies
  it as Public Domain, CC0, or Public Domain Mark.
- **YouTube Creative Commons** results are reference-only. The YouTube license is CC BY, not
  CC0, and the bot never downloads or re-uploads YouTube videos.
- **PublicDomainMovie.net** RSS entries are reference-only because the feed does not provide
  authoritative structured rights evidence.

For every ingestible title, the Administrator must open the source, select the confirmation
checkbox, and choose **Confirm and Upload**. The backend then retrieves the source metadata
again, rechecks the evidence, creates a draft, sends the original media URL to Mux, waits for
playback readiness, and publishes. AI does not decide copyright status.

Automatic scheduling requires a continuously running Node backend. Serverless deployments
should call the protected discovery-run endpoint from their platform scheduler instead of
relying on the in-process timer.

Optional web-ingestion settings:

```env
PD_WEB_MAX_FILE_BYTES=21474836480
PD_WEB_STATE_FILE=D:\PROtv-Data\pd-web-ingestion-state.json
PD_AUTO_DISCOVERY_ENABLED=true
PD_DISCOVERY_INTERVAL_MS=86400000
PD_CANDIDATE_STORE_FILE=D:\PROtv-Data\pd-candidates.json
YOUTUBE_API_KEY=optional_youtube_data_api_key
```

On Vercel, PROtv automatically stores the Public Domain discovery queue in Firestore because the
deployed function filesystem is read-only. `PD_CANDIDATE_STORE_FILE` remains available for local
development and persistent server environments.

## Distributor Ingestion Adapter

The owner-only Admin page also includes a **Distributor Feed** tab. The adapter retrieves a
standard PROtv JSON feed over HTTPS using a bearer token. For each title it:

1. Validates and normalizes the supplied metadata.
2. Confirms that streaming rights were declared by the distributor.
3. Confirms that the rights window is active and includes the required territory.
4. Stores a rights-confirmed distributor poster or creates a safe fallback.
5. Creates a draft and asks Mux to retrieve the HTTPS media URL.
6. Waits for a public playback ID and checks the rights window again.
7. Publishes the complete title and writes an Administrator audit event.

Invalid, expired, future, or territory-ineligible titles are not published. Previously published
distributor item IDs are skipped while their rights remain active. If a later feed run shows that
a published title's rights are inactive, the adapter removes it from the live catalog and records
the event. Interrupted and failed titles remain eligible for retry.

Configure the adapter in `backend\.env`:

```env
DISTRIBUTOR_FEED_URL=https://distributor.example.com/protv-feed.json
DISTRIBUTOR_FEED_TOKEN=replace_with_bearer_token
DISTRIBUTOR_REQUIRED_TERRITORY=US
DISTRIBUTOR_STATE_FILE=D:\PROtv-Data\distributor-ingestion-state.json
DISTRIBUTOR_TRANSCODE_TIMEOUT_MS=900000
```

The complete machine-readable contract is
[`backend/docs/distributor-feed.schema.json`](backend/docs/distributor-feed.schema.json).
A minimal feed looks like this:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-09-19T12:00:00.000Z",
  "distributor": {
    "id": "example-distribution",
    "name": "Example Distribution"
  },
  "items": [
    {
      "externalId": "film-100",
      "title": "Example Movie",
      "releaseYear": 2024,
      "description": "The distributor-provided catalog description.",
      "runtimeSeconds": 5400,
      "categories": ["Drama"],
      "tags": ["independent", "feature"],
      "mediaUrl": "https://media.example.com/example-movie.mp4",
      "poster": {
        "url": "https://media.example.com/example-movie.jpg",
        "rightsConfirmed": true
      },
      "rights": {
        "holder": "Example Distribution",
        "licenseType": "SVOD",
        "startAt": "2026-01-01T00:00:00.000Z",
        "endAt": "2027-01-01T00:00:00.000Z",
        "territories": ["US", "CA"],
        "exclusive": false,
        "confirmedForStreaming": true,
        "notes": "Rights reference supplied by the distributor."
      }
    }
  ]
}
```

## Administrator Assistant

The owner-only **Assistant** tab provides operational status, audit summaries, rights guidance,
configuration checks, and ingestion troubleshooting. Messages and replies are stored in the
Firestore `adminAssistantLogs` collection.

Ordinary questions use the configured AI provider with current PROtv queue, catalog, job, audit,
and configuration evidence. Recent messages and the currently discussed catalog title are carried
into follow-up questions, allowing prompts such as “Why?” or “What source did that title come
from?” without returning a generic dashboard summary. If the provider is unavailable, the
Assistant reports a focused evidence-based fallback instead of inventing an answer.

The Assistant can prepare catalog-only corrections for descriptions, years, runtimes,
categories, metadata, and posters. It displays the current metadata and requires a separate
**Confirm Change** action before writing. Confirmation tokens are tied to the signed-in
Administrator and expire after ten minutes.

Supported examples:

- `Replace the description for Example Film with A corrected description.`
- `Fix the year for Example Film to 1940.`
- `Correct the runtime for Example Film to 95 minutes.`
- `Move Example Film to category Drama.`
- `Regenerate metadata for Example Film.`
- `Generate a new AI poster for Example Film.`
- `Swap to the IA poster for Example Film.`
- `Update the poster for Example Film to https://example.com/poster.jpg`
- `Can you fix the Example Film poster?`

Natural poster-fix requests choose the title's verified Internet Archive artwork when available,
then a configured AI image, and otherwise a clean locally generated poster. The Assistant still
shows the proposed source and waits for **Confirm Change** before replacing anything.

The Assistant cannot publish or delete titles, upload video to Mux, or run ingestion and
discovery pipelines. Catalog changes require verified rights and are recorded in the shared
Administrator audit log.

The feed's media URL must be reachable by Mux. It may be a time-limited signed HTTPS URL, but
it must remain valid long enough for Mux to retrieve the video. Distributor credentials and
private rights-window fields are never returned by the public catalog API.

## Troubleshooting
- **Port already in use**: Change `PORT` in `.env`
- **Firebase auth error**: Check `serviceAccountKey.json` path in `.env`
- **CORS errors**: Check `FRONTEND_URL` in `.env`
- **Admin Bot is not configured**: Set `PD_CONTENT_DIRECTORY` and the text AI variables.
- **Movie remains in draft**: Check Mux credentials and the Admin Bot failure summary. The bot
  never publishes a movie before Mux provides a public playback ID.
- **Distributor feed cannot be loaded**: Confirm the HTTPS feed URL and bearer token. Do not
  place the token in the feed URL.
- **Distributor title is skipped**: Review its rights dates, streaming confirmation, and required
  territory in the Administrator report.
