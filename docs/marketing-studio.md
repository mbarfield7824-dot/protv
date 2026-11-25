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
