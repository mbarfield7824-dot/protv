# Playback view tracking

Playback telemetry is written by the backend to Firestore. Clients cannot write
the tracking collections directly. Counts live only in the private
`playbackTitleMetrics/{titleId}` document (`websiteViews`, `websitePlayStarts`,
and separately `rokuViews`, `rokuPlayStarts`). The public `videos/{titleId}.views`
field is not changed by tracking and is no longer shown on the website. An earlier
`playStarts` field from October 2026 is preserved but not reported.

A qualified view requires at least 30 seconds of client-reported played content
and at least 30 seconds between the server-recorded play start and qualification.
The player accumulates media-time progress only while content is playing at
normal or slower speed. It pauses accumulation during ads, buffering, seeking,
pauses, and faster-than-normal playback. One qualified view is counted per
signed-in account or guest browser identifier per title in a rolling 24-hour
window. Guest identifiers are random first-party local-storage values; they
are not fingerprints. A guest who signs in during a session is associated with
both identifiers to avoid counting that same session twice.

These are platform-reported metrics, not unique-person counts or audited
audience figures. Browser telemetry can be fabricated by a determined client.
View counts must not be used to calculate creator payments or revenue shares.
Tracking errors do not affect playback authorization or playback availability.
Requests are limited per request address and viewer; only keyed hashes are
stored for rate limiting, never raw IP addresses. Admin and verified owner
accounts are excluded server-side. Browser Do Not Track disables client
tracking.

## Configuration and Firestore setup

1. Set `PLAYBACK_TRACKING_SECRET` in the backend environment to a dedicated,
   randomly generated secret of at least 32 characters. Use a different value
   from other service secrets. Tracking returns `503` when Firestore or this
   secret is unavailable; playback itself remains unaffected.
2. Deploy the TTL field overrides from the repository's
   `firestore.indexes.json` (for example,
   `firebase deploy --project YOUR_FIREBASE_PROJECT_ID --only firestore:indexes`).
   TTL is configured for `expiresAt` on playback event,
   session, deduplication, and rate-limit documents. Expiration is asynchronous;
   code checks timestamps directly, so deduplication does not depend on the
   cleanup schedule. Event idempotency is retained for seven days.
3. No composite Firestore indexes or security-rule changes are required. The
   server uses the Firebase Admin SDK, which bypasses Firestore client rules;
   browser clients must not receive write access to these collections.
4. Set `PLAYBACK_REPORTING_STARTED_AT` to the ISO time tracking was enabled. The
   Creator Portal shows this date, and shows "Data unavailable" if it is missing.
   Do not seed or backfill production counts.

Creator Portal reporting reads these counts through the signed `view_metrics`
bridge action. The portal decides which titles a signed-in creator may see from
project ownership. Only per-title website view and play-start totals cross the
bridge; no viewer-level data is sent. Only the website reports these events
today; the Roku, Fire TV and mobile apps do not yet.

Focused tests use isolated in-memory Firestore fixtures. They do not create
production views.
