# Legal drafts: review sheet

For the owner and counsel. Covers `privacy-policy-draft.md` and
`terms-of-use-draft.md` (review copy 2, 2026-10-23). **Nothing is published.**
Publishing means editing `frontend/src/pages/Privacy.jsx` and `Terms.jsx` on
the website, which is a separate, owner-approved change. Roku needs the
updated privacy URL in the dashboard before submission.

## 1. Decisions (each blocks publication)

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Postal address for Prophecy Entertainment LLC | Required in practice for privacy contact; use the registered business address, not a home address if avoidable |
| 2 | Deletion turnaround ("within [30] days") | 30 days; it is achievable by hand today (see docs/account-deletion-plan.md) |
| 3 | Retention for safety reports and creator records | "As long as needed to handle them and meet legal obligations" (already drafted); counsel may set fixed periods |
| 4 | State privacy laws (for example California's CCPA/CPRA "sale/share" opt-out for ad cookies) | Counsel confirms whether PROtv meets any law's thresholds. If yes: add a "Your Privacy Choices" link and honor Global Privacy Control on the website. The draft avoids claiming "we do not share" |
| 5 | Consent banner for ads (EU/UK visitors) | No consent banner exists today. With a US-only Roku launch this mainly affects the website; counsel decides, or restrict AdSense personalization outside the US in the AdSense console |
| 6 | Video ads | They are off in production (`/api/ads/session` returns `enabled: false`). If they are switched on, name the ad network in the policy first |
| 7 | Disclaimers, limitation of liability, governing law, disputes | Counsel drafts; none exist in the current terms |
| 8 | Effective date | The day both pages are published |

## 2. Fact check (every factual statement and its source)

| Statement | Source |
| --- | --- |
| Email and display name stored; password held by Firebase | Firebase Authentication; `backend/src/auth/tvAuth.js` (passwords pass through to Firebase and are not stored) |
| Verification email on sign-up, including on a TV | `tvAuth.js` sends `VERIFY_EMAIL` after TV sign-up |
| My List and watch progress stored with the account | `backend/src/routes/users.js`, `watchProgress.js` |
| Guest progress stays on the TV, up to 50 titles | Roku `source/model.brs` (`LocalProgressEntry`, registry), not sent to the server |
| TV keeps a sign-in token; sign-out deletes it | Roku `storeAccount` / `forgetAccount` (registry) |
| Activation code at watchprotv.com/activate | `frontend/src/pages/Activate.jsx` → `api.approveDeviceSession(code)` |
| Roku email request, email only | Roku `ChannelStore` `getUserData`, `requestedUserData="email"` |
| Rate-limit counters: hashed keys, expire in about an hour | `tvAuth.js` (`tvAuthRateLimits`, hashed key, `expiresAt`); Firestore TTL policy active |
| Safety reports keep contact email and description | `frontend/src/pages/SafetyReport.jsx` (`contactEmail`, `description`, target fields) → `backend/src/reports/store.js` (`safetyReports`) |
| Vercel Analytics on the website | `frontend/src/App.jsx` (`@vercel/analytics`) |
| Mux playback-quality data with the title watched | `frontend/src/components/VastMuxPlayer.jsx` (`@mux/mux-player-react`, `metadata={{ video_id, video_title }}`); Mux Player's monitoring is not disabled in code |
| Google AdSense on the website | `frontend/index.html` (`adsbygoogle`, `ca-pub` client) |
| Video ads via Google IMA, currently off | `VastMuxPlayer.jsx` (IMA SDK); `backend/src/ads/router.js` requires `VAST_AD_TAG_URL`; live response `{"enabled":false}` |
| Roku app shows no ads | Roku source: no ad framework |
| Support email | support@watchprotv.com (published on the current privacy page and Contact page) |
| No account-deletion endpoint today | No `deleteUser` route in `backend/src`; deletion is by email request |

Not verified from code (owner to confirm): the e-signature provider's name
(the Creator Agent is outside this repository) and whether any other email
or analytics provider is used.

## 3. What changes from the live pages

**Privacy (live text is five short paragraphs):**
- Adds the operator name, address, effective date and contact.
- Adds TV sign-in, TV guest progress, activation codes and the Roku email
  request (needed for the Roku submission).
- Adds watch progress, safety reports, creators and abuse prevention.
- **Discloses advertising (AdSense, and possible video ads) and analytics
  (Vercel, Mux).** The live page mentions "analytics" only generally and
  does not mention advertising.
- Adds retention and deletion, children, rights and changes.
- Keeps "we do not sell personal information", narrowed to "for money"
  pending decision 4.

**Terms (live text has four sections):** keeps all four; adds TV accounts and
activation, links the Acceptable Use and DMCA policies, adds copyright,
reports and changes sections, and leaves a placeholder for counsel's
liability and dispute terms.

## 4. Roku-specific checks

- **Privacy policy URL** in the dashboard: https://watchprotv.com/privacy,
  after publication.
- **Sign-in disclosure:** the draft covers on-device sign-in, Roku's email
  request and token storage, matching what the app does.
- **Account deletion:** the Roku app tells signed-in viewers to email
  support@watchprotv.com, and the draft says the same.
- **Children:** the app is not "made for kids" (listing); the draft's under-13
  statement is consistent with that.
