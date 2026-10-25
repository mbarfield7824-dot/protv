# Amazon Developer Console: PROtv for Fire TV 1.0.0 (code 7)

Field-by-field steps for the existing draft (app ID `amzn1.devportal.mobileapp.61f50bb711ba4d768754cb2462dd8b19`). Every answer comes from the shipped APK, the live backend, or a recorded owner decision. **OWNER** marks a fact only the owner can confirm.

Files are in `tv/firetv/release/final-amazon/` unless a full path is given.

## 0. Order of work

1. developer.amazon.com > Apps & Services > My Apps > **PROtv** (the existing draft).
2. **Upload Your App File** (§1). Save.
3. **Target Your App**: device support (§1), availability (§5), target audience (§2), content rating (§4), user data privacy (§3). Save.
4. **Appstore Details** (§6). Save.
5. **Testing instructions** (§7). Save.
6. Every step shows a green check. Note any device the compatibility list marks unsupported in `RELEASE-CHECKLIST.md`.
7. Optional: **Live App Testing** (§8).
8. Press **Submit App** only after the owner's final approval (`RELEASE-CHECKLIST.md`, Phase 8).

## 1. Upload Your App File

| Field | Answer |
|---|---|
| APK | `D:\protv-firetv-artifacts\final-1.0.0-code7-20261025\PROtv-FireTV-1.0.0-code7-release-signed.apk` |
| SHA-256 | `922ad5bc3137bfe9457006d1561eb4f71df75b6a14382c1ffa4245a4c4f33099` |
| Console should show | `com.protv.firetv`, version 1.0.0, version code 7; minSdk 23, targetSdk 36 |
| Upload signer | CN=PROtv Android Upload, cert SHA-256 `301433275fdc7d791dcf6c436499c2b517586de9548eef021f7c2a8482115a7f` |
| Remove older binaries | Remove any earlier APK attached to the draft |
| Language support | English |
| Amazon DRM | No (streams come from Mux) |
| Export compliance | Confirm. The app uses only standard HTTPS/TLS, provided by Android and OkHttp |

**Supported devices** (Edit supported devices > **Amazon Fire TV** tab):
- Keep every Fire OS Fire TV device selected.
- Clear every device in the **Amazon Vega TV** section (for example Fire TV Stick 4K Select). Vega runs `.vpkg` apps, not APKs.
- Leave tablets and non-Amazon devices unselected. The manifest requires `android.software.leanback`.
- Save. Fire OS 5 devices (API 22) are already excluded by minSdk 23.

## 2. Target audience

- **Audience:** adults 18+ (not child-directed). The catalog includes a TV-MA title and horror films.
- Do not mark the app as directed at children.

## 3. User data privacy

"Does your app collect user data or transfer user data to third-parties?" **Yes**. Privacy policy URL: **https://watchprotv.com/privacy**.

Service providers, which are not third-party transfers: Google Firebase (Authentication, Firestore), Vercel (API hosting), Mux (video delivery). **Third-party transfers: none.**

| Category: type | Collected | Linked to user | Purposes |
|---|---|---|---|
| User info: Email address | Yes | Yes | App functionality; Fraud prevention, security & compliance |
| User info: Name | Yes | Yes | App functionality |
| User info: User IDs | Yes | Yes | App functionality |
| App activity: Other actions (My List, watch progress) | Yes | Yes | App functionality; Personalization |
| Device or other IDs: Device or other IDs (network address in hosting/video logs; hashed for rate limits) | Yes | No | Fraud prevention, security & compliance; App functionality |
| In-app search history | No (search runs on the TV) | — | — |
| Advertising ID, location, crash/diagnostics, financial, health, photos, audio, messages, files, calendar, contacts, web browsing | No | — | — |

| Other question | Answer |
|---|---|
| Account creation | Yes, on watchprotv.com; the TV links an existing account |
| Account deletion URL | **https://watchprotv.com/delete-account** (also shown on the TV in Settings for all users) |
| Delete data without deleting the account | Yes: My List in the app and on the website; watch history on the website |
| Advertising | No |
| In-app purchases or subscriptions | No |

SDKs in the APK: Firebase Auth (with Play services auth/base and Play Integrity as transitive dependencies), AndroidX Media3, Coil, Retrofit/OkHttp, ZXing. No analytics, crash-reporting, measurement or advertising libraries.

## 4. Content rating

The answers cover the 28-title Fire TV catalog (`AMAZON-LAUNCH-CATALOG.md`, group A). Ratings on record: *Dead Air* TV-MA, *Jungle Book 1942* PG. The rest are unrated classic films, Blender open movies and one creator short (The Lost Camp).

| Subject matter | Answer | Basis |
|---|---|---|
| Horror / fear themes | **Frequent / intense** | Dead Air (TV-MA supernatural horror), The Lost Camp (vengeful spirit), The Brain That Wouldn't Die (living severed head), Attack of the Giant Leeches, Plan 9 from Outer Space |
| Realistic violence | At least **infrequent / mild**; higher if Dead Air shows it | 1930s–50s crime films (D.O.A., Murder in Harlem), The Battle of Midway combat footage. **OWNER:** Dead Air |
| Cartoon or fantasy violence | Infrequent / mild | Sintel (sword fights, dragon), Big Buck Bunny (slapstick) |
| Gore | **OWNER** (Dead Air) | The Brain That Wouldn't Die surgery scenes are mild by today's standards |
| Sexual content / nudity | **OWNER** (Dead Air) | None known in the other 27 |
| Profanity / crude humour | **OWNER** (Dead Air) | None known in the other 27 |
| Alcohol, tobacco, drugs | Infrequent / mild | Period films show smoking and drinking |
| Intolerance / discrimination | Infrequent / mild | Historical 1930s–40s films |
| Gambling | None known | — |

| Additional information | Answer |
|---|---|
| Account creation | Yes (website account; the TV links it) |
| Advertisements | No |
| Location | No |
| User-generated content or social features | No (creator titles are reviewed before publishing; no chat or sharing) |
| Shares personal info with others | No |

Expected result: **Mature 17+**, because Dead Air (TV-MA) is in the catalog. **OWNER:** enter Dead Air's violence, gore, sex/nudity and language levels from its TV-MA basis.

## 5. Availability and pricing

| Field | Answer |
|---|---|
| Countries | **United States only** (clear all others; the default is all countries) |
| Price | Free |
| Release | As soon as approved |

## 6. Appstore Details

Text: copy the title, short description, long description, feature bullets and keywords from `store-listing.md`. Category: Movies & TV > On-Demand Movie Streaming (already saved).

| Asset | File | Spec |
|---|---|---|
| App icon | `artwork/store-app-icon.png` | 1280×720 PNG, no transparency |
| App icon (Live App Testing also needs it) | `artwork/store-app-icon-512.png` | 512×512 PNG, cut from the same brand icon |
| Background | `artwork/store-background.png` | 1920×1080 |
| Screenshots (5) | `screenshots/01-home-featured.png` … `05-settings-account-deletion.png` | 1920×1080, 24-bit PNG, no transparency |

Amazon limits: the short description is shown up to 200 characters on Fire TV (ours is about 145); the long description can be up to 4,000 characters; feature bullets are 3–5, one per line.

## 7. Testing instructions for Amazon reviewers

Paste this, then type the reviewer account into the credentials fields yourself:

> PROtv streams movies on Fire TV. Browsing and playback work without signing in: open any title from Home, Movies or Search and press Select to play. Use Play/Pause, Fast-forward and Rewind on the remote; Back closes the player. Creative Commons films show their licence credit as playback starts and with the player controls.
>
> To test My List and Continue Watching, sign in: press Left to open the menu, choose Settings, then Sign in. The TV shows a QR code and a short code. On a phone or computer, open watchprotv.com/activate, sign in with the test account provided, and enter the code. The TV signs in automatically.
>
> Account deletion: Settings shows the address and QR code for watchprotv.com/delete-account for everyone. Signed-in users also see Settings > Manage account > Delete account.
>
> Internet connection required.

**OWNER:** use a normal watchprotv.com viewer account, not an admin account. Do not send its password in chat or commit it.

## 8. Live App Testing (optional)

My Apps > PROtv > menu > **Live App Testing** > **Create new test**. Copy details from the current draft, upload the same code-7 APK, add a tester group containing the owner's Amazon account, and press **Submit Test**. For Fire TV, both icons (512×512 and 1280×720) are required.

Amazon's page says "LAT app submissions that collect personal information will not be accepted." PROtv's optional sign-in collects an account email, so Amazon may decline the test. That doesn't block the normal submission. The sideloaded code-7 build has already been tested on the owner's Firestick.

To install an LAT build on the owner's Firestick, first uninstall the sideloaded code 7 (`adb uninstall com.protv.firetv`), because the Amazon-delivered build is signed differently.
