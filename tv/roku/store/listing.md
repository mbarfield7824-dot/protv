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
- **Sign-in question ("Do customers sign in?"):** **Yes** — Roku: "Authenticated
  SVOD, AVOD, TVE, and free apps must select Yes". Sign-in is optional; every
  title plays as a guest; sign-in, sign-up and password reset happen on the TV.
- **Monetization:** **Free.** This version contains no ads and no purchases.
  If ads are added later, they must use Roku's ad requirements (certification
  1.1), the listing must change to ad-supported with an app-ads.txt URL, and
  the privacy policy must be updated first. Do not describe PROtv as
  permanently ad-free.
- **Countries (recommended):** **United States only.** Roku: "Only add countries
  where you have the rights to distribute your app's content." Every
  public-domain basis on record is US-specific (store/evidence/rights-evidence.md).
  Do not add other countries.
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
  dev app runs. A 1280x720 capture scales evenly by 1.5x to 1920x1080; never
  stretch or crop, and never edit what the app shows. Use only titles that
  are live in the catalog (the 7 restricted titles are gone from the app) and
  are tier A or B in store/evidence/rights-evidence.md, or creator titles:
  1. Home with the hero and first rows
  2. A category row (e.g. Horror) in focus
  3. Title details with Play / Resume / My List
  4. A series screen with seasons and episodes
  5. Playback with the PROtv controls and a seek preview
  6. Account screen signed in (no email visible — use the reviewer account
     only if its email is not personal)

## Reviewer notes (paste into the submission; fill the blanks)

- **Test account:** OWNER creates it (workflow below) and enters it only in
  the dashboard's Test Credentials fields. Never put it in this repository,
  scripts or email.
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

## Reviewer test account (OWNER, about 5 minutes)

1. Use a mailbox you control that is not your personal or admin address.
2. Sign up at watchprotv.com with that address and a new, unique password
   (password manager). Do **not** use Google sign-in for this account.
3. Open the verification email and verify.
4. Confirm it is **not** an admin: it must not open Admin on the website.
5. On the TV: Account > Sign in with it; add one title to My List and play a
   title for 2 minutes, so the reviewer sees synced data.
6. Enter the email and password in the Roku dashboard Test Credentials only.
7. After certification, change the password.

## App Behavior Analysis sign-in/sign-out scripts (OWNER, Roku Remote Tool)

Roku requires these for apps with sign-in. Record them in the Roku Remote
Tool against the sideloaded build, export them as .rasp files, and upload
them in the dashboard. Use the placeholders `script-login` and
`script-password`, never real credentials; at most 10 pauses; no Home step,
and no Back step that would leave the app.

Sign-in (from a cold launch, signed out):

1. launch PROtv; pause 8 s (catalog loads; focus is on the hero)
2. press Up (focus moves to the Guest/profile button, top right)
3. press OK (Account screen opens; **Sign in** is focused)
4. press OK; pause 3 s (Roku shows its own email-sharing screen)
5. choose the option that does **not** share the Roku account email, so the
   keyboard opens empty (record the exact key presses Roku's screen needs)
6. text `script-login`; press Down until **Continue** is focused; press OK
7. text `script-password`; press Down until **Sign in** is focused; press OK
8. pause 6 s ("Signed in." appears)
9. press Back (returns to Home inside the app)

Sign-out (from Home, signed in):

1. press Up (profile button) ; press OK (Account screen; **Sign Out** is
   focused)
2. press OK (signed out immediately; no confirmation)
3. pause 2 s; press Back (returns to Home)

Notes: the Sign In/Out Scripts option appears only for a Public app whose
Customer Account Requirement says an account is required for some features.
PROtv's account is optional. A developer-forum report says Roku asks for
scripts even when sign-in is optional; if the option is missing, ask Roku
support. RC2 closes any open sign-in keyboard when a deep link arrives, so
Analysis deep-link and playback tests cannot be left stuck on the keyboard.

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
| 1 | RC2 sideloaded on a physical Roku; docs/TV-TESTS.md sections 1–6 pass (and the * check, step 8) | OWNER |
| 2 | 2-hour playback soak without a crash | OWNER |
| 3 | Privacy policy and terms updates published on watchprotv.com | OWNER + counsel |
| 4 | Rights: 7 titles restricted 2026-10-23 (store/RIGHTS-REPORT.md); decide the follow-up queue | OWNER + counsel |
| 5 | Captions decision (store/captions-investigation.md) | OWNER + counsel |
| 6 | Reviewer test account created and verified on the TV; App Behavior Analysis scripts recorded | OWNER |
| 7 | Support phone, administrative and technical contacts | OWNER |
| 8 | 6 screenshots captured on the TV | OWNER |
| 9 | Signing key generated and backed up; .pkg built from the tested RC | OWNER |
| 10 | Dashboard: listing text, poster, category, rating, countries, deep-link samples | OWNER (text ready here) |
| 11 | Final authorization to submit | OWNER |
