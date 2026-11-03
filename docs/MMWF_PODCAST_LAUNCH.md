# Me and My White Friend - approval candidate

## Application and local preview

The production React/Vite app is `frontend/`, as configured by `vercel.json`.
The repository root is a backend package with a legacy, unused React source tree.
The earlier React resolution failure came from building that legacy tree, not
from missing production dependencies. No React duplication or Vite aliases are
needed. Root `build`, `lint`, `test`, and `dev:website` commands now delegate to
the production frontend. Backend scripts and production build settings are unchanged.

Run `npm run build`, `npm run lint`, and `npm test` at the repository root.
Use `npm run dev:website -- --host 127.0.0.1` for development, or
`npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173`
after a build. Open `/podcast/me-and-my-white-friend` and the homepage.
The website's existing frontend API environment configuration is used.
The approval preview for this session runs on `http://127.0.0.1:4173` with a
local, read-only proxy to the existing public production catalog. All non-GET/
HEAD API calls and nonpublic API routes are rejected locally. A plain Vite
preview does not provide API proxying for production's relative `/api` URL;
use an approved read-only local proxy or a configured development API when
restarting the preview.

## Catalog and artwork

The feature uses the supplied original PNG and a lossless banner crop removing
only its surrounding blank margin. No stock or generated imagery is used.
No separate promotional photographs were supplied; no gallery or invented
host biographies are included. Hosts and show copy are the approved Reg and
Marv description supplied for this assignment.

The public `/v1/catalog/podcasts` API discovers the approved `PODCAST_SHOW` by its
official title (case, whitespace, punctuation, and ampersand normalized).
Exactly one match is required. Its real ID is then used for the existing Show
detail endpoint; every episode must retain that parent ID and typed
`PODCAST_EPISODE` relationship. Duplicate Show matches produce an explicit
error rather than choosing an arbitrary record.

At implementation time the production public Podcast catalog returned no Shows.
This is a promotional page, not a catalog publication: an empty catalog shows
Episodes Coming Soon; API failure has a separate retry state. Loading is bounded
to ten seconds. Public availability refreshes every minute while visible and
on focus/visibility changes; no local placeholder episodes are used.

When Creator Portal approval and publishing are complete, the normal public
Podcast Show and its Episodes appear automatically. Do not reclassify creator
TV series or infer episode ownership from title fragments. If these videos are
published as TV series rather than Podcast Episodes, confirm the official
catalog relationship before separately adapting this feature.

Only the existing public read endpoints are called. No ingestion, publication,
approval, contracts, rights records, schedules, or revenue shares are changed.
Watch actions use the existing `/player/:id` route and public eligibility
recheck. Missing thumbnails use the supplied banner; missing runtime/date/
description is omitted, never invented. Generic Show URLs for this property
redirect to the branded page; other Shows remain unchanged.

## Production safety and rollback

**Public deployment is not approved. Do not push this branch or deploy it until
the owner approves the actual mockup.** No Vercel deployment, alias, Render
service, or catalog write is part of this assignment.

The feature branch is based on the verified live `main` commit, not the older
mobile development branch:

- Commit: `cac9afc10e9871ac3fc7ca84d6ab3c4283c303bf`
- Production deployment: `dpl_2nCRMDT8DcoujvXHEyXXsoHgeZBC`
- Immutable deployment URL: `https://protv-2md8tss9a-pro-tv1.vercel.app`
- Production alias: `https://watchprotv.com`
- Deployment was READY and matched the live commit during read-only inspection.

Before any later release, inspect the live alias again, fetch `origin/main`,
and integrate newer production commits if present. Review only the podcast
diff, rerun build/lint/tests and visual review, obtain owner approval, and use
the existing Vercel project/pipeline. Preserve its API rewrites, sponsor page,
legal/account changes, and catalog enforcement. Do not touch Render.

Keep the then-current immutable production deployment as the rollback target.
If the recorded target is still the pre-release production version, an
authorized operator can use Vercel's **Instant Rollback** to
`dpl_2nCRMDT8DcoujvXHEyXXsoHgeZBC`; verify `/`, `/podcasts`, movie/series/music
routes and API health afterward. No data rollback is needed because this
feature does not modify catalog records.

## Verification

- Production `npm run build`: passed using the real frontend. The existing
  large-bundle warning remains; it also occurred on the unchanged live baseline.
- Full `npm run lint`: passed without disabling rules.
- Full `npm test`: 148 passed, zero failed.
- Existing backend Podcast catalog/Admin suites: nine passed. Tests used local
  fixtures, not production writes.
- Chromium review at 1440, 768, 390, and 320 pixels: artwork decoded, no horizontal
  page overflow, correct Coming Soon state, no placeholder player links.
- Homepage retained six slides (brand, Podcast, four existing featured titles).
  Next/previous, keyboard slide selection, direct Podcast routing, desktop and
  mobile artwork and spotlight were verified.
- Existing real public movie detail, series detail, and Music browse/detail
  routes passed browser smoke checks. No uncaught browser errors.
- Published-episode rendering, missing-art fallback, actual-ID watch links,
  held/invalid Episode exclusion, unavailable API/retry, focus refresh, and
  generic Show redirection are covered by automated rendered tests.
- No production deployment or catalog mutation was performed.

The only content dependencies are the approved Podcast Show/Episode records
and optional separate promotional photos. Neither is required to approve the
Coming Soon mockup. Three pending videos are not represented as playable.

## Files changed

- [Root website commands](../package.json)
- [Production routes](../frontend/src/App.jsx)
- [Abortable Podcast detail request](../frontend/src/api.js)
- [Homepage carousel](../frontend/src/components/CinematicHero.jsx)
- [Podcast navigation state](../frontend/src/components/ProTVHeader.jsx)
- [Reusable spotlight](../frontend/src/components/FeaturedPodcastSpotlight.jsx)
- [Supplied artwork presentation](../frontend/src/components/PodcastArtwork.jsx)
- [Original logo](../frontend/src/assets/me-and-my-white-friend.png)
- [Lossless logo banner](../frontend/src/assets/me-and-my-white-friend-banner.png)
- [Official copy and catalog identity](../frontend/src/data/featuredPodcast.js)
- [Read-only catalog refresh hook](../frontend/src/hooks/useFeaturedPodcast.js)
- [Featured Podcast page](../frontend/src/pages/FeaturedPodcast.jsx)
- [Homepage integration](../frontend/src/pages/Home.jsx)
- [Generic Show redirect](../frontend/src/pages/PodcastShow.jsx)
- [Podcast collection spotlight](../frontend/src/pages/Podcasts.jsx)
- [Scoped branded styles](../frontend/src/styles/FeaturedPodcast.css)
- [Catalog logic tests](../frontend/test/featuredPodcast.test.js)
- [Rendered regression tests](../frontend/test/featuredPodcastPage.test.js)
- This launch/rollback record.
