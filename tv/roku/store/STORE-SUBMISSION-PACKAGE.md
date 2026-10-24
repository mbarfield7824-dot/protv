# Roku Streaming Store submission package (field by field)

For the owner, 2026-10-24. Fields follow Roku's publishing guide (updated
2026-10-20). Text values are final drafts, within Roku's limits; **OWNER**
marks values only the owner has. Nothing has been entered in the dashboard.

## 1. App creation and listing

| Field | Value | Notes |
| --- | --- | --- |
| App name (30 max) | `PROtv` (5) | Identifies the service; no "Roku" in the name |
| Streaming Store countries | **United States only** | Every public-domain basis on record is US-specific (TITLE-RIGHTS-MATRIX.md) |
| Domestic region | United States | |
| Default language | English | |
| Made for kids? | **No** | |
| Category | Movies & TV | |
| App age rating | The most mature option offered | Dead Air is TV-MA; horror, crime and war titles; 47 of 49 titles have no rating of their own |
| App type | Video | |
| Customer sign-in question | **Yes** | Roku: free apps with sign-in must answer Yes; sign-in is optional, every title plays as a guest |
| Monetization | **Free** | No ads, no purchases in the Roku app (no app-ads.txt needed) |
| Vanity access code | Roku auto-generates; or custom, for example `PROTV` | Optional |

## 2. Store assets (English)

| Field | Value |
| --- | --- |
| Description, on-device (300 max) | store/listing.md (227 characters) |
| Description, online (1,500 max) | store/listing.md (826 characters) |
| App poster 540x405 | `store/app-poster-540x405.jpg` (opaque JPEG; black, royal and electric blue, white) |
| Screenshots (up to 6, 1920x1080) | **OWNER captures** (section 4); none exist and none were made up |
| Release notes (1,500 max, optional) | store/listing.md (225 characters) |

## 3. App profile and contacts

| Field | Value |
| --- | --- |
| Privacy policy URL | `https://watchprotv.com/privacy`, **only after** the approved policy is published (legal/LIVE-VS-DRAFT-CORRECTIONS.md) |
| Terms URL | `https://watchprotv.com/terms`, after publication |
| Support URL | `https://watchprotv.com/contact` (live) |
| Support email | `support@watchprotv.com` (published; MX records active) |
| Support phone (with country code) | **OWNER** |
| Learn more URL | `https://watchprotv.com/about` (live) |
| Administrative contact (name, email, phone) | **OWNER** |
| Technical contact (name, email, phone) | **OWNER** |

## 4. Screenshots (owner, about 15 minutes, on the developer Roku)

The Roku app draws at 1280x720, and Roku wants 1920x1080. Capture, then scale
by exactly 1.5×; never crop, stretch or edit what the app shows.

1. Sideload `protv-roku-v1.0.0-rc5-candidate.zip` (developer mode; installer at
   `http://<TV-IP>`, user `rokudev`).
2. For each screen below, open `http://<TV-IP>` > **Utilities** >
   **Screenshot** while the screen is showing, then save the image.
3. Scale each one on this PC:
   `ffmpeg -i in.jpg -vf scale=1920:1080:flags=lanczos -q:v 2 out.jpg`
   (ffmpeg is installed at `C:\Users\Owner\bin\ffmpeg`).
4. Capture **after Batch 1 is deployed**, so the app shows only the Roku launch
   catalog (ROKU-LAUNCH-CATALOG.md, Group A), and after Batch 2 if approved
   (new posters). Feature Tears of Steel, Sintel, Big Buck Bunny, Elephants
   Dream, The Lost Camp or Dead Air.

| # | Screen | How to get there |
| --- | --- | --- |
| 1 | Home with the featured title and first rows | Launch; wait for the catalog; leave focus on the featured title if it is a cleared title, otherwise move right until one is featured |
| 2 | A rail in focus | Down into the rails; focus a cleared title's card |
| 3 | Title details | OK on Tears of Steel (shows Play, My List, synopsis) |
| 4 | Playback with PROtv's controls and a seek preview | Play Tears of Steel; press Right twice so the preview and time show |
| 5 | Search | Search > type "steel" |
| 6 | Account screen | Account, signed out (no email visible) |

Home rails show other launch titles. If Batch 2 is not yet applied, keep the
His Girl Friday and The Duke Is Tops posters (real performers) out of frame.

## 5. Test credentials and reviewer account

| Field | Value |
| --- | --- |
| Credentials title | `PROtv reviewer account` |
| Authentication type | SVOD (the closest option; PROtv is free with optional sign-in) |
| Username / password | **OWNER** creates them (below); entered only in the dashboard |
| Valid until | 2027-12-31 |
| Description | `Optional sign-in. Every title plays as a guest. The account shows My List and Continue Watching syncing with watchprotv.com.` |

**Create the reviewer account (owner, 5 minutes):**

1. Use a mailbox you control that is not personal or admin (for example a new
   `roku-review@` alias on watchprotv.com, if your mail host allows aliases).
2. Sign up at watchprotv.com with that address, using a new password from a
   password manager. Do **not** use Google sign-in.
3. Verify the email. Check that the account cannot open Admin.
4. On the TV: Account > Sign in; add Tears of Steel to My List; play it for
   2 minutes.
5. Enter the email and password only in the dashboard's test-credential
   fields. After certification, change the password.

## 6. Authentication walkthrough (paste into reviewer notes)

1. Home > the profile button (top right, labelled "Guest") > OK: the Account
   screen opens with **Sign in** focused.
2. OK > Roku may ask to share the Roku account email: choose either. The email
   keyboard opens (filled in if shared).
3. Enter the test email > **Continue** > enter the password > **Sign in**.
   "Signed in." appears; the profile button greets the viewer.
4. My List and Continue Watching now show the account's titles.
5. Sign out: Account > **Sign Out** (one press; no confirmation). The app
   returns to guest mode.
6. Create account and Forgot password are on the same screen and run on the TV.
7. Delete account: the signed-in Account screen says to email
   support@watchprotv.com.

## 7. Deep-link samples (dashboard) and test cases

Dashboard samples (one per media type in the Roku catalog; "Valid until"
one year). The Roku launch catalog contains movies only (every episode is on
rights hold), so one movie sample is required:

| Media type | Content ID | Content title |
| --- | --- | --- |
| movie | `gbcxmtl6mAHQeBxx8Dgs` | Tears of Steel |

The app still supports `mediaType=episode`. Add an episode sample when an
episode joins the Roku catalog.

Roku says a Content ID "must match the PlayId in your search feed". PROtv has
no Roku search feed. The IDs above are the IDs the app resolves; if the
reviewer asks for a feed, that is a separate project (not needed for these
deep links to work).

Test cases (`<TV-IP>` = the TV's address; the app must be sideloaded as dev):

| # | Command | Expected |
| --- | --- | --- |
| 1 | `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=gbcxmtl6mAHQeBxx8Dgs&mediaType=movie"` | App launches and Tears of Steel plays directly |
| 2 | While it plays: `curl -d "" "http://<TV-IP>:8060/input/dev?contentId=hKPU3JNJ4faWLgWE6ZSq&mediaType=movie"` | Big Buck Bunny replaces it and plays |
| 3 | `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=doesNotExist&mediaType=movie"` | Home with an "unavailable" message |
| 4 | `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=gbcxmtl6mAHQeBxx8Dgs&mediaType=series"` | Home with a "not supported" message |
| 5 | `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=vyjpYtuEpOlCWzyzlaxM&mediaType=movie"` (restricted title) | Home with "unavailable"; nothing plays |
| 5b | After Batch 1: `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=t6Ii7hflAigcefjBRz3r&mediaType=movie"` (Gulliver's Travels, rights hold, still on the website) | Home with "unavailable"; nothing plays on Roku |
| 6 | Account > Sign in, keyboard open, then case 1 | The keyboard closes and the title plays |

## 8. Sign-in and sign-out scripts (App Behavior Analysis)

Key sequences and rules are in store/listing.md ("App Behavior Analysis
sign-in/sign-out scripts"). Record them with the Roku Remote Tool against the
sideloaded RC5, export the `.rasp` files and upload them. Use the
placeholders `script-login` and `script-password`, never real credentials.

## 9. Package and publishing

| Field | Value |
| --- | --- |
| Package | The **signed .pkg** made from RC5 on the developer Roku (not the ZIP) |
| Minimum firmware | As the dashboard requires for the package format (Squashfs needs 8.0 or higher) |
| Static Analysis | Run; fix every error before certification |
| Schedule | Earliest is the second business day; not Friday or weekend |
| Confirmation checkboxes | One confirms testing against the publishing checklist; the other **certifies your authority and your distribution rights**. Do not tick it while TITLE-RIGHTS-MATRIX.md lists unresolved high-risk titles that remain live |
