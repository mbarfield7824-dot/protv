# Playback view tracking

Playback telemetry is written by the backend to Firestore. Clients cannot write
the tracking collections directly. The only public catalog field changed by
tracking is the existing `videos/{titleId}.views` counter; it is incremented
transactionally and existing values are preserved. Play starts are stored
separately in `playbackTitleMetrics/{titleId}.playStarts`.

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
4. No production data migration is needed. Existing `views` values are read
   and incremented in place. Do not seed or backfill production counts.

The current PROtv web application links creators to the separate Creator
Portal; this repository does not contain an authenticated creator reporting
surface. Creator view/play-start reporting is therefore deferred. It needs a
Creator Portal integration that can validate project ownership against
`creatorProjectId` and enforce per-project authorization server-side. This
implementation does not send viewer-level data to that portal.

Focused tests use isolated in-memory Firestore fixtures. They do not create
production views.
