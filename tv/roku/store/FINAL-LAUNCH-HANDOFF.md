# PROtv for Roku 1.0.0 — final launch handoff

Owner's operational guide, 2026-10-23. Everything a developer could do
without your TV, credentials, legal judgment or publication authority is done.
**Not submitted, not signed, not certified.**

## A. Executive status

| Item | Status |
| --- | --- |
| Release candidate | **RC2** (stable). RC3 candidate exists for one certification issue (see D7) |
| Code readiness | Complete for submission; 0 compiler diagnostics; 10/10 test suites (211 RC2 / 215 RC3 scene regressions) |
| Catalog | 49 titles live, all playable; 7 restricted for documented copyright risks |
| Hardware testing | **Not done for RC2/RC3** (last TV-verified build: v0.6.1) |
| Readiness | Ready for your TV test → signing → dashboard → submission |

Remaining certification blockers (yours):
1. Physical TV tests (D).
2. Published privacy policy and terms (G).
3. A captions decision (4.8, G).
4. Signed .pkg (E).
5. Dashboard fields only you have (F).

## B. Completed work (2026-10-23)

- **App:** RC2 = RC1 + a deep link closing any open sign-in keyboard +
  the deletion contact. RC3 candidate = RC2 + the Video node keeping focus so
  Roku's * menu (captions) can open (branch `fix/roku-caption-options`,
  `d023f0a`).
- **Catalog metadata (production):** 52 audited writes on 18 titles. Fixed
  wrong IMDb links (Phantom of the Opera, D.O.A.; their wrong ratings are
  gone from the website), years (Within Our Gates 1920, Phantom 1925, One Step
  Beyond 1960), the Coal Miner synopsis (a British film), CC notes (Elephants
  Dream 2.5, Sita CC0), titles, series names and categories. Earlier: years on
  40 titles and the His Girl Friday synopsis.
- **Rights (production):** 7 titles restricted (G). Structured film-status
  fields on 28 titles; separated evidence (film, soundtrack, source copy,
  territory, attribution, creator permission) for 43 titles in Firestore
  `titleRightsEvidence` (not publicly readable). `commercialUseStatus` stays
  `unverified` because no source copy is confirmed.
- **Documents:**
  - store/RIGHTS-REPORT.md
  - store/evidence/
  - store/captions-investigation.md
  - store/legal/ (privacy and terms review copy 3, REVIEW.md, ACCOUNT-DELETION-RUNBOOK.md)
  - store/listing.md
  - docs/CERTIFICATION.md, TV-TESTS.md, RELEASES.md, VALIDATION.md
- **Tests (all pass):**
  - compiler
  - model and scene suites, covering navigation, sign-in, playback, Continue Watching, deep links and the spinner
  - ZIP reproducibility: RC2 rebuilt byte for byte
  - live API smoke, including the restriction assertions
  - 21 production checks
  - catalog check after every production batch: 49/49 play, and the 7 restricted titles return 404 on every PROtv path
  - store asset sizes and opacity

## C. Release artifacts (`tv/roku/dist/releases/`, read-only)

| Build | File | SHA-256 | Notes |
| --- | --- | --- | --- |
| **RC2 (stable)** | protv-roku-v1.0.0-rc2.zip (679,714 B) | `471f12dd0cc9974acc3351e2988433bc289dbca8ee7a09b59d1db361095c5bf8` | Branch `release/roku-1.0` (app code `d99f2ef`) |
| RC3 candidate | protv-roku-v1.0.0-rc3-candidate.zip (679,768 B) | `da6e1057b47070fa57cdf1dc57d1e17a80a30c6d72cd9408f8380f8f56b3c2d6` | Branch `fix/roku-caption-options` `d023f0a`; not TV-tested |
| Rollback | protv-roku-v1.0.0-rc1.zip; protv-roku-v0.6.1-tv-verified.zip | see the .sha256 files | v0.6.1 is the last TV-verified build |

Check any ZIP: `sha256sum -c <file>.sha256`. Rebuild RC2: `npm run build` in
`tv/roku` reproduces it exactly.

## D. Physical Roku testing (about 2.5 hours, mostly unattended)

1. **Developer mode:** on the remote press Home ×3, Up ×2, Right, Left,
   Right, Left, Right; accept, set a password, and note the TV's IP address.
2. **Sideload:** open `http://<TV-IP>` on the PC, sign in as `rokudev` with
   that password, upload `protv-roku-v1.0.0-rc2.zip`, and click Install.
3. **Remote and core checks:** TV-TESTS.md sections 1–6, including:
   - OK pauses and resumes; Left/Right seek with previews; Instant Replay;
     Back.
   - Sign in, Create account and Forgot password on the TV.
   - My List.
4. **Playback and resume:** play 3 minutes, press Back, then Resume. Restart
   the TV app and confirm Continue Watching keeps the position.
5. **Deep links** (PC, replace the IP):
   `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=LiMNMZWXBxJj3LoP73kU&mediaType=movie"`
   His Girl Friday plays directly. Repeat while the app is on the sign-in
   keyboard: the keyboard closes and the title plays. An invalid ID lands on
   Home with a message.
6. **Network recovery:** during playback, disconnect the router for 30 s.
   Expect the spinner, then "This title stopped playing. Check your
   connection…", and no crash. Reconnect, press Play: it resumes.
7. **Caption menu (* check):** during playback press *. Record whether
   Roku's overlay appears (TV-TESTS step 8). Then sideload the RC3 candidate
   and run TV-TESTS section 7 (3 minutes). **If all five steps pass, submit
   RC3; otherwise submit RC2.**
8. **Stability:** play a long title for 2 hours without touching the remote.
   Expect no crash or freeze, and the position saved.

## E. Signing and package creation (once; keep the key forever)

1. Telnet to `<TV-IP>` port 8080 and run `genkey`. **Save the Dev ID and
   password in a password manager immediately.** Every future update must be
   signed with this key, or viewers lose saved sign-ins (4.1).
2. Sideload the chosen build (RC2 or RC3), then open `http://<TV-IP>` >
   Packager. Enter the app name `PROtv`, version `1.0.0` and the genkey
   password, then Package and download the .pkg.
3. Verify: the .pkg downloads with a non-zero size; record its SHA-256
   (`certutil -hashfile <file>.pkg SHA256` on Windows).
4. Back up three items together, off this PC, encrypted: the .pkg, the Dev
   ID and the password. If the TV is reset, use Utilities > Rekey with the
   saved .pkg and password. Never run `genkey` again.

## F. Roku dashboard submission (developer.roku.com)

1. **Create the app:** Public, Video, English.
2. **Store info:** paste the values from store/listing.md:
   - name: PROtv
   - short and long descriptions
   - category: Movies & TV
   - release notes
   - "Made for kids": No
3. **Artwork:**
   - Poster: store/app-poster-540x405.jpg.
   - 6 screenshots, 1920x1080: on the TV's web page use Utilities >
     Screenshot, then scale ×1.5 without cropping. Use only live tier A/B
     titles; never edit what the app shows.
4. **URLs:**
   - privacy https://watchprotv.com/privacy (after publishing the update)
   - terms https://watchprotv.com/terms
   - support https://watchprotv.com/contact
   - learn more https://watchprotv.com/about
5. **Contacts:** support email support@watchprotv.com; support phone,
   administrative and technical contact names, emails and phones are **yours
   to enter** (not in project records).
6. **Monetization:** Free. **Sign-in:** Yes.
7. **Territory:** **United States only.**
8. **Age rating:** the mature option (the catalog includes TV-MA and horror).
9. **Test credentials:** the reviewer account from listing.md "Reviewer test
   account"; never your own or an admin account.
10. **Deep-link samples:** movie `LiMNMZWXBxJj3LoP73kU` / `movie`; episode
    `5FHvg3BEwBlk9qqNdZT5` / `episode`.
11. **Package:** upload the .pkg and set the minimum firmware.
12. **Static analysis and App Behavior Analysis:** run both; upload the
    sign-in and sign-out .rasp scripts (listing.md has the key sequences).
13. **Submit for certification:** only when you decide to.

## G. Legal and rights

**Restricted titles** (reversible: Admin > approve; details, audit IDs and
timestamps in store/RIGHTS-REPORT.md section 1):

| Title | Reason |
| --- | --- |
| The Brain from Planet Arous | Renewed (RE0000258469) |
| Beat the Devil | Columbia's 2016 registration of the UK film; novel renewed |
| The Last Man on Earth | *I Am Legend* renewed |
| The Plow That Broke the Plains, The River | Thomson scores renewed |
| Voyage to the Planet of Prehistoric Women | Soviet footage; 1968 basis invalid |
| 50 Classic Cartoons | Contains renewed *The Unruly Hare* |

A viewer who already has a restricted title's Mux link can still stream it
from Mux; closing that means changing its Mux playback ID (your call).

Outstanding approvals and questions:
1. Publish the privacy policy and terms after counsel review
   (store/legal/REVIEW.md: L1–L10, including your postal address).
2. **Captions (4.8):** counsel decides which titles the FCC rule covers; the
   rollout plan never publishes unreviewed captions.
3. **Rights evidence queue:** RIGHTS-REPORT.md section 6 (silent-film
   scores, tier C renewal searches, source copies, Sita music terms, the
   Bundy Chronicles rights holder).
4. **Consent and privacy controls:** a CMP for EEA/UK ad visitors; Do Not
   Track/GPC wording; TTL on 4 device collections. All are listed in
   REVIEW.md with citations.

## H. Final owner checklist (only what needs you)

- [ ] Make the GitHub repository private (it is public; the release branch
      contains legal drafts and rights research, but no secrets).
- [ ] TV tests D1–D8 on a physical Roku; decide RC2 vs RC3 (D7).
- [ ] Counsel review, then publish the privacy policy and terms.
- [ ] Captions decision (counsel).
- [ ] Create the reviewer test account; record the 2 .rasp scripts.
- [ ] Capture 6 screenshots.
- [ ] Generate the signing key, back it up, build and back up the .pkg.
- [ ] Enter the support phone and administrative/technical contacts.
- [ ] Final authorization: submit in the Roku dashboard.
