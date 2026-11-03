# PROtv branding and short links - production deployment report

## Status

DEPLOYED following explicit release approval on 2026-11-03. No Git push or Render
trigger. Branch: `feature/brand-short-links`, based on `56cb498`, preserving the
Podcast collection cleanup, ingestion controls, seasons and uploads.
Implementation commit: `e4a6a81fc848c9b055d01576c4848c94d96b5026`.
Deployed source commit: `4b203d0` (includes the required Vercel packaging correction).
Upstream `main` remains `cac9afc10e9871ac3fc7ca84d6ab3c4283c303bf`.

Current live deployment: `dpl_2dxATFmVBLKd7cmtHoNQrTfRqiuW`,
immutable URL https://protv-mug3e95rl-pro-tv1.vercel.app.
Live short link: https://watchprotv.com/MMWF.
Live destination: https://watchprotv.com/podcast/me-and-my-white-friend.
Admin management: https://watchprotv.com/admin#short-links.

The verified previous live rollback deployment is `dpl_DVbjpbrEk1bCa1VdYa4okiY6GqmD`,
immutable URL https://protv-af1dgk1mf-pro-tv1.vercel.app.
The live site is https://watchprotv.com.

## Production release verification

The previous deployment and upstream commit were unchanged immediately before
promotion. Source was deployed from a detached, tracked-only worktree using
`--prod --skip-domain`; its private candidate was verified before explicit
promotion. No shared-workspace credentials or unrelated untracked applications
were included, and deployment protection was not disabled.

The first candidate submission was rejected before deployment because Vercel
requires `includeFiles` to be a string rather than an array. Commit `4b203d0`
changes only that setting to a two-path brace glob and its corresponding test.
The resulting Vercel production build passed, and both the built HTML and
original supplied PNG were verified from the deployed function.

| Requirement | Production verification |
| --- | --- |
| `/MMWF` | Browser navigation reaches the exact featured Podcast URL; lowercase/mixed-case variants work; direct entry and refresh passed. |
| Social preview | Facebook crawler requests receive initial OG/Twitter title, official description, canonical URL and original artwork without JavaScript. PNG bytes match the source exactly. |
| Branding | Visible homepage, both footer styles, About and creator messaging checked; default metadata uses the new slogan; retired slogan absent from the live JavaScript bundle. |
| Admin security | Missing/invalid-token reads and missing-token create/update attempts return 401; direct unauthenticated Firestore registry reads return 403; signed-out Admin pages expose no management controls. Existing interactive-Admin authorization is retained. |
| Existing content | Movies, series, Music, Podcasts, privacy, actual movie detail, `/admin#mmwf`, and the three already-published Episode links passed browser checks. |
| Rights and publication | Read-only before/after hashes of protected status, approval, rights, license, agreement, revenue, release, linkage and media-ID fields match across all 112 catalog records. All 55 public catalog IDs are identical. |

Private-candidate and live Chromium reviews passed at 1440, 768, 390 and 320
pixels, with supplied artwork loaded, no horizontal overflow and zero uncaught
JavaScript errors. About, creator recruitment and existing routes were also
checked at desktop and mobile widths.

Preflight production build, lint, 158 frontend tests and 60 affected backend tests
passed. The packaging correction passed a further 21 focused tests. Direct-upload
save-and-ingest, season, attachment and approval guards retain their automated
coverage. No real video was uploaded, reingested, duplicated or published during
deployment verification.

Only the authorized persistent `shortLinks/mmwf` record was created in production,
active at version 1. Its destination is the existing featured Podcast page.
Fresh-process reads confirmed persistence. No example short links were assigned.

### Verification boundaries

No signed-in owner session was available in the shared live browser. Therefore,
live authenticated Admin editing and a real production Mux upload were not
performed. Create/edit/activate/deactivate/copy/conflict behavior passed the
actual Admin component and backend HTTP fixture tests before release; live
unauthorized access was checked on both the private candidate and public site.
Existing signed-in access requirements were not bypassed, and no account roles
were altered.

Social HTML and the publicly fetchable original PNG are verified. Facebook and
other platforms may retain earlier cached cards; an actual platform cache refresh
or account-specific rendered sharing card was not claimed.

## Finished website changes

- Shared website branding: **PROtv - Where the Fire Lives!**, with the official
  flame-emoji version visible in the homepage hero, global footers and About page.
  Accessible text omits the emoji. Creator recruitment and default SEO/social
  metadata use the same branding. The retired slogan is absent from active
  production frontend source.
- Me and My White Friend recognizes **Reggie Reg and Marv** throughout featured
  pages, artwork captions, official draft forms, Admin instructions, public Show
  projections and sharing metadata. Existing supplied artwork is unchanged.
  Public host/description normalization does not write approved catalog records.
- Production remains the React/Vite application in `frontend/`. No dependencies,
  licensing terms, revenue shares, app releases or Creator Portal gates changed.

## Short-link management

Open **Admin > Tools > Short Links**, or `/admin#short-links`.
Authorized interactive Firebase administrators can create, edit, activate,
deactivate, list with pagination, and copy links. Stale edits and conflicting
assignments return explicit errors; refresh before retrying.

The registry is Firestore collection `shortLinks`, keyed by lowercase slug.
Preferred capitalization is retained. Transactions enforce uniqueness, including
inactive links, and optimistic version checks. Existing route names and static
directories are reserved; tests enforce reservation when routes are added.
There is no public registry listing, private creator profile exposure, or public
write endpoint. Production refuses ephemeral file-storage fallback.

Supported kinds: creator, film, series, podcast, music, featured.
Destinations must be validated internal public content paths. External URLs,
protocol-relative URLs, traversal, encoded separators, queries, fragments and
short-link chains are rejected. Creator links can identify a creator's approved
public work or the recruitment page; this release does not invent public creator
profile URLs or expose private Creator Portal records.

Public content eligibility and actual metadata/artwork are rechecked on every
resolution. Unpublished targets and inactive/unknown links return 404; registry
outages return 503. Existing qualified-view tracking is unchanged. Optional
per-link visit/view attribution is not implemented or enabled in this release;
no identifiers, new counters or duplicate playback events are collected.

Sharing responses contain OG/Twitter metadata in initial server HTML, followed
by nonce-protected browser navigation to the validated long URL. No user-agent
cloaking or JavaScript execution is required to read crawler metadata. With
JavaScript disabled, a Continue link remains available. The long featured
Podcast URL also receives server metadata and the original supplied PNG.

### Official MMWF assignment

`/MMWF` maps to `/podcast/me-and-my-white-friend`. `/mmwf` and mixed-case variants
resolve to the same record. Its promotional page works even before publication;
episode buttons still depend on the existing approved, published catalog.

The production registry and isolated local preview registry each contain the
official MMWF assignment. No `/Dreadheads`, `/MrCeasefire` or `/TheThirst`
assignments have been made; all three return 404 on the live site.

For an explicitly approved setup or an idempotent verification of this record,
the existing setup command uses configured production credentials:

```powershell
Set-Location D:\protv\backend
node scripts\seed-short-links.js --approved-production
```

Alternatively, if the record is absent, an authorized administrator can select
**Prepare Official /MMWF** and save it in Short Links. Setup never overwrites a
conflicting or inactive assignment.
The script requires the explicit approval flag for any Firestore-backed seed.
No seed operation creates, duplicates, uploads, ingests or publishes a video.

## Local approval preview

- Homepage: http://127.0.0.1:4173/
- Working short link: http://127.0.0.1:4173/MMWF
- Isolated Admin review: http://127.0.0.1:4174/admin#short-links

The public preview serves the actual production build, proxies only read-only
public catalog requests and denies Admin writes. The separate loopback-only
Admin fixture renders the actual Admin components and sends real HTTP requests
to the new backend router with a local-only authorization fixture and persistent
local registry. It cannot change production records or upload episodes. No
authorization fixture is included in production source. Local analytics is off.

The preview helper and screenshots are session artifacts, not deployed files.
The public catalog currently exposes three published MMWF episodes; the preview
retains those real watch links. Empty-catalog tests still verify Coming Soon.
No episodes were published or altered by this assignment.

## Verification

- Production `npm run build`: passed.
- `npm run lint`: passed.
- Full frontend suite: **158 passed**; final Admin-focused rerun: **15 passed**.
- Affected backend suite: **60 passed**, covering links, public catalogs, Podcast
  uploads/attachments/seasons/approval, Music, title HTML, sitemap and playback
  deduplication. Final metadata-focused rerun: **28 passed**.
- Chromium: 1440, 768, 390 and 320 pixel widths; homepage carousel navigation,
  direct `/MMWF`, refresh, supplied artwork, updated hosts, three actual Episode
  links and no horizontal overflow. About/creator messaging also checked on
  desktop and mobile.
- Existing movies, series, Music, Podcasts, privacy, actual movie detail and
  signed-out `/admin#mmwf` checked. Local Admin create/edit/copy and explicit
  activation/deactivation, reserved-route and case-conflict errors verified.
- Initial HTML checked as a Facebook crawler without running JavaScript.
  Browser review completed with zero uncaught JavaScript errors.
- Same **55 public catalog IDs** before and after the assignment; no production
  writes or Render triggers.
- Vercel dry-run packaging from an isolated tracked-only worktree passed:
  440 source files, including the shared registry/brand definitions, server
  modules and original PNG. No deployment was created. Private environment
  files and unrelated untracked applications were absent; the existing tracked
  frontend environment file contains only the public relative API setting.

The existing large-bundle Vite warning remains. Dependency advisories from the
baseline were not changed. Live Firestore persistence and Vercel edge routing
were subsequently verified in the approved release described above. Automated
Firestore transaction-contract tests use an injected test database; production
setup used existing protected service credentials after verifying that their
project matches the deployed website. Third-party social cache appearance and
live signed-in Admin editing are not claimed.

## Deployment safeguards and rollback

The following approval-gated sequence was completed for this release. Repeat
the current-production checks rather than assuming these deployment IDs remain
the latest baseline in a future release.

1. Reconfirm current live deployment and upstream commits. If either advanced,
   integrate that work before deploying; never replace it with this older tree.
2. Use an isolated tracked-only Git worktree. Never upload the shared workspace
   containing unrelated untracked applications, reports or credentials.
3. Explicitly seed only MMWF after release approval, refusing any conflict.
4. Build a Vercel production candidate with `--prod --skip-domain`; do not push
   Git or trigger Render. Check candidate metadata, PNG responses, case variants,
   existing routes and authorized Admin access before promotion.
5. Promote only after those checks pass. Recheck desktop/mobile and the unchanged
   catalog on the public domain.

Rollback command for the currently verified baseline:

```powershell
vercel rollback dpl_DVbjpbrEk1bCa1VdYa4okiY6GqmD --yes --scope pro-tv1
```

A code rollback does not delete registry records or affect the catalog. Keep
assigned slugs reserved rather than deleting/reassigning them. If a link needs
to be disabled, explicitly deactivate it through authorized Admin controls.

## Changed files

- Shared: [brand](../shared/brand.json), [official Podcast](../shared/featuredPodcast.json),
  [reserved routes](../shared/shortLinkRoutes.json).
- Backend: [router](../backend/src/shortLinks/router.js),
  [store](../backend/src/shortLinks/store.js), [validation](../backend/src/shortLinks/validation.js),
  [metadata](../backend/src/shortLinks/metadata.js), [HTML](../backend/src/shortLinks/html.js),
  [seed](../backend/scripts/seed-short-links.js), [app](../backend/src/app.js),
  [Podcast projection](../backend/src/catalog/podcasts.js),
  [title HTML](../backend/src/catalog/titleHtml.js).
- Frontend controls: [Short Links](../frontend/src/components/AdminShortLinks.jsx),
  [client resolver](../frontend/src/pages/ShortLink.jsx), [API](../frontend/src/api.js),
  [routes](../frontend/src/App.jsx), [Admin](../frontend/src/pages/Admin.jsx),
  [navigation](../frontend/src/admin/commandCenterNavigation.js),
  [Podcast forms](../frontend/src/admin/podcastAdmin.js),
  [Podcast Admin](../frontend/src/components/AdminPodcasts.jsx),
  [Admin styles](../frontend/src/styles/Admin.css).
- Branding: [slogan](../frontend/src/components/BrandSlogan.jsx),
  [hero](../frontend/src/components/CinematicHero.jsx),
  [creator banner](../frontend/src/components/CreatorBanner.jsx),
  [footer](../frontend/src/components/Footer.jsx),
  [global footer](../frontend/src/components/ProTVFooter.jsx),
  [artwork caption](../frontend/src/components/PodcastArtwork.jsx),
  [Podcast constants](../frontend/src/data/featuredPodcast.js),
  [featured page](../frontend/src/pages/FeaturedPodcast.jsx),
  [About](../frontend/src/pages/About.jsx), [Creators](../frontend/src/pages/Creators.jsx),
  [HTML defaults](../frontend/index.html), [accessible text styles](../frontend/src/index.css).
- Hosting: [Vercel](../vercel.json), [bridge](../api/index.js), [ignored local state](../.gitignore).
- Tests: [short links](../backend/test/shortLinks.test.js),
  [catalog/bridge](../backend/test/catalogReadModel.test.js),
  [title HTML](../backend/test/titleHtml.test.js),
  [Admin UI](../frontend/test/adminCommandCenter.test.js),
  [Podcast hosts](../frontend/test/featuredPodcast.test.js).
- Documentation: this report.
