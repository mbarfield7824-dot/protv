# How PROtv deploys

Written 2026-11-02, after the website history was reconciled into `main`.

## What deploys what

| Piece | Host | Trigger |
|---|---|---|
| Website and its API (`watchprotv.com`) | Vercel project `protv` | A push to `main` of this repository builds production |
| Creator Portal (`creators.watchprotv.com`) | Render `protv-creator-agent` | Manual only: a deploy of one exact commit. Auto-deploy is off |
| Roku and Fire TV apps | Store packages | Released from their own branches. They read the website API |

## Older Render services

`protv`, `protv-1`, `protv-2`, `protv-3` and `protv-4` track `main` but have **auto-deploy off** (set 2026-11-01), so a push to
`main` no longer touches them. No release line references their hosts. Three of them last failed to build and one failed to update.
They were not deleted or suspended: that needs a separate decision. If auto-deploy is ever turned back on, a push to `main` will
rebuild them.

## Rules

- `main` is what is live on the website. Fast-forward only. Never force-push.
- Before merging, run `npm test` in `backend` and `frontend`, and `npm run build` in `frontend`.
- Roll the website back with `vercel promote <previous deployment>`, then revert on `main`.
- Roll the portal back by deploying its previous commit. Its database changes are additive, so older code still runs.

## Weekly premieres

The portal holds the schedule in SQLite and a worker checks it every 15 seconds. At 72 hours before a premiere it sends the video to
Mux with no playback ID, so nothing can be played. At the release time it creates one public playback ID and the episode appears in
the catalog. Unpublishing deletes the ID. Apps need no update and the catalog is not cached at the edge, but an app only sees a new
episode when it next loads the catalog.

Fire TV shows a scheduled episode only if an Administrator ticked its clearance when scheduling.

## Movie and episode premieres

The Admin file/URL upload forms accept an Eastern-Time premiere. Scheduled uploads use signed-only Mux playback,
remain drafts, and require a rights holder and verification notes. An Administrator must approve the record; the
public catalog and playback-token endpoint then enforce the stored release instant on every request. Existing
published titles are not rescheduled or changed by this flow. A separate trailer asset stays signed and can be
previewed by Admin; public trailer tokens require title approval and do not expose the full-production token early.

Approved upcoming movies appear in Movies and upcoming episodes appear under their series. Detail pages expose
only public metadata, artwork, and an Eastern-Time premiere date, not full-production playback IDs or tokens.
Watch Now appears after a server eligibility recheck at the premiere (and only once the production is ready).
Signed productions have public detail pages without embedding their streaming address in HTML or JSON-LD.

## Admin trailer uploads

Trailers upload directly to Mux as signed-only assets. The Admin preview uses a short-lived playback token;
the public catalog issues one only for an approved movie, episode, or show with a ready trailer. Configure
`MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY` in the backend/Vercel environment before enabling uploads.
Replacing a trailer keeps the current one available until the new upload is ready; removal deletes the Mux asset.

Movie and episode posters open details; their explicit Play controls still open the full player. Detail pages
show Watch Trailer only for a ready uploaded trailer. The same trailer remains available after the premiere.
The trailer dialog never autoplays and restores focus and scroll on closing; Escape and keyboard navigation use
the browser's native modal dialog.

For a show trailer, Catalog & Metadata provides **Add a show-level trailer record**. Enter the exact series title,
synopsis, and documented trailer rights. This creates a separate `SERIES` draft, never edits existing episodes,
and does not grant device rights. Upload its trailer and poster with the existing controls, then review and approve
the draft in Review Content. Its trailer and synopsis appear on the matching series detail page. Episode trailers
remain independent and are never silently reused as show trailers. Duplicate show records are rejected.

### Coming Soon trailers (Owner/Administrator)

The Owner/Administrator publishes a Coming Soon listing for a project that already exists in the Creator Portal:
open the project → **Release details** → **Coming Soon Trailer**. Upload a trailer (or select the project's existing
trailer or teaser), preview it, optionally enter an Eastern Time premiere date, tick the confirmation that the
project's promotional rights permit it, and choose **Publish Coming Soon**. **Unpublish Coming Soon** removes the
public listing and keeps the project and its trailer. Uploading never publishes anything, and only the chosen project
is ever sent.

The portal sends the signed `series_promotion` action to `/videos/integrations/creator-actions`. PROtv writes exactly
one record, `coming_soon_<projectId>`, linked only by `comingSoonProjectId`: a `SERIES` show page for a series, or a
`MOVIE` title page with no media for a film. It is never linked by `creatorProjectId`, so the final release workflow
(`creator_<projectId>` movies and `creator_episode_*` episodes) is unaffected. A title match never claims a record: if
another unlinked show or episode uses a series' title, or the reserved ID holds something else, nothing is written.
Title, poster and synopsis come from the project; the poster uses the existing hardened transfer. Mux fetches the
trailer once from a short-lived signed portal link as a signed-playback asset, reused on later syncs. The listing is
public at once; Watch Trailer appears when Mux finishes. Without a premiere date it says "Premiere date to be
announced". No Roku or Fire TV flag is set. Unpublishing sets `approvalStatus: draft` and keeps the Mux asset.
Requires `CREATOR_AGENT_ORIGIN`, `PROTV_PUBLISHING_SECRET` and the Mux signing keys.

Published listings are discoverable on the homepage: a **Coming Soon** row after New on PROtv (hidden when empty)
and a **Coming Soon** tile first in Browse by Category (an empty state when none). Both read
`GET /api/v1/catalog/coming-soon`: published shows with no released episode and Coming Soon films whose real
`creator_<projectId>` title is not yet playable. A show leaves Coming Soon when its first episode is released; a film
when its real title is released. The listing record and trailer are kept. TV platforms receive none.

### Categories

In Admin → Catalog & Metadata each title has a **Primary genre** (stored as `category`/`genre`, which the TV apps
group by) and **Also show in** chips for more categories (stored in `categories`, primary first, no duplicates,
at most 8). A title appears in every matching category row. New on PROtv stays automatic, by approval recency.
An edit that sends only `category` keeps the other categories. Saving a show record keeps its `seriesTitle`.

### PROtv Originals

PROtv Original is an Administrator branding designation, not a genre: `protvOriginal: true` on a movie or show record,
set in Admin → Catalog & Metadata with the **PROtv Original** checkbox (who and when are recorded). It never changes
categories, approval, rights, release or Roku/Fire TV eligibility, and nothing sets it automatically. A Coming Soon
listing can be an Original; a released Creator Portal film inherits the designation from its Coming Soon listing, and a
show stays an Original as episodes are released. `GET /api/v1/catalog/originals` feeds the homepage **PROtv Originals**
row (after Coming Soon) and the permanent **PROtv Originals** Browse tile; each title appears once, with the same public
eligibility and playback rules as everywhere else.

### Sponsored placement (Adsterra Native Banner)

One homepage Sponsored section after New on PROtv, Coming Soon and PROtv Originals, before Spotlight, and one at the end
of each movie / Coming Soon title page, series page, Podcast show page and the Movies, Documentaries, Series, Music,
Podcasts and Cartoons browse pages (removed while a trailer plays; never on players, episode pages, account, sign-in or
Admin). The script skips a second set-up on the same page, so `frontend/src/ads/sponsoredSession.js` requests the unit
once per page load and moves the rendered unit between sections during in-app navigation; an empty, blocked or failed
request is not retried until reload, and the switch is read once per page load. It is controlled
by Admin → Monetization → **Sponsored Placements**, stored in Firestore `siteSettings/advertising`
(`nativeBannerEnabled`, default off, audited) and read by `GET /api/ads/placements` (fails closed). The approved script
and container are fixed in `frontend/src/ads/sponsored.js`; the switch cannot change them. Each viewer must choose
"Allow sponsored content" before anything from Adsterra loads; Global Privacy Control means no prompt and no ad; the
choice is stored in `localStorage`. The script is added only inside that section (never in `index.html`), removed on
leaving the page, and an error or empty response removes the section. Placement outcomes are sent to Vercel Analytics
as `sponsored_native_banner` events; impressions and earnings come only from Adsterra.

No approved public trailer was available during implementation verification. One authorized Admin upload is still
needed to verify real Mux trailer playback, distinct media, and return-to-details behavior on desktop and mobile.
