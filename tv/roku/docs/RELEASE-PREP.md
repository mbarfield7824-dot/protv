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
| Reviewer test account | *owner*: a dedicated non-admin PROtv account | Reviewers link it with the on-screen code at watchprotv.com/activate |
| Support URL | https://watchprotv.com/contact | |
| Support email and phone | *owner* | Phone must include the country code |
| Admin and technical contacts | *owner* | Names, emails, phones with country codes |
| Learn more URL | https://watchprotv.com/about | |
| Monetization | Free (no ads in the Roku app) | Ads would require Roku's ad framework and app-ads.txt |
| Vanity access code | *owner* (optional), e.g. PROTV | 6 alphanumeric, or a custom code up to 20 |
| Minimum firmware | Roku OS 9.0 or later (proposed) | Match the package format chosen when packaging |

## 2. Artwork and screenshots

- **App poster:** 540x405 JPEG or PNG. Existing `assets/channel-icon-fhd.png`
  is 540x405 and can be uploaded as-is.
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

## 6. Remaining release blockers

Mandatory before submission:

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
