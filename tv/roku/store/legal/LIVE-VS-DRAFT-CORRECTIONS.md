# Live privacy policy and terms vs. the drafts: exact corrections

For the owner and counsel, 2026-10-24. **Nothing is published.** The live text
was read from the production website bundle (`/assets/index-ceYhWZFq.js`,
2026-10-24). Every "verified" fact was checked against the live site, the
deployed backend (`origin/main` b123f03) or the Roku source. Replacement text
is in privacy-policy-draft.md and terms-of-use-draft.md (review copy 3). Both
were rechecked today and need no factual change.

## 1. What the website and apps actually do (verified 2026-10-24)

| Practice | Verified how | In live policy? | In draft? |
| --- | --- | --- | --- |
| Email/password accounts in Firebase; verification and reset emails | `backend/src/routes/auth.js` (`/signup`); live bundle (Firebase `accounts:signUp`, `sendOobCode` with `VERIFY_EMAIL` / `PASSWORD_RESET`) | Partly ("email address and display name") | Yes |
| Google sign-in (name, email, picture) | Live bundle: Firebase `signInWithIdp` with provider `google.com`; "Google sign-in was cancelled" | **No** | Yes |
| My List synced to the account | `routes/users.js` `/me/favorites` | Yes | Yes |
| Watch progress and history synced; per-title removal | `routes/users.js` `/me/progress` (GET/PUT/DELETE) | **No** | Yes |
| Roku guest progress kept on the TV only (50 titles) | Roku `source/model.brs` (registry) | **No** | Yes |
| TV sign-in, TV token storage, sign-out deletes it | Roku `storeAccount` / `forgetAccount`; `auth/tvAuth.js` | **No** | Yes |
| TV activation codes linked to the account | `auth/deviceSessions.js` (`approvedByUid`) | **No** | Yes |
| Roku account email shared only on consent | Roku `ChannelStore.getUserData` (`requestedUserData="email"`) | **No** | Yes |
| Safety reports keep a contact email | `reports/store.js` (`safetyReports`) | **No** | Yes |
| Hashed, short-lived rate-limit counters | `auth/tvAuth.js`; `reports/store.js` | **No** | Yes |
| Vercel Web Analytics (no cookies) | Live bundle (`@vercel/analytics`, `/_vercel/insights`) | "analytics" only | Yes |
| Mux Data playback analytics with title | Live bundle (`litix`, Mux Data) | "video streaming" only | Yes |
| Google AdSense on every page (ca-pub-4919337744329286), cookies, cross-site collection | Live `index.html` | **No** | Yes |
| Video ads (Google IMA) built but off | Live `/api/ads/session/<id>` → `{"enabled":false}`; IMA SDK in bundle | **No** | Yes (named network still a placeholder) |
| Roku app shows no ads | No ad framework in the Roku source | No | Yes |
| Account deletion | **No endpoint** in the deployed backend; manual runbook; Roku Account screen shows the request address | **No** | Yes (manual, by email) |
| Data sold for money | Nothing in code sells data | "We do not sell personal information" | Yes, narrowed to "for money" pending L2 |

## 2. Exact corrections to the live privacy policy

| # | Live text (quoted) | Replace with (draft section) | Why |
| --- | --- | --- | --- |
| P1 | "Effective September 16, 2026." | "Effective [date of publication]" plus the operator paragraph naming Prophecy Entertainment LLC, [postal address], and support@watchprotv.com | Operator and address not stated (L1) |
| P2 | "When you create an account, PROtv uses account details such as your email address and display name. We also store the titles you add to My List…" | Draft "Information we collect": Account information, Signing in with Google, My List and watch progress, Watching as a guest on a TV, Signing in on a TV, Activating a TV, Your Roku account email, Safety reports, Creators, Security | Google sign-in, progress/history, TV sign-in, Roku email and reports are collected but not disclosed |
| P3 | "We use this information to operate the platform, secure accounts, provide support, and improve the viewing experience. We do not sell personal information." | Draft "How we use information", including "show ads on the website" and "We do not sell personal information for money" | Ads use is not disclosed; the state-law meaning of "sell/share" is open (L2) |
| P4 | "PROtv relies on trusted services to provide authentication, data storage, hosting, analytics, and video streaming. These providers process only the information needed to deliver their services." | Draft "Usage and device information", "Advertising on the website" and "Service providers" (Firebase, Vercel, Mux, Google AdSense/IMA, e-signature provider; Roku under its own policy) | AdSense collects across sites; providers are not named; "only the information needed" is inaccurate for advertising |
| P5 | (absent) | Draft "Browser signals" | CalOPPA requires a Do Not Track disclosure (L3) |
| P6 | "Your choices: support@watchprotv.com" | Draft "Retention and deletion", "Children", "Your rights", "Changes" | No deletion process, retention, children or rights statement today |

## 3. Exact corrections to the live terms

| # | Live text | Replace with | Why |
| --- | --- | --- | --- |
| T1 | "Effective September 16, 2026. These terms explain the basic rules for using PROtv." | Draft opening paragraph naming Prophecy Entertainment LLC and incorporating the Privacy, Acceptable Use and DMCA policies | Operator not named; existing policies not linked |
| T2 | "Use PROtv lawfully and only through the features provided on the platform." | Draft "Platform access" (adds "on the website or in a supported PROtv app") | Covers TV apps |
| T3 | "You are responsible for activity under your account…" | Draft "Accounts, including on TVs" | TV sign-in, TV account creation and activation codes are not covered |
| T4 | "Catalog availability may change by title, territory, technical requirements, or rights status…" | Draft "Content availability" (adds personal, non-commercial viewing and a historical-content note) | Clarifies the licence to viewers |
| T5 | (absent) | Draft "Copyright", "Creators", "Changes" | Links the DMCA process; protects creator agreements |
| T6 | (absent) | [Disclaimers, limitation of liability, governing law and disputes] | **Counsel drafts or decides to omit (L8)** |

## 4. Roku-specific disclosures

- The privacy draft already covers what the Roku app does: TV sign-in and
  token storage, guest progress on the TV, the Roku email request with
  consent, no ads in the Roku app, and deletion by email (shown on the Roku
  Account screen). No separate Roku policy is needed. Roku's dashboard takes
  the privacy URL `https://watchprotv.com/privacy` after publication.
- **Dashboard answers that match the code:** collects personal information:
  **Yes** (email and password at sign-in; watch progress when signed in).
  Uses Roku Pay: **No**. Shows ads: **No**. Shares the Roku account email:
  **only with consent**, through Roku's own screen.

## 5. Decisions that only the owner or counsel can make

| # | Decision | Status |
| --- | --- | --- |
| L1 | Registered postal address of Prophecy Entertainment LLC | Not in any record; owner supplies |
| L2 | Whether CCPA/state laws apply, and whether AdSense cookies are "sharing" (opt-out link, GPC) | Counsel |
| L3 | Do Not Track / GPC wording ("we do not currently respond" is accurate today) | Counsel confirms |
| L4 | EEA/UK ad consent (certified CMP) or non-personalized ads outside the US | Owner (commercial) |
| L5 | Deletion turnaround ("aim to complete within 30 days") | Owner/counsel |
| L6 | Retention period for safety reports, support email and creator records | Owner/counsel |
| L7 | No age gate for a general-audience service | Counsel confirms |
| L8 | Terms: disclaimers, liability, governing law, disputes | Counsel drafts |
| L9 | Name the video-ad network before video ads are switched on | Owner, later |
| L10 | Effective date | The day both pages are published |

Publishing means editing `frontend/src/pages/Privacy.jsx` and `Terms.jsx` and
deploying the website, which needs the owner's approval. It was not done.
