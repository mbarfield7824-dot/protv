# Legal drafts: review sheet (review copy 3)

For the owner and counsel. Covers `privacy-policy-draft.md`,
`terms-of-use-draft.md` and `ACCOUNT-DELETION-RUNBOOK.md`, 2026-10-23.
**Nothing is published.** Publishing means editing
`frontend/src/pages/Privacy.jsx` and `Terms.jsx` (an owner-approved website
change). Roku needs the published privacy URL before submission.

## 1. Confirmed technical gaps (facts, not legal opinions)

| # | Gap | Evidence | Effect | Fix |
| --- | --- | --- | --- | --- |
| T1 | No account-deletion endpoint | No `deleteUser` route in `backend/src` | Deletion is manual | Use ACCOUNT-DELETION-RUNBOOK.md; self-service plan in docs/account-deletion-plan.md |
| T2 | No consent banner (CMP) on the website | `frontend/index.html` loads AdSense with no CMP | Google: "a certified CMP integrated with the TCF is required when serving personalized ads to users in the EEA and UK" (since 2024-01-16; Switzerland since 2024-07-31); without one, traffic "may be eligible for non-personalized ads or limited ads" | Add a Google-certified CMP, or accept limited ads outside the US |
| T3 | No Do Not Track / Global Privacy Control handling | No code reads `navigator.globalPrivacyControl` or `DNT` | The policy must say so (see L3) | Policy statement now; code later if L2 applies |
| T4 | Expired device records never deleted | `deviceSessions`, `deviceActivationCodes`, `deviceRateLimits`, `safetyReportRateLimits` have `expiresAt` but **no active TTL policy** (`gcloud firestore fields ttls list`: active only on `playbackRateLimits`, `playbackViewDedup`, `playbackViewEvents`, `playbackViewSessions`, `tvAuthRateLimits`) | Data kept longer than needed | Enable TTL on `expiresAt` for the four collections (owner approval) |
| T5 | Google sign-in was not disclosed | `frontend/src/context/AuthContext.jsx` (`signInWithPopup`, `signInWithRedirect`, Google provider) | Live policy incomplete | Disclosed in the draft |
| T6 | The legacy public `/api/videos` route returns every unlisted Firestore field | `publicVideo()` uses a deny-list | Internal fields added later become public | Mitigated tonight: rights evidence moved to `titleRightsEvidence` (client reads denied, 403). Recommend an allow-list (backend change) |
| T7 | Old dotted `watchProgress.<id>` fields remain in `users` documents | Firestore | Covered by the runbook (whole document deleted) | Cleaned on the next progress write since PR #12 |

## 2. Legal questions (counsel)

| # | Question | Facts and citations | Recommendation |
| --- | --- | --- | --- |
| L1 | Postal address | Not in project records | Owner supplies the registered business address |
| L2 | Does the CCPA apply? | It applies to for-profit businesses doing business in California that have "gross annual revenue of over $25 million", or "buy, sell, or share the personal information of 100,000 or more California residents or households", or derive 50%+ of revenue from selling it ([California AG CCPA FAQ](https://oag.ca.gov/privacy/ccpa)). Covered businesses must offer "Do Not Sell or Share" and honor GPC | Counsel confirms. Likely below the thresholds today; ad cookies count toward "sharing" |
| L3 | CalOPPA disclosures | Cal. Bus. & Prof. Code §22575(b)(5) requires disclosing how the site responds to "do not track" signals where it collects data across sites over time, and (b)(6) whether third parties may collect such data ([Justia, §22575](https://law.justia.com/codes/california/code-bpc/division-8/chapter-22/section-22575/); [AB 370](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201320140AB370)) | The draft now discloses third-party (Google) collection; decision 9 sets the DNT/GPC wording ("we do not currently respond" is accurate today) |
| L4 | EEA/UK visitors and ad consent | See T2 | Commercial decision: a CMP, or non-personalized ads outside the US |
| L5 | Deletion turnaround | Manual process (T1) | "Aim to complete within 30 days" (drafted as an aim, not a guarantee) |
| L6 | Retention for safety reports, support email and creator records | No TTL on `safetyReports` | "As long as needed to handle them and meet legal obligations" |
| L7 | Children | Not made for kids; no age gate | Keep the under-13 statement; counsel confirms no age gate is required for a general-audience service |
| L8 | Terms: disclaimers, liability, governing law, disputes | None in the current terms | Counsel drafts |
| L9 | Video ads | Built (Google IMA) but off: `/api/ads/session` returns `{"enabled":false}` | Name the ad network in the policy before enabling |
| L10 | Effective date | — | The day both pages are published |

## 3. Fact check (each statement and its source)

| Statement in the draft | Source |
| --- | --- |
| Email and display name; password held by Firebase; verification and reset emails | `backend/src/routes/auth.js` (`createUser` with `displayName`); `AuthContext.jsx` (`sendEmailVerification`, `sendPasswordResetEmail`); `tvAuth.js` (`VERIFY_EMAIL`, `PASSWORD_RESET`) |
| Google sign-in shares name, email, picture | `AuthContext.jsx` Google provider (Firebase's standard profile scope) |
| My List, progress, watch history with the account | `users/{uid}` (`favoriteVideoIds`, `watchProgress`); `frontend/src/pages/WatchHistory.jsx` reads progress |
| Guest progress on the TV only, 50 titles | Roku `source/model.brs` (registry) |
| TV token storage; sign-out deletes it | Roku `storeAccount` / `forgetAccount` |
| Activation codes | `Activate.jsx` → `approveDeviceSession`; `deviceSessions` (`approvedByUid`) |
| Roku email request, email only | Roku `ChannelStore.getUserData`, `requestedUserData="email"` |
| Rate-limit counters hashed, expire in about an hour | `tvAuth.js`; TTL active on `tvAuthRateLimits` |
| Safety reports keep contact email | `SafetyReport.jsx` → `safetyReports.contactEmail` |
| Vercel Web Analytics: no cookies, page/referrer/location/device, 24-hour hash | `App.jsx`; [Vercel privacy doc](https://vercel.com/docs/analytics/privacy-policy) |
| Mux playback quality with title | `VastMuxPlayer.jsx` (`metadata={{ video_id, video_title }}`) |
| AdSense; Google may collect across sites | `frontend/index.html` (`adsbygoogle`) |
| Video ads possible, currently off | `VastMuxPlayer.jsx` (IMA); live `{"enabled":false}` |
| This Roku version shows no ads | No ad framework in the Roku source |
| Deletion removes account, list, progress, TV links | ACCOUNT-DELETION-RUNBOOK.md steps 1, 2 and 4 |

Not verifiable from code: the e-signature provider's name (Creator Agent is
outside this repository), and whether support email is handled by another
provider.
