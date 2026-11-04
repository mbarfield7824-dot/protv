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

### Creator Portal trailers and Coming Soon pages

A series trailer already uploaded in the Creator Portal is reused, not uploaded again. An Administrator opens the
series in the Creator Portal (Release details → **PROtv Coming Soon**), records where the signed agreement grants
promotional use, and approves. The portal then sends the signed `series_promotion` action to
`/videos/integrations/creator-actions`; PROtv creates or adopts exactly one `SERIES` record (`creator_series_<projectId>`
unless a show record with the same title already exists), copies the poster through the existing hardened poster
transfer, and has Mux fetch the trailer once from a short-lived signed portal link as a signed-playback asset. Later
syncs reuse that asset. The page is public at once as **Coming Soon**; Watch Trailer appears when Mux finishes.

Premiere date and weekly slot come only from premieres an Administrator confirmed in the portal's weekly schedule;
without one the page says "Premiere date to be announced". Schedule changes refresh the page automatically.
Episodes are not touched: they stay held with no playback ID until their own release. The record carries no Roku
or Fire TV flag. Replacing the trailer in the portal stops it showing until it is approved again; **Withdraw from
PROtv** hides the page (`approvalStatus: draft`) and keeps the Mux asset for re-approval. Requires
`CREATOR_AGENT_ORIGIN`, `PROTV_PUBLISHING_SECRET` and the Mux signing keys, all already used by episodes and trailers.

No approved public trailer was available during implementation verification. One authorized Admin upload is still
needed to verify real Mux trailer playback, distinct media, and return-to-details behavior on desktop and mobile.
