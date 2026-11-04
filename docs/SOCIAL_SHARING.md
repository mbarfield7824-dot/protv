# Content-specific social previews

## Implementation and root cause

The reported URL was
https://watchprotv.com/player/creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d
(**Curtain Call**). It returned the generic React entry HTML to Facebook and
WhatsApp crawlers. The approved movie poster itself returned HTTP 200,
`image/png`, 667x1000. Only `/title/:id`, managed short links and the featured
Podcast page previously had server metadata. Player, series and Podcast Show
detail routes fell through to the SPA before React could load their records.

The rebranding release added generic OG/Twitter tags and a default image; it did
not add the missing content routes. That fallback used SVG text dependent on
server fonts, producing the broken-glyph image shown in the screenshot. The
new fallback uses outlined vector lettering, not installed fonts. The original
featured Podcast PNG is 418x173; its social derivative is now 1200x630.

Vercel now routes `/player/:id`, `/title/:id`, `/series/:id` and `/podcasts/:id`
through catalog HTML rendering before the SPA fallback. All callers, including
WhatsApp, Facebook, X and ordinary browsers, receive the same initial metadata
without JavaScript. The React application and playback routes remain intact.
Player links use their `/title/:id` detail page as the canonical content URL.
Managed creator/film/series/podcast/music links still retain their short URL and
validated destination, with the same current catalog metadata.

- OG/Twitter title: approved content title plus `| PROtv`.
- Description: approved synopsis, or `Watch TITLE on PROtv.` when absent.
- Type: `video.movie`, `video.episode`, `video.tv_show`, or `video.other`;
  Podcast Show and recruitment pages use `website`.
- Twitter card: `summary_large_image`.
- Image: public HTTPS `/api/social/artwork/...`, JPEG, 1200x630, with dimensions,
  MIME type, secure URL and descriptive alt metadata.
- Approved artwork remains complete, centered over a subdued, blurred derivative
  of itself. Portrait posters are not cropped or stretched.
- Podcast episodes without individual artwork inherit their published Show art.
- Missing, unsafe, inaccessible or undecodable artwork gets a font-independent
  PROtv fallback. `X-PROtv-Artwork` identifies `approved` or `branded-fallback`.
  Source failures and fallback use are logged; catalog/storage failures return 503.

## Safety and automatic updates

Only approved, ready, playable, released public titles enter previews. Signed
playback, explicit privacy/restriction/rights holds, rights-window violations,
future releases and episodes without a published parent fail closed. These
checks apply to both HTML and old image URLs. Public metadata does not serialize
raw catalog records, creator contracts, owner information, master URLs or tokens.
The pre-existing featured Podcast promotional page remains public independently
of episode publication; it uses only explicitly supplied public promotional
material, never an unpublished episode record.

Public art comes only from selected promotional fields. The image endpoint does
not accept a caller-supplied URL. Downloads require HTTPS, public DNS pinned to
the TLS connection, no credentials/token parameters, no redirects, a supported
image MIME type, bounded bytes/time/pixels, and full image decoding. Existing
shared public-address validation is reused.

Every HTML and content-image request re-reads the approved catalog. No catalog
mutation, migration, new account permission, playback authorization change, or
Creator Agent deployment is involved. Publishing new work requires no code
deployment. Image URLs include an artwork-derived version; changing approved
artwork changes that URL. Responses disable CDN caching so withdrawal and
metadata changes are not hidden by PROtv's edge cache.

## Verification and platform caching

After a production build, run:

```powershell
Set-Location backend
node --test test\socialPreviews.test.js test\titleHtml.test.js test\shortLinks.test.js test\catalogReadModel.test.js test\podcastCatalog.test.js test\creatorPublishing.test.js
node scripts\verify-social-previews.js --base=https://watchprotv.com --report=C:\path\to\social-preview-verification.json
```

The read-only verification script checks every current public title's player and
detail URLs, series, Podcast Shows, MMWF and its featured destination using
WhatsApp, Facebook and Twitter crawler user agents. It asserts initial title,
description, canonical, card type, unique tags and matching metadata across
agents, then decodes each distinct image and checks HTTP 200, JPEG MIME, byte
limit and actual 1200x630 dimensions. It also checks unavailable links fail closed.

Platforms cache cards independently of PROtv. Old messages may keep their old
preview even after deployment:

1. Open https://developers.facebook.com/tools/debug/ while signed into Facebook.
2. Enter the exact shared URL, then select **Debug** and **Scrape Again**.
   Repeat for the canonical URL shown by the debugger if it has stale metadata.
3. Share the URL in a new message. WhatsApp offers no supported public cache-purge
   API; existing message previews cannot be replaced by PROtv.
4. If a platform still serves a stale card, a new share URL such as
   `?share=20261103` forces a fresh URL lookup on many clients. The canonical
   remains the clean content URL; this is not guaranteed to bypass every cache.
5. Artwork source quality still limits sharpness. A 418x173 supplied image can be
   composed into a valid 1200x630 card, but cannot acquire genuine extra detail.
   Replace low-resolution artwork only through the usual approved-artwork workflow.

Crawler-shaped HTTP checks verify the server contract, not the appearance of an
actual WhatsApp message or Facebook account's cached card. A platform debugger
requiring authentication must not be reported as completed without that access.

## Deployment

### Verified production release - 2026-11-03

**Live and verified.** Repository: `mbarfield7824-dot/protv`.
Branch: `feature/brand-short-links`.
Deployed implementation commit:
`2be576596a010229169be1ae973e096efd9ef531`.
Deployment: `dpl_C7Rc8W9QPFD5VyYy9ZBdEf9mRyvW`.
Immutable URL: https://protv-ksgtykupn-pro-tv1.vercel.app.
Production: https://watchprotv.com.

The candidate was deployed using `--prod --skip-domain` from a detached,
tracked-only worktree. Authenticated Vercel crawler requests verified the movie,
series, Podcast Show, music video, `/MMWF`, artwork generation, 404 handling and
unauthenticated Admin 401 response before explicit promotion. The domain was
verified against the deployment ID after promotion.

Production build and lint passed. The build retains its existing large-chunk
warning. **132 backend tests and 158 frontend tests passed.** Deployment installed
the unchanged dependency manifests; npm reported existing dependency advisories
(root: 14; frontend: 16), which were not changed or assessed as part of this fix.

The live read-only verifier checked:

- **56 public titles**: each `/player/:id` and `/title/:id`.
- **5 public series**: each `/series/:key`.
- **1 published Podcast Show**: `/podcasts/i4PS1LjAJeXJ2xDOnGJI`.
- `/MMWF` and `/podcast/me-and-my-white-friend`.
- **360 initial-HTML checks** across WhatsApp, Facebook and Twitter crawler agents.
- **63 distinct social image URLs**: all HTTP 200, `image/jpeg`, actually decoded
  at 1200x630 and below 4 MiB. **62 use approved artwork; 1 uses the branded fallback.**
- Existing unavailable short links and unknown content IDs return 404 without OG
  title metadata. Three actual non-public production records also returned 404.
- The only assigned persistent short link is `/MMWF`; no registry changes were made.
- Browser verification of Curtain Call loaded the real poster and preserved
  Watch Now, My List and the existing page layout; no movie was automatically played.

Representative links verified:

| Content | Link |
| --- | --- |
| Original screenshot / Curtain Call | https://watchprotv.com/player/creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d |
| Curtain Call detail / canonical | https://watchprotv.com/title/creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d |
| Cavalcade of Stars series | https://watchprotv.com/series/Y2F2YWxjYWRlIG9mIHN0YXJz |
| Podcast Show | https://watchprotv.com/podcasts/i4PS1LjAJeXJ2xDOnGJI |
| Podcast episode | https://watchprotv.com/player/8pIvDiHU8Z7jCu6WHKS9 |
| Music Video | https://watchprotv.com/player/creator_10467562-4227-417b-8066-1428ac98b48e |
| Show short link | https://watchprotv.com/MMWF |

Curtain Call's live metadata:

| Tag | Verified value |
| --- | --- |
| `og:title`, `twitter:title` | `Curtain Call \| PROtv` |
| `og:description`, `twitter:description` | The approved synopsis beginning "Curtain Call follows a single night of violent power struggle within a criminal organization..." |
| `og:url`, canonical | https://watchprotv.com/title/creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d |
| `og:type` | `video.movie` |
| `twitter:card` | `summary_large_image` |
| `og:image`, `twitter:image` | https://watchprotv.com/api/social/artwork/title/creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d?v=1ead00698197e07b |
| Image result | HTTP 200, `image/jpeg`, 1200x630, 64,586 bytes, approved complete poster |

Read-only before/after hashes matched for **all 108 catalog records**, including
artwork, descriptions, approvals, agreement references, rights, releases and media
identifiers (excluding playback telemetry and update timestamps). Zero records
were added, removed or changed by this work. No Creator Agent deployment, database
migration, agreement edit or playback-authorization change was performed.

Remaining limitations:

- **Within Our Gates (1920)** has no usable approved artwork URL and therefore
  uses the branded fallback. Adding artwork remains the normal authorized Admin
  workflow; this fix does not alter its record or invent replacement movie artwork.
- The original supplied MMWF artwork is low resolution; its derivative has valid
  dimensions but cannot manufacture extra detail.
- Facebook Sharing Debugger was opened and requires a Facebook login. No
  authenticated re-scrape or actual WhatsApp message refresh is claimed.
- Already-sent cards may stay cached; use the cache instructions above for a new share.
- Existing npm dependency advisories remain outside this metadata correction.

### Changed files

- [api/index.js](../api/index.js): preserve social-artwork query parameters.
- [backend/src/app.js](../backend/src/app.js): mount the public artwork router.
- [backend/src/catalog/router.js](../backend/src/catalog/router.js): initial HTML
  for all direct public content routes, with preview eligibility checks.
- [backend/src/catalog/socialMetadata.js](../backend/src/catalog/socialMetadata.js):
  shared metadata, canonical/type selection, public projections and approved art selection.
- [backend/src/catalog/socialArtwork.js](../backend/src/catalog/socialArtwork.js):
  safe downloads, image normalization and outlined branded fallback.
- [backend/src/catalog/titleHtml.js](../backend/src/catalog/titleHtml.js): reuse
  shared metadata while retaining the initial title and React shell.
- [backend/src/shortLinks/html.js](../backend/src/shortLinks/html.js): share the
  same OG/Twitter renderer.
- [backend/src/shortLinks/metadata.js](../backend/src/shortLinks/metadata.js):
  current public content, types, inherited art and normalized image URLs.
- [backend/src/shortLinks/router.js](../backend/src/shortLinks/router.js): retain
  no-store responses and repair legacy branded artwork rendering.
- [backend/src/shortLinks/validation.js](../backend/src/shortLinks/validation.js):
  support validated public player destinations.
- [backend/test/socialPreviews.test.js](../backend/test/socialPreviews.test.js):
  crawler, image, privacy, withdrawal and automatic-update tests.
- [backend/test/titleHtml.test.js](../backend/test/titleHtml.test.js) and
  [backend/test/shortLinks.test.js](../backend/test/shortLinks.test.js): updated
  contract expectations and existing-behavior regressions.
- [backend/scripts/verify-social-previews.js](../backend/scripts/verify-social-previews.js):
  repeatable read-only verification of the entire live public catalog.
- [frontend/index.html](../frontend/index.html): repair default image and dimensions.
- [frontend/src/components/AdminShortLinks.jsx](../frontend/src/components/AdminShortLinks.jsx):
  document supported public player destinations in the existing Admin editor.
- [vercel.json](../vercel.json): crawler-visible routing before SPA fallback.
- This document: implementation, release verification and cache-refresh instructions.

### Release process and rollback

The current approved website release lives on `feature/brand-short-links`, ahead
of upstream `main`; preserve that history and do not overwrite it from stale
`main`. Use the existing tracked-only detached-worktree Vercel release process:
build a protected production candidate with `--prod --skip-domain`, verify it
using authenticated `vercel curl`, then explicitly promote it. Do not disable
deployment protection or include unrelated untracked files/credentials.

Pre-fix production and rollback target:
`dpl_2dxATFmVBLKd7cmtHoNQrTfRqiuW`,
https://protv-mug3e95rl-pro-tv1.vercel.app,
source `4b203d0`.
Rollback: `vercel promote https://protv-mug3e95rl-pro-tv1.vercel.app`.
Live release verification is recorded in the consolidated report.
