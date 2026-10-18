# Creator release controls

Open **Admin > Content > Release Controls**. Creator uploads, signed agreements,
approval, media processing, and public release are separate steps.

## Workflow

- New Creator Agent movies and episodes are held, including after Mux readiness.
- Release an episode/title now, schedule a future release, or hold/unpublish it.
  Holding also cancels its previous schedule.
- Series gates start open for backward compatibility. Hold a series to hide all
  its episodes, including future uploads. Open or schedule that gate when ready.
  Opening a gate does not release held episodes or override episode schedules.
- For a series premiere, hold the series gate first, release the desired episodes,
  then open/schedule the series gate. Episodes added later still start held.
- Approval and media readiness remain mandatory. An episode goes live no earlier
  than both its own release time and its series gate's release time. If processing
  finishes late, availability starts when processing is ready, not before.
- Release times are entered in the selected IANA time zone, stored as UTC, and
  checked on every public request. No cron worker, open browser, or dashboard
  session is needed. Refresh the queue to see current live status.
- Ambiguous/nonexistent daylight-saving wall times are rejected. For a repeated
  hour, select UTC and enter the intended instant.
- Existing records without release fields retain their current visibility.
  Manual admin upload behavior is unchanged; legacy episodes can be held
  individually. Series gates require the stable Creator Agent series ID.

## Deployment requirements

Configure `MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY` on the PROtv backend
before authorizing new creator ingestion. Use a Mux signing key ID and its
base64-encoded RSA private key, not the Mux API access token. Never commit keys.
Without these settings new signed ingestion fails explicitly; no public asset
is created as a fallback.

Deploy the PROtv backend/frontend and Creator Agent UI together. The Fire TV
playback client also needs the accompanying signed-token support before newly
protected titles are played on TV. No data migration or paid media calls are
required to deploy the code.

## Enforcement and limitations

Catalog browse/search, series detail, title detail/SEO, sitemap, direct player
links, playback authorization, ad-session eligibility, and playback tracking
respect holds and schedules. Processing callbacks do not alter release settings.
Release writes and audit entries are committed together in a Firestore
transaction. Production storage errors fail closed.

New creator assets use Mux **signed** playback. A playback ID alone cannot play
held media. Tokens are issued only for currently eligible titles and last at
least one hour (or the title duration plus 15 minutes, whichever is longer).
Unpublishing prevents new authorizations; it does not revoke tokens already
issued or stop an already-buffered stream immediately.

Legacy assets retain their public Mux policies to avoid breaking existing
playback. Holding them removes PROtv catalog/player access but cannot revoke
previously shared public Mux URLs. The queue displays this limitation. Converting
legacy media to signed-only playback requires a separate reviewed migration.

The Creator Agent's existing integration protocol still reports `processing`
until publication is confirmed, including ready-but-held titles. Its message
explicitly distinguishes processing from ready/held or scheduled, and the API
also supplies `releaseStatus`. A held title cannot activate distribution.

## Data

Title documents use `releaseStatus` (`held`, `published`, `scheduled`), `releaseAt`,
`releaseTimeZone`, `releaseUpdatedBy`, and `releaseUpdatedAt`. Creator media also
stores `muxPlaybackPolicy: signed`. Processing status is unchanged.

Series policies are non-playable `SERIES_RELEASE` records in `videos`, keyed by
`series_release_<seriesId>`. Their approval marker allows the existing approved
catalog query to load policy context even while the series is held. They are
excluded from public projections and ordinary admin catalog editing.
`releaseAudit` stores the actor, target, prior status, new settings, and time.

Admin-only endpoints:

- `GET /videos/admin/releases`
- `PATCH /videos/admin/releases/titles/:id`
- `PATCH /videos/admin/releases/series/:seriesId`

Patch example: `{"releaseStatus":"scheduled","releaseAt":"2026-12-21T01:30:00.000Z","releaseTimeZone":"America/New_York"}`.
Use `held` or `published` without a date for hold/release-now. These endpoints
require an existing authenticated PROtv admin claim and transactional Firestore.
