# PROtv Marketing Studio

**Where:** watchprotv.com → Admin → Marketing → Marketing Studio (`/admin#marketing-studio`). Administrators only.

## Architecture (reuses existing systems)
| Piece | Lives in | Reuses |
| --- | --- | --- |
| Studio UI, campaigns, calendar, accounts, paid governance, analytics, agent | Website (Vercel): `backend/src/marketing`, `frontend/src/admin/MarketingStudio.jsx` | Admin auth (`verifyAdmin`), Firestore, catalog loader, the PROtv LIVE master schedule, the playback rate limiter, admin audit |
| Render worker | Creator Portal (Render): `server/marketingRender.ts` | Hype Clip Studio's Mux slicing, two-stage memory-safe encode and memory guard; ffmpeg; data disk; Groq AI client |
| LIVE commercials | Existing PROtv LIVE spot inventory | New spot source `marketing-asset`; normal approval with a rights statement; existing exact-length break filling |
| Clips | Hype Clip Studio exports | Imported once each into the asset library |

The website and the portal talk over signed requests: an HMAC with `PROTV_PUBLISHING_SECRET`, domain-separated as `protv-marketing-v1`. The portal calls `/api/integrations/marketing/dispatch` every 5 minutes to publish due, approved posts.

## Rights rules for footage (`backend/src/marketing/rights.js`)
Footage may be used only from:
- **Executed agreements with a promotion clause.** The clauses were read 2026-11-25 and are cited per title in the code.
- **The 14 public-domain classics that passed the 2026-11-25 element review.** Their U.S. finding limits social and paid targeting to the United States.
- **Verified CC BY films,** with attribution.

Conditions for every creator excerpt:
- The title is on screen. CAESAR III and Curtain Call are the exception: they may also market PROtv itself.
- It comes from the first 60% of the runtime, so endings are never revealed.
- At most 90 seconds of any one title per piece.

Holds always win. Every render is checked again on the server.

## Approvals (nothing public, paid or on air without one)
- **Commercial:** render → validate → review (approve or reject) → "Add to PROtv LIVE spots" (creates a draft) → approve in PROtv LIVE → Commercials.
- **Posts:** draft → approve (the campaign must be approved and active) → scheduled or published. The scheduler only publishes posts that are already approved. With no connected account, a post moves to manual handoff.
- **Paid:** the monthly cap is $0 by default. Draft → budget approval → "prepare", which creates the campaign in Meta, PAUSED → activate (a second approval). Emergency pause stops everything.
- **Sponsor commercials:** the materials must be confirmed as sponsor-supplied, and the sponsor's approval of the final cut must be recorded.

## Settings needed for external services (none set yet)
| Service | Server settings | Platform approval still required |
| --- | --- | --- |
| Token storage | `MARKETING_TOKEN_KEY` (32-byte base64) | — |
| Facebook Pages + Instagram | `META_APP_ID`, `META_APP_SECRET` | Meta App Review: `pages_manage_posts`, `publish_video`, `instagram_content_publish`; plus `ads_management` for paid campaigns |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google API audit (until then, uploads stay Private); OAuth consent verification for `youtube.upload` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok audit for public Direct Post; URL-prefix (domain) verification to pull videos from a URL |
| AI video generation (optional) | `RUNWAY_API_KEY` / `LUMA_API_KEY` / Vertex project | A paid account and an approved allowance |

OAuth redirect to register with each platform: `https://watchprotv.com/api/marketing/oauth/<facebook|youtube|tiktok>/callback`.

## Measurement
Tracked links carry `utm_campaign=<campaign id>`.

The website sends anonymous daily counters:
- visit;
- returning visit;
- play start;
- meaningful session (2+ minutes watched).

No user IDs, no IP addresses and no viewing history are stored or shared. Metrics are labelled as observed (counted by PROtv), reported (from a platform API) or estimated (planning only).

## Facebook and Instagram publish through PROtv Social Studio (2026-11-25)
PSS is PROtv's single Meta publisher. It runs on the studio PC and holds Meta app 950590191461014 and the Page and
Instagram tokens. They are DPAPI-protected and never leave that PC.

**How a post flows:**
1. Marketing Studio queues approved Facebook/Instagram posts (`queued-pss`).
2. While PSS is running, it polls `/api/integrations/pss/queue` every 60 s. The request is signed with
   `MARKETING_PSS_SECRET` (domain `protv-pss-v1`).
3. PSS claims each post once and publishes it with its existing connection: a Page video, or an Instagram Reel from
   the HTTPS media link the Studio supplies.
4. PSS reports the result back to the Studio.

**Rules:**
- The Studio's own Meta OAuth connector is retired, so there is one integration.
- Test mode sends an unpublished Page video, and a Reel container that is processed but never published.
- An uncertain Meta response becomes `needs-check` and is never retried automatically.
- Scheduled posts publish only while PSS is open on the studio PC. Until then they wait in the queue, and the Studio
  shows when PSS was last online.

**YouTube and TikTok:** PSS has no integration for either. They stay on manual handoff until developer apps are
approved.

## Commercial templates and the designer (2026-11-26)
**Where:** Admin → Marketing → Commercial Templates, and AI Commercial Studio → New commercial → "Holiday, seasonal or custom (from a template)".

**Templates:** Thanksgiving, Christmas, New Year's, Valentine's Day, Independence Day, birthday, special announcement, premiere, general celebration and custom (blank). Each is a starting storyboard with theme, music and branding (`backend/src/marketing/templates.js`). Built-ins are timed for 30 s and scale to 15 or 60 s.
- Any built-in can be edited in Admin (stored as an override in `marketingTemplates`) and reset to the original.
- Any template-based commercial can be saved as a new template ("Save as template"); saved templates keep their exact segments and length.
- Placeholders in square brackets (`[NAME]`, `[DATE]`, `[TITLE]`, `[ANNOUNCEMENT]`) block rendering until they are replaced.
- No wording is fixed in the renderer: every line comes from the storyboard.

**Designer (per commercial, `frontend/src/admin/CommercialDesigner.jsx`):**
- Segments: text card, footage, logo reveal, call to action. Add, remove and reorder them, up to 24, timed in tenths of a second, which always land on whole frames.
- Three text lines per segment (top, main, bottom). Each has position (top/centre/bottom plus fine offset), alignment, size, colour (metallic silver, electric blue, gold, white or any custom colour), and glow.
- Animation: cut, quick fade, slow fade, fade and rise, fade and slide.
- Lines can appear all together, or one sentence at a time without moving the lines already shown.
- Text timing: text can start after, and leave before, the segment's own start and end.
- Footage segments hold up to 8 clips, each with its own start, length, 9:16 framing and on-screen title. Excerpts from title-only agreements must show their title for the whole clip; the server enforces it.
- Theme: background gradient, line colours, title-bar accent and glow colour. Branding: corner logo on or off, corner position and size; PROtv logo above or below any text.
- Music: original bed on or off, mood, tempo and volume. Volume is applied through the loudness target; LIVE masters stay within −24 ±2 LKFS.
- Live preview: draws the exact render plan the worker receives, in 16:9, 9:16 or 1:1, with play and scrub.
- Duplicate copies any commercial, as a new draft without renders or approvals.

**API (admin):** `GET /design`, `GET|POST /templates`, `PUT|DELETE /templates/:id`, `POST /preview`, `POST /commercials/:id/duplicate`. `PUT /commercials/:id/storyboard` also takes `theme`, `branding`, `music` and `title`.

**Render worker v2 (portal 9bffbd9):**
- Overlay images are drawn in a short-lived process (`server/marketingOverlays.ts`). The first production render (Thanksgiving) stopped at the memory guard when this drawing ran inside the portal (316 MB).
- Adds layer motion, gold fill, glow colour, and silent spots that skip the loudness check.
