# PROtv Roku Channel Store submission package (draft for owner review)

Copy into the Roku developer dashboard after review. Items marked **OWNER**
must come from the owner; nothing here is a legal or rights declaration and
nothing has been entered in the dashboard or submitted.

## App

- **Name (30 max):** PROtv
- **Type:** Video (SceneGraph, non-TVE)
- **Default language:** English
- **Made for kids:** No
- **Category (recommended):** Movies & TV (closest offered: "Movies & TV",
  then "Classic TV" as a secondary if a second category is allowed)
- **Version:** 1.0.0 (build: see docs/RELEASES.md for the RC in submission)
- **Sign-in question:** Yes — free account; sign-in is optional, every title
  plays as a guest; sign-in, sign-up and password reset happen on the TV
- **Monetization:** Free, no ads, no purchases in the Roku app
- **Countries (recommended):** **United States only** at launch. Public-domain
  status on record is US-specific; see store/rights-matrix.md. OWNER decides.
- **Age rating (recommended):** choose the rating that covers the most mature
  title. The catalog includes Dead Air (TV-MA) and horror, crime and war
  titles, so a mature/17+ app rating is the conservative answer. OWNER
  answers the dashboard questionnaire; no title rating was invented.

## Description, on-device (300 max; 227 characters)

PROtv streams free classic movies, cartoons, TV episodes, documentaries, Black Cinema and original films from independent creators. Link your free PROtv account to keep My List and Continue Watching in sync with watchprotv.com.

## Description, online (1,500 max; 826 characters)

PROtv is a free streaming service from Prophecy Entertainment LLC, built around timeless public-domain cinema and new work from independent creators.

Watch classic films, including horror, film noir, comedy and science fiction favorites, alongside landmark Black Cinema, documentaries, vintage cartoons and TV episodes. PROtv Creators brings original films and series from independent filmmakers, featured first across the app. AI Cinema showcases new films made with AI tools.

Browse by category or pick a mood with PROtv Discover. Sign in or create a free PROtv account right on your TV to save titles to My List and pick up where you left off with Continue Watching, in sync with watchprotv.com. No account? Watch as a guest; your progress is kept on your TV.

Filmmakers can submit their work at watchprotv.com/creators.

## Release notes, 1.0.0

First release of PROtv for Roku: browse the PROtv catalog, sign in or create a free account on your TV, My List, Continue Watching with resume, series with seasons and episodes, and PROtv playback controls with seek previews.

## URLs and contacts

- **Privacy policy:** https://watchprotv.com/privacy — **publish the update
  first** (draft: store/legal/privacy-policy-draft.md; OWNER/counsel approve)
- **Terms:** https://watchprotv.com/terms (draft: store/legal/terms-of-use-draft.md)
- **Support URL:** https://watchprotv.com/contact
- **Support email:** support@watchprotv.com (already published on the site)
- **Support phone (with country code):** OWNER
- **Learn more URL:** https://watchprotv.com/about
- **Administrative and technical contacts:** OWNER

## Artwork

- **App poster (540x405 JPEG, opaque):** store/app-poster-540x405.jpg —
  black background, royal and electric blue PROtv mark, white type.
- **Splash:** in the package (1920x1080 FHD, 1280x720 HD, opaque).
- **Screenshots (up to 6, 1920x1080, capture on the developer TV):** OWNER.
  Device web page (http://<roku-ip>) > Utilities > Screenshot while the
  dev app runs. A 1280x720 capture scales evenly by 1.5x; never stretch or
  crop. Recommended set, using only titles with structured rights evidence
  (rights-matrix.md "source" rows or creator titles):
  1. Home with the hero and first rows
  2. A category row (e.g. Horror) in focus
  3. Title details with Play / Resume / My List
  4. A series screen with seasons and episodes
  5. Playback with the PROtv controls and a seek preview
  6. Account screen signed in (no email visible — use the reviewer account
     only if its email is not personal)

## Reviewer notes (paste into the submission; fill the blanks)

- **Test account:** OWNER creates a dedicated, non-admin PROtv account.
  Email: ______  Password: ______ (never a personal or admin account).
- **Guest:** every title plays without signing in.
- **Sign in:** Home > profile button (top right) > Account > Sign in. Roku
  may ask to share the Roku account email; Accept or Decline. Edit the email
  if needed, choose Continue, type the password, choose Sign in. "Signed in."
  appears and My List / Continue Watching sync with watchprotv.com.
- **Create account / Forgot password** are on the same Account screen.
- **Delete account:** the signed-in Account screen says to email
  support@watchprotv.com.
- **Playback controls:** OK pauses/plays; Left/Right seek with previews;
  Instant Replay jumps back 10 s; Back exits to details.
- **Deep links** (contentId + mediaType; invalid IDs land on Home with a
  message):
  - Movie: `contentId=LiMNMZWXBxJj3LoP73kU&mediaType=movie` (His Girl Friday, 92 min)
  - Episode: `contentId=5FHvg3BEwBlk9qqNdZT5&mediaType=episode` (One Step Beyond - The Storm)
  - Test on a dev device:
    `curl -d "" "http://<roku-ip>:8060/launch/dev?contentId=LiMNMZWXBxJj3LoP73kU&mediaType=movie"`
    and while running:
    `curl -d "" "http://<roku-ip>:8060/input/dev?contentId=5FHvg3BEwBlk9qqNdZT5&mediaType=episode"`

## Signing (OWNER, on the developer TV)

Follow docs/RELEASE-PREP.md section 5. In short: telnet to the TV on port
8080, run `genkey` once, **store the generated password and Dev ID in a
password manager** (every future update must be signed with the same key, or
signed-in viewers are logged out — certification 4.1). Sideload the RC ZIP,
then Utilities > Packager produces the signed .pkg to upload. The ZIP in
dist/releases is not signed.

## Submission checklist

| # | Item | Status |
| --- | --- | --- |
| 1 | RC sideloaded on a physical Roku; docs/TV-TESTS.md sections 1–6 pass | OWNER |
| 2 | 2-hour playback soak without a crash | OWNER |
| 3 | Privacy policy and terms updates published on watchprotv.com | OWNER + counsel |
| 4 | Rights decisions in store/rights-matrix.md "Unresolved" (countries) | OWNER + counsel |
| 5 | Captions decision (rights-matrix.md "Captions") | OWNER + counsel |
| 6 | Reviewer test account created and verified on the TV | OWNER |
| 7 | Support phone, administrative and technical contacts | OWNER |
| 8 | 6 screenshots captured on the TV | OWNER |
| 9 | Signing key generated and backed up; .pkg built from the tested RC | OWNER |
| 10 | Dashboard: listing text, poster, category, rating, countries, deep-link samples | OWNER (text ready here) |
| 11 | Final authorization to submit | OWNER |
