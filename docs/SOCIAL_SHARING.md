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
