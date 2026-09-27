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

### Mux webhook

Set `MUX_WEBHOOK_SECRET` to the signing secret for the configured Mux webhook
endpoint (separate from the Mux API token secret). `/videos/webhook` refuses
requests without a configured secret or a valid signature over the exact raw
request body. The Admin upload screen can still poll `/videos/:id/status` with
an authenticated interactive Admin session to reconcile Mux processing when
a webhook is unavailable.

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
