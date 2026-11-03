# Me and My White Friend - approved website release

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

### Manual website episode uploads

Open **Admin > Podcasts > Me and My White Friend**, or `/admin#mmwf`.
The regular Upload Content workspace links here, and signed-in administrators
also see **Manage / Upload Episodes** on the featured Podcast page.

1. If no Show exists, its official title, host, description and supplied artwork
   are prefilled. Save the Show draft, review it and explicitly publish the Show.
2. Create an Episode with its actual title, number, rights holder and verification
   notes. Save the draft, then upload the video in the Episode ingestion panel.
   **Season number (optional)** supports season-based releases, including uploads
   attached from the existing catalog. Enter a positive whole number; leave it
   blank for unseasoned episodes. No season is inferred for existing content.
   Season and episode numbers can be edited without reuploading media.
   Admin and viewer listings sort by season, then episode number; episodes
   without a season remain first, with their original Episode-only labels.
   Supplied seasons appear on the featured page, other Podcast Show pages and
   the player. Publication and rights requirements are unchanged.
3. If the file was already uploaded through the ordinary Movies/Series uploader,
   choose it under **Episode video source**. Confirm that it belongs to this
   Podcast, enter its actual episode number and rights evidence, and select
   **Attach Uploaded Video as Draft**. This reclassifies the same record; it
   preserves its ID, Mux media, duration, licensing fields and release restrictions.
   The title leaves Movies/TV Series and its approval resets to draft for review.
   It does not duplicate or reupload media.
4. Once ready, explicitly **Approve Episode**. The parent Show must also be
   published. Uploading, saving or attaching never approves either record.
   Existing release holds/schedules must also allow public availability.

Only ready ordinary manual Movies/TV Episodes can be attached. Creator Portal,
signed-playback and already-typed Podcast content cannot be converted through
this shortcut. The backend rechecks the source and parent inside the same
Firestore transaction. No admin credentials or publishing actions are exposed
to visitors. Administrator workflow work is locked during active upload/polling.

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

The owner approved the website design and production deployment on November 3,
2026. This approval covers only the podcast page, homepage hero, and Podcast
Spotlight. It does not authorize publishing episodes or changing licensing.
Deploy from an isolated checkout of the committed release, excluding the
shared workspace's unrelated untracked files. Use the existing Vercel project
with production settings and `--skip-domain`, verify the READY build, then
promote that deployment. Do not push to a branch that could trigger unrelated
Render services.

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
- Pre-release validation was rerun after owner approval: production build and
  full lint passed, all 148 frontend tests and nine backend Podcast tests passed.
- No catalog mutation is included in this release.

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

## Production deployment receipt - November 3, 2026

The approved release is live:

- Podcast: <https://watchprotv.com/podcast/me-and-my-white-friend>
- Homepage: <https://watchprotv.com/>
- Deployed release commit: `8267a36b4e158449fd7cb8365fd8fbe559e0db55`
- Feature implementation commit: `50c4fff9a84c5afda78cedbebfae960d6eda0166`
- Local branch: `feature/mmwf-podcast-launch`
- Deployment: `dpl_GEqDVFKyfUtji9kdxu34yn5WUEtg` (READY)
- Immutable URL: <https://protv-6pw846mnj-pro-tv1.vercel.app>
- Previous deployment/rollback: `dpl_2nCRMDT8DcoujvXHEyXXsoHgeZBC`
- Previous production commit: `cac9afc10e9871ac3fc7ca84d6ab3c4283c303bf`

Immediately before release, `origin/main` and the live deployment still matched
that previous production commit. It is an ancestor of the release, and there
were no backend, API handler, or Vercel configuration changes. The deployment
used only committed files in an isolated checkout. The upload manifest was
checked for credentials and unrelated workspace files. Vercel built with the
existing production environment and install commands, reached READY with
`--skip-domain`, then was explicitly promoted to the public site.

Live verification passed:

- Desktop 1440px, tablet 768px, mobile 390px and 320px in Chromium.
- Actual supplied logo loaded; both original and banner asset URLs returned 200.
- No horizontal page overflow or clipped mobile hero content.
- Six homepage slides retained; keyboard selection, next/previous, direct
  Podcast navigation, mobile hero and Podcast Spotlight passed.
- Podcast page and About anchor worked, with Episodes Coming Soon displayed
  and zero playable episode links. The public Podcast catalog remained empty.
- Existing real movie, series, Music browse and Music detail pages rendered.
- All 52 public catalog records retained IDs, titles, types, playback IDs,
  release/approval fields, artwork, runtimes, descriptions and series links
  compared with the pre-release public snapshot.
- Homepage, Podcast collection, sponsor page, privacy and account deletion
  routes returned HTTP 200. No uncaught browser runtime errors occurred.

No episode was ingested, approved or published; no licensing agreements,
rights records, schedules or revenue shares were altered. No Render service
was triggered. No Git push was performed, avoiding unrelated deployment
automations. The branch and all release changes are committed locally.
Before a future Git-based deployment, integrate this feature into the intended
release branch so an older `main` build does not remove it.

### Rollback command

Only if a rollback is required, an authorized operator can run:

```powershell
vercel rollback dpl_2nCRMDT8DcoujvXHEyXXsoHgeZBC --yes --scope pro-tv1
```

This restores the prior production deployment. Verify the public domain,
existing movie/series/Music routes and catalog afterward. No data restoration
is needed for this website-only release. The command was inspected but was
not executed; production remains on the new approved release.

### Existing dependency warnings

Vercel's clean install reported npm audit advisories in the existing lockfiles:
root: 14 (9 moderate, 4 high, 1 critical); frontend: 16 (6 moderate, 10 high).
The lockfiles and dependency versions are unchanged from the prior production
baseline. These automated advisories were not an exploitability assessment.
The existing large-JavaScript-chunk build warning also remains. The build
succeeded; dependency remediation needs a separate tested change, not an
automatic breaking `npm audit fix --force` during this approved design release.

## Admin upload integration follow-up - November 3, 2026

The regular uploader creates Movies or TV Episodes; those records do not have a
Podcast Show relationship and must not be guessed into the public Podcast list.
The protected workspace now offers both new Podcast Episode ingestion and
explicit attachment of an existing ready manual upload. The same catalog ID and
Mux media are reused, rather than duplicating content. Show settings collapse
after publication so routine episode uploads remain prominent.

Validation before deployment:

- Production build and frontend lint succeeded.
- All 151 frontend tests and 10 focused backend Podcast tests passed.
- All four changed backend modules passed `node --check`.
- Chromium reviewed desktop 1440px, tablet 768px and mobile 390px/320px layouts.
  No horizontal overflow or uncaught browser errors occurred.
- A local-only authenticated fixture rendered the actual Admin components and
  exercised first-time Show setup, new Episode draft/file upload/readiness,
  existing-upload selection/confirmation/attachment, and separate approval.
  The fixture did not authenticate against or write to production.
- The production-build preview retained six homepage slides, supplied artwork,
  Coming Soon, and existing movie, series and music pages.

No uploaded title has been selected, reclassified or approved by this code
release. The administrator must choose the correct upload and confirm its
relationship, rights evidence and publication on the website. Creator Portal
content remains on its original signed-agreement/approval path.

Rollback target for this follow-up is the **immediately preceding Podcast
design release**, `dpl_GEqDVFKyfUtji9kdxu34yn5WUEtg`,
<https://protv-6pw846mnj-pro-tv1.vercel.app>. Do not use the older initial-launch
rollback if the intent is only to undo the Admin upload integration.

### Admin integration production receipt

- Source commit: `f264573ec1307ed6cddb005b50bb7a6552e7c6e7`
- Branch: `feature/mmwf-admin-uploads`
- Deployment: `dpl_APUP85JRBLrLQ1VvKTTbTowR4LPo` (READY)
- Immutable URL: <https://protv-q7pd370fh-pro-tv1.vercel.app>
- Direct protected workspace: <https://watchprotv.com/admin#mmwf>
- Build used existing Vercel production settings and clean lockfile installs.
  The upload manifest contained 426 files from an isolated tracked-only Git
  worktree; local environment credentials and unrelated workspaces were excluded.
  Deployment was created with `--skip-domain` and promoted only after readiness,
  catalog and authentication checks. Production was checked for intervening
  changes immediately before promotion.
- Live Chromium checks passed at 1440, 768, 390 and 320px. Artwork loaded, six
  homepage carousel slides remained, spotlight navigation worked, existing
  movie/series/music pages rendered, and there were no uncaught runtime errors.
- All 53 pre-deployment public records retained their IDs, types, descriptions,
  media references, artwork, durations, release/approval fields and episode
  relationships. The public Podcast Show list remained empty. The page honestly
  remains Coming Soon until the administrator completes Show/Episode approvals.
- The new attachment API returned HTTP 401 without a website administrator
  token, and the live JavaScript bundle includes the new workspace and API.
  Authenticated write-flow verification used local fixtures, not production
  credentials or actual content mutations.
- No episodes, rights agreements, licensing schedules or revenue shares were
  changed. No Git push or unrelated Render deployment was triggered.

The current rollback command, **only if this Admin release needs reverting**, is:

```powershell
vercel rollback dpl_GEqDVFKyfUtji9kdxu34yn5WUEtg --yes --scope pro-tv1
```

This restores the approved Podcast design without the Admin upload additions.
This deployment itself made no catalog data changes. Any administrator edits
made later are data changes and are not undone by a website deployment rollback.

### Podcast seasons follow-up - November 3, 2026

Optional season numbering is deployed from commit
`f7d6396ac694a877d4a33d13d564ddd5b853d60c` on
`feature/mmwf-podcast-seasons`. The Admin form, creation, attachment, editing,
public catalog ordering, featured and generic Show labels, and player all
preserve the supplied season. Missing seasons remain unset, not inferred.

- Deployment: `dpl_FkvRDdiXkQeTKz8ZMznne2Pq1rJt` (READY).
- Immutable URL: <https://protv-mpu9lxule-pro-tv1.vercel.app>.
- Local production build, lint, 152 frontend tests and 11 backend tests passed.
- Local authenticated UI fixtures verified seasons on both existing-upload
  attachment and new file upload; desktop, tablet and mobile layouts passed.
- Live bundle contains the season input and validation. Public browser checks
  passed at 1440, 768, 390 and 320px with loaded artwork, working homepage
  carousel and existing movie, series and music pages; no uncaught errors.
- All 52 public catalog records and the empty public Show list matched the
  snapshot immediately before this deployment. No records were migrated,
  reclassified, published or otherwise modified by this release.
- Deployment used an isolated tracked-only worktree with a checked 426-file
  manifest, successful clean production build, `--skip-domain`, then promotion
  after source/readiness/catalog checks and reconfirmation of the live rollback.
- No Git push, Render deployment, agreement or revenue-share change occurred.

To undo only the season update, the current rollback target is the preceding
Admin integration, not the older Podcast design release:

```powershell
vercel rollback dpl_APUP85JRBLrLQ1VvKTTbTowR4LPo --yes --scope pro-tv1
```

Website rollback does not undo season metadata entered later by administrators.

### Ingestion button usability correction

Unsaved Episode metadata (including a changed season) previously disabled both
ingestion buttons, even after choosing a file, with the save instruction above
the ingestion panel. Upload now explicitly offers **Save Changes & Upload File**
or **Save Changes & Ingest URL**. It validates required fields, saves metadata,
refreshes the saved record, then starts ingestion only if that save succeeds.
Failed or invalid saves retain the selected file and do not request Mux uploads.

The ingestion panel now states its exact blocking reason: stale catalog,
operation in progress, approval not draft, processing already active, or media
asset already present. A non-draft record must explicitly return to draft;
uploading never silently unpublishes or approves a title. Empty-source prompts
and unsaved-change instructions are beside the buttons and linked accessibly.

Validation includes an isolated HTTP integration exercise using the actual
frontend API/XHR client and actual backend Podcast router, with injected local
storage and Mux-service fixtures. It saved the changed season, requested an
upload URL, conditionally claimed ingestion, transferred actual file bytes by
HTTP PUT and polled to ready while leaving approval draft. External Mux
transcoding was simulated; no test media or production records were ingested.
