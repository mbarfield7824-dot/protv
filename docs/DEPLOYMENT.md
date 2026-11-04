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

## Admin trailer uploads

Trailers upload directly to Mux as signed-only assets. The Admin preview uses a short-lived playback token;
the public catalog issues one only for an approved movie or episode with a ready trailer. Configure
`MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY` in the backend/Vercel environment before enabling uploads.
Replacing a trailer keeps the current one available until the new upload is ready; removal deletes the Mux asset.
