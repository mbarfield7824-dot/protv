# PROtv Roku: store release preparation

Prepared 2026-10-23 for the owner (Prophecy Entertainment LLC). **Nothing has
been submitted, packaged for the store or published.** Based on the build
`roku-v0.5.6-tv-verified` and Roku's publishing and packaging guides.

## 1. Store listing checklist

Values marked *owner* need the owner's decision or details.

| Field | Proposed value | Notes |
| --- | --- | --- |
| App name (30 max) | PROtv | Must not contain "Roku" |
| App type | Video | |
| Countries | United States (*owner*) | Only where PROtv holds distribution rights. Public-domain status differs by country |
| Default language | English | |
| Made for kids | No | |
| Category | Movies & TV (or nearest offered) | |
| App age rating | *owner*, likely a teen or mature rating | Catalog includes horror, crime and wartime documentaries |
| Privacy policy URL | https://watchprotv.com/privacy | Review the content first (section 6) |
| Terms URL | https://watchprotv.com/terms | |
| Sign-in question | Yes | Required for free apps with sign-in |
| Reviewer test account | See section 7 | Depends on the sign-in decision |
| Support URL | https://watchprotv.com/contact | |
| Support email | support@watchprotv.com | From the privacy policy |
| Support phone | *owner* | Must include the country code |
| Admin and technical contacts | *owner* | Names, emails, phones with country codes |
| Learn more URL | https://watchprotv.com/about | |
| Monetization | Free (no ads in the Roku app) | Ads would require Roku's ad framework and app-ads.txt |
| Vanity access code | *owner* (optional), e.g. PROTV | 6 alphanumeric, or a custom code up to 20 |
| Minimum firmware | Roku OS 9.0 or later (proposed) | Match the package format chosen when packaging |

## 2. Artwork and screenshots

- **App poster:** 540x405 JPEG or PNG, no transparency. Upload
  `store/app-poster-540x405.jpg` (a flattened copy of the 540x405 channel icon,
  no alpha channel; not part of the app package).
- **Screenshots:** up to six, 1920x1080 JPEG or PNG. The app renders at 720p
  and Roku scales it; capture on the TV in developer mode (device web page,
  Utilities, Screenshot) and upscale 1280x720 captures to 1920x1080 only by
  uniform 1.5x scaling, never stretching. Suggested set:
  1. Home with the featured creator title
  2. A category row (Black Cinema or Horror)
  3. Title details with Play / My List
  4. Series screen with seasons and episodes
  5. Playback with the PROtv controls (a public-domain title)
  6. Account linking screen with the code (use an expired code)
- Use only titles whose artwork rights are confirmed; avoid creator titles
  unless the creator agrees to promotion in store screenshots.

## 3. App description drafts

**On-device (300 characters max), 227 characters:**

> PROtv streams free classic movies, cartoons, TV episodes, documentaries,
> Black Cinema and original films from independent creators. Link your free
> PROtv account to keep My List and Continue Watching in sync with
> watchprotv.com.

**Online (1,500 characters max):**

> PROtv is a free streaming service from Prophecy Entertainment LLC, built
> around timeless public-domain cinema and new work from independent creators.
>
> Watch classic films, including horror, film noir, comedy and science
> fiction favorites, alongside landmark Black Cinema, documentaries, vintage
> cartoons and TV episodes. PROtv Creators brings original films and series
> from independent filmmakers, featured first across the app. AI Cinema
> showcases new films made with AI tools.
>
> Browse by category or pick a mood with PROtv Discover. Save titles to My
> List and pick up where you left off with Continue Watching. Link your free
> PROtv account in seconds using a code on watchprotv.com/activate, and your
> list and progress follow you between your TV and the web. No account? Watch
> as a guest; your progress is kept on your TV.
>
> Filmmakers can submit their work at watchprotv.com/creators.

Check every claim against the catalog at submission time (for example keep
"AI Cinema" only while that row has titles).

## 4. Certification test plan

Run on the physical Roku with the release package. "TV" means the check can
only be done on the device.

| # | Requirement | How to test | Device |
| --- | --- | --- | --- |
| 1 | 3.2 Launch beacon, home in 15 s | Cold launch 5 times from the Roku home screen; time to a usable home screen. Dev console (port 8085) shows the beacon. Fix if any run is over 15 s | TV |
| 2 | 4.6 Back behavior | Back from Player > Details > Home; Back on Home exits | TV (passed in v0.5.6 testing) |
| 3 | 4.7 Trick-play thumbnails | On a title over 15 min, hold Right / Fast Forward; a thumbnail with the target time must show | TV |
| 4 | 4.10 Bookmarks | Watch, exit, relaunch, resume; signed in and as guest | TV (signed-in passed) |
| 5 | 5.1 Deep linking | Roku's Deep Linking Tester, or from a computer: `curl -d "" "http://<ip>:8060/launch/dev?contentId=<id>&mediaType=movie"` and `mediaType=episode`; also with the app already running (`/input/dev?...`). Playback must start; an unknown ID must show a message, not hang | TV |
| 6 | Network loss | Disconnect Wi-Fi before launch, during browsing, during playback; reconnect. Clear message, retry works, no freeze | TV |
| 7 | Extended playback | Play a feature to the end, then 2 hours of mixed browsing and playback; watch the dev console for errors and memory | TV |
| 8 | 4.8 Captions | Legal decision first; if required, tracks must display and toggle | TV, after captions exist |
| 9 | Sign-in | Reviewer account: link, restart (still linked), sign out | TV (passed in v0.5.6 testing) |
| 10 | Splash and icons | Check the icon on the Roku home screen and the splash at launch | TV |

## 5. Signed package instructions

Do this only after the owner approves a release build.

1. Build the release ZIP from the approved tag (`npm run build` in `tv/roku`)
   and record its SHA-256.
2. On the Roku in developer mode, open Telnet to port 8080 (Windows: PuTTY,
   Telnet, port 8080) and run `genkey` once. **Store the Dev ID and password
   in a password manager.** Every future update must be signed with the same
   key; a new key would make it a different app and lose viewers' saved
   sign-ins.
3. Sideload the release ZIP from `http://<Roku IP>` (Installer).
4. Open **Packager**, confirm the Dev ID, enter the app name/version and the
   `genkey` password, click **Package**, and download the `.pkg`.
5. Back up the `.pkg`, the Dev ID and the password together, off this PC.
6. In the Roku developer dashboard, upload the `.pkg` on the App package page.
   Set the minimum firmware to match.
7. If the device is reset later, restore the key with Utilities > Rekey using
   the saved `.pkg` and password. Do not run `genkey` again.

## 6. Certification findings from Roku's official criteria (2026-10-23)

Source: Roku certification criteria, authentication and linking, on-device
authentication and deep linking guides.

| Req. | Rule | PROtv | Action |
| --- | --- | --- | --- |
| 2.2 | All apps except TVE (cable/satellite) must sign in **entirely on the device**; website or code linking ("rendezvous") is prohibited | **Fails**: sign-in is a code approved on watchprotv.com/activate | Development or a release decision (section 8) |
| 4.3 | Apps that *require* sign-in must use the Roku Event Dispatcher | Not required (everything plays as a guest) | None while sign-in stays optional |
| 3.2 / 3.3 / 3.4 / 3.5 / 3.6 | Launch within 15 s; transitions within 3 s; loading indicator over 3 s; key response within 250 ms; playback start within 8 s | Beacon in place; Roku's Video node supplies playback beacons; text loading messages | TV tests 1, 3, 5 |
| 3.7 | Package 4 MB or less | 675 KB | Done |
| 4.1 | Updates keep sign-in and data | Same signing key keeps the registry | Keep the key (section 5) |
| 4.4 | Options (*) during playback reserved for Roku | PROtv does not use * | None |
| 4.5 | Do not interfere with the screensaver | Not touched | None |
| 4.6 | Back behavior | Verified on the TV | Done |
| 4.7 | Trick-play thumbnails, VOD over 15 min (42 titles) | Mux previews while seeking | TV test 2 |
| 4.8 | Captions and audio description **where required by law**, following the global caption settings | No tracks today | Legal determination (content-dependent) |
| 4.9 | Instant Replay rewinds 10–25 s | 10 s | Done |
| 4.10 | Bookmarks, VOD over 15 min, 30+ days | Verified on the TV (signed in) | Done |
| 4.12 | Roku voice keyboards for email, PIN, password | No such entry today | Applies if on-device sign-in is built |
| 4.11, 4.13, 4.14, 2.3, 4.2 | Voice, Continue Watching tile, Instant Resume, Instant Signup, Automatic Account Link | Volume thresholds (millions of hours a month) | Not applicable at launch |
| 5.1 | Deep linking: movie and episode play directly; invalid links go to Home; sample parameters per media type at submission | Implemented | TV test 3; submit movie `LiMNMZWXBxJj3LoP73kU`, episode `5FHvg3BEwBlk9qqNdZT5` |
| 5.2 | Direct to Play for voice commands | Deep-link handling exists; voice search needs Roku Search content | Confirm with Roku at submission |
| 6.1 | Non-zero version, incremented per submission | 0.5.6 | Use 1.0.0 for the first store build (manifest only) |
| 6.3 | No adult content; metadata suitable for all ages | Yes | Done |
| 6.4 | FHD and HD splash, no transparent artwork | Opaque icons, JPEG splashes | Done |

## 7. Reviewer test account

Only needed if the store build offers sign-in.

1. On watchprotv.com create a dedicated account (for example
   roku-review@watchprotv.com), not an admin, not a creator.
2. Add 3 titles to My List and watch part of 2, so Continue Watching shows.
3. Enter the email and password in the dashboard's reviewer notes, with the
   steps: Account > Sign in (or the method the store build uses).
4. Change the password after certification.

## 8. Sign-in decision (requirement 2.2)

Pick one before the store build:

- **A. First release without sign-in.** Hide Account linking and My List in
  the store build; guests keep Continue Watching on the TV. Small change
  (about half a day plus one TV retest). Website sync returns in a later
  update once on-device sign-in exists.
- **B. On-device sign-in.** Email and password typed on the TV with Roku's
  keyboard (email can be pre-filled from the viewer's Roku account), using
  the existing Firebase sign-in. Code linking is removed. Accounts created
  with Google sign-in have no password; Roku does not support Google sign-in,
  so those viewers would need to set a password on the website first. If
  the app offers account creation, that must also work on the TV. About 2–3
  days plus TV testing.

## 9. Privacy policy gaps (watchprotv.com/privacy, effective 2026-09-16)

The policy covers account email and name, My List, playback measurement,
pseudonymous identifiers, retention of playback events and support contact.
Missing for the Roku listing:

1. Continue Watching (watch progress) stored with the account.
2. TV apps: sign-in on the TV, the sign-in saved on the TV, and guest
   progress saved on the TV (and Roku device identifiers, if any are used).
3. How to request access to or deletion of account data, and how long account
   data is kept.
4. A children's privacy statement (the service is not directed to children
   under 13).
5. The operator's name (Prophecy Entertainment LLC) and contact address.
6. State privacy rights (for example California), if applicable.

## 10. Content rights checklist

| Basis | Titles | Keep on file |
| --- | --- | --- |
| Public domain (US) | 49 | Source and reason for each (no renewal, published before 1930, etc.). Status differs by country, so list only countries where it holds |
| Creative Commons Attribution | 4 (Big Buck Bunny, Elephants Dream, Sintel, Tears of Steel) | Licence and the "Blender Foundation" credit shown in each title's details |
| PROtv exclusive | 1 (The Bundy Chronicles) | The signed agreement |
| Creator submissions | 2 (The Lost Camp, Dead Air) | Signed creator agreements (Creator Agent service); add a Rights note to each record |
| Artwork | All | Poster sources; Sita Sings the Blues poster credit (CC BY-SA) is in its credits |

## 11. Remaining release blockers

Mandatory before submission:

0. **Sign-in (2.2):** the decision in section 8, then a new store build.
1. **Captions (4.8):** a legal determination of which titles must be
   captioned. None has caption tracks today.
2. **Store listing details (owner):** countries, age rating, support email
   and phone, admin and technical contacts, reviewer test account.
3. **Privacy policy review:** confirm watchprotv.com/privacy describes TV
   sign-in codes, the sign-in and guest progress saved on the TV, and how to
   request deletion.
4. **Device checks still to run:** launch time, deep links, seek thumbnails,
   network loss, extended playback and memory (tests 1, 3, 5, 6, 7 above).
5. **Signed package** with a backed-up key (section 5).
6. **Distribution rights:** keep the public-domain and Creative Commons
   evidence and the creator agreements ready; list only countries where the
   rights hold.

Strongly recommended:

- Account deletion on the website (`docs/account-deletion-plan.md`). It is
  not listed in Roku's publishing guide, but privacy law expects it and
  Google Play and Apple require it.
- Catalog fixes in `docs/catalog-corrections-proposal.md` (His Girl Friday
  synopsis, series names, years, categories), so the store review shows
  complete metadata.
- Private backup of the code before release work continues (the GitHub
  repository is currently public).
