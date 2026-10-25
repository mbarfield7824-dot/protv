# Amazon Developer Console answers: PROtv for Fire TV 1.0.0 (code 4)

Field-by-field answers for the existing draft (app ID `amzn1.devportal.mobileapp.61f50bb711ba4d768754cb2462dd8b19`).
Every answer below is based on the shipped APK, the live backend, or a cited owner decision.
Items marked **OWNER** need a fact only the owner can confirm; do not guess them.

## 1. Upload your app file

| Field | Answer |
|---|---|
| APK | `PROtv-FireTV-1.0.0-code4-release-signed.apk`, SHA-256 `e52fea8c45c54bfc4f60bd34d7f67e4d70064f4e43fc837e79fef7df36bbe0b9` |
| Package / version | `com.protv.firetv`, versionName 1.0.0, versionCode 4, minSdk 23, targetSdk 36 |
| Upload signer | CN=PROtv Android Upload, SHA-256 `301433275fdc7d791dcf6c436499c2b517586de9548eef021f7c2a8482115a7f` |
| Does the app use Amazon DRM? | No (streams are delivered by Mux; the app has no Amazon DRM wrapper requirement) |
| Language support | English |

### Device support

- **Select:** all Amazon Fire TV devices that run Fire OS (Fire OS 6, 7, 8, 14, 16). `minSdk 23` already excludes Fire OS 5 (API 22) devices.
- **Deselect:** every **Vega OS** device (for example Fire TV Stick 4K Select). Vega runs `.vpkg` apps, not APKs.
- **Deselect:** Fire tablets and non-Amazon Android devices. The manifest requires `android.software.leanback`, so tablets are filtered anyway.
- After upload, check the console's per-device compatibility list and record any device marked incompatible in `RELEASE-CHECKLIST.md`.

## 2. Target your app

| Question | Answer | Basis |
|---|---|---|
| Collects or transfers user data? | **Yes** | Account email, display name, user ID, My List and watch progress are stored server-side |
| Account creation supported? | **Yes** (on the website; the TV links to an existing account) | QR/code sign-in to `watchprotv.com/activate` |
| Account deletion URL | **https://watchprotv.com/delete-account** | Live since PR #13 (merge `9b17039`, Vercel `dpl_Coj6UrQo5Kcki9RwTcEkxSEmwzKa`) |
| Data deletion without deleting the account | Yes: My List items can be removed in the app and on the website; watch-history entries can be removed on the website (`/history`) | Existing favorites and progress DELETE routes |
| Privacy policy URL | **https://watchprotv.com/privacy** | Updated October 25, 2026 |
| Contains advertising? | **No** | The Fire TV APK contains no ad SDK and shows no ads |
| In-app purchases / subscriptions? | **No** | No billing code or IAP SDK |

## 3. Privacy label (User Data Privacy questionnaire)

Amazon's rules: disclose data collected by the app or its service providers; transfers **to a service provider processing data on the developer's behalf** are not "third-party transfers"; anonymous data need not be disclosed.

Service providers (not third-party transfers): Google Firebase (Authentication, Firestore), Vercel (API hosting), Mux (video delivery).

| Category: type | Collected? | Linked to user | Purposes | Basis |
|---|---|---|---|---|
| User Info: **Email Address** | Yes | Yes | App functionality; Fraud prevention, security & compliance | Firebase account; sign-in rate limits keyed by a hash of the email |
| User Info: **Name** | Yes | Yes | App functionality | Display name on the account |
| User Info: **User IDs** | Yes | Yes | App functionality | Firebase UID keys My List, progress and TV links |
| App activity: **Other actions** (My List, watch progress / Continue Watching) | Yes | Yes | App functionality; Personalization | `users/{uid}` favorites and watchProgress |
| App activity: **In-app search history** | **No** | — | — | Search runs on the downloaded catalog on the TV; queries are not sent |
| Device or other IDs: **Device or other IDs** | Yes (network address in hosting and video-delivery logs; hashed network address for rate limits) | No | Fraud prevention, security & compliance; App functionality | Conservative disclosure of server-side IP handling |
| Device or other IDs: **Advertising ID** | No | — | — | No ad SDK |
| Location (approximate / precise) | No | — | — | No location APIs; IPs are not used to locate users |
| App info and performance (crash logs, diagnostics) | No | — | — | No analytics or crash SDK in the APK |
| Financial, Health, Photos/Videos, Audio, Messages, Files, Calendar, Contacts, Web browsing | No | — | — | Not accessed |

Third-party data transfers: **None** (service providers only).

SDKs in the APK (from `releaseRuntimeClasspath`): Firebase Auth (with firebase-common, Play services auth/base, Play Integrity as transitive dependencies), AndroidX Media3, Coil, Retrofit/OkHttp, ZXing. **No** Firebase Analytics, Crashlytics, Installations, measurement or advertising libraries.

## 4. Content rating

Catalog facts (live API, 2026-10-25): **49 titles**, of which 2 carry a rating (*Jungle Book 1942*: PG; ***Dead Air*: TV-MA**) and **47 are unrated**. Categories: Drama 12, Black Cinema 7, Horror 6 (+ Horror/Thriller 1, Supernatural horror 1), Cartoons 6, Sci-Fi 5, Documentary 4, Comedy 3, Action 3, AI Cinema 1.

The questionnaire rates the most intense content the app makes available. Recommended approach:

| Topic | Recommendation | Why / OWNER input |
|---|---|---|
| Horror / fear themes | **Intense** | Night of the Living Dead (1968), Carnival of Souls, The Brain That Wouldn't Die, House on Haunted Hill, Dead Air (TV-MA supernatural horror) |
| Realistic violence | **At least moderate; intense if Dead Air or The Bundy Chronicles depict it** | **OWNER:** confirm what Dead Air's TV-MA covers and the content of The Bundy Chronicles |
| Graphic violence / gore | **OWNER** | Night of the Living Dead includes cannibalism scenes; Dead Air TV-MA basis unknown |
| Sexual content / nudity | **OWNER** | Sita Sings the Blues (animated) and Dead Air need confirmation |
| Profanity | **OWNER** | Dead Air (TV-MA) likely; confirm |
| Drugs, alcohol, tobacco | Mild/infrequent (period films show smoking and drinking) | Confirm |
| Discrimination / stereotypes | Present in historical material | Within Our Gates (1920) depicts lynching; 1930s–40s cartoon shorts contain racial caricatures |
| Gambling | None known | Confirm |
| User-generated content / social features | No (creator titles are reviewed by PROtv before publishing; no chat or sharing in the app) | |
| Shares location / personal info with others | No | |

Expected outcome: a **Mature (17+)** rating while Dead Air (TV-MA) is in the catalog. If the owner prefers a lower rating, Dead Air and the most intense horror titles would have to be removed from the catalog first (a production catalog change, which is outside this release).

## 5. Availability and pricing

| Field | Answer |
|---|---|
| Marketplaces | **United States only** (matches the Roku launch decision and the rights report). **OWNER:** confirm |
| Price | Free |
| Release date | As soon as approved (no scheduled date) |

## 6. Testing instructions for Amazon reviewers

> PROtv streams movies and episodes on Fire TV. Browsing and playback work without signing in: open any title from Home, Movies, TV or Search and press Select to play. Use Play/Pause, Fast-forward and Rewind on the remote; Back closes the player.
>
> To test My List and Continue Watching, sign in: open the menu (press Left), choose Settings, then Sign in. The TV shows a QR code and a short code. On a phone or computer, open watchprotv.com/activate, sign in with the test account below, and enter the code. The TV signs in automatically.
>
> Account deletion: Settings shows the address and QR code for watchprotv.com/delete-account. Signed-in users also see it under Settings > Manage account > Delete account.
>
> Test account: [entered in the console's credentials field by the owner]. Internet connection required.

**OWNER:** create a normal viewer account on watchprotv.com (not an admin), confirm it can sign in on the TV, and type its email and password directly into the console. Do not send them in chat or commit them.

## 7. Appstore details (listing)

See `store-listing.md` for the title, descriptions, feature bullets, keywords, category and release notes, and `artwork/` for images.
