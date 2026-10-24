# PROtv for Roku 1.0.0 RC5 — final submission handoff

For the owner (Prophecy Entertainment LLC), 2026-10-24. **Not signed, not
submitted, not merged.** Submission needs the owner actions in section 15 and
the owner's explicit approval.

## 1. RC4 baseline verification

| Check | Result |
| --- | --- |
| `protv-roku-v1.0.0-rc4-candidate.zip` SHA-256 | `e6eca2793c21cdd82ddf269a16b29b288ac6fb381285b1c780aa63806d2e8d61`: matches the record |
| RC2, RC3, RC4 caption-test archives | Unchanged (`sha256sum -c` OK); all read-only in `dist/releases/` |
| Owner TV results (RC4) | Playback excellent; OK shows controls and pauses/resumes; Play/Pause; Up/Down; Left/Right seek; * opens caption settings; OK after closing them; Back to details; Continue Watching after restart; caption-test subtitles shown |
| Fire TV work | Untouched (worktrees `D:/protv-firetv-rc`, `D:/protv-firetv-final-20261024`; no Fire TV file changed) |

## 2. RC5 changes

Branch `release/roku-1.0-rc5`, created from RC4 (`718eade`) with the
`release/roku-1.0` records merged in (rights report, legal drafts, earlier
handoff, smoke update; no app code).

| Commit | Change |
| --- | --- |
| `cd14652` | Merge release records (docs and smoke test only) |
| `641105b` | **App:** removed the dormant caption-check title (Apple sample stream, "TEST ONLY" label, manifest flag). LF packaging and `.gitattributes`, so every clone builds the same bytes. Release guards and rights regressions in tests |
| `10cecdf` | Caption tool: converts a reviewed SRT to WebVTT and checks timing (not packaged) |
| (this commit) | Records: certification, releases, TV tests, captions, listing, rights classification, this handoff |

RC5 against RC4, per file: `ProtvScene.brs` -5/+1 lines and `model.brs` -16
lines, all caption-check code. Six other files differ only in line endings.
The remote-control code (playerKeys inside the Video node) is identical.

## 3. Automated test results (RC5, emulator and live; not hardware)

| Suite | Result |
| --- | --- |
| BrighterScript compiler (`npm run check`) | 0 errors |
| Node test runner (`npm test`) | **12/12 pass** |
| — SceneGraph scene regressions (remote focus, OK/Play/seek/Back/*, sign-in, sign-out, session restore, Continue Watching, progress sync, deep links, spinner, errors, network failure, rights) | 226/226 |
| — PlayerRemote component | 23/23 |
| — Model contract tests (catalog, search, categories, series/episodes, resume) | pass |
| — Package: reproducible, runtime files only, ≤ 4 MB, LF only, no test/debug content, no restricted IDs, production API | pass |
| — XML/SceneGraph consistency, layout safe area, assets present | pass |
| — Caption tool | pass |
| Live smoke (`npm run smoke`, public GETs) | pass: 49 titles, 28 approved posters, both artwork holds, 7 restrictions absent, playback authorization and master playlist OK |
| Live rights check | 7 restricted titles: 404 on title, playback and legacy paths; absent from catalog and search. 49/49 permitted titles authorize playback |
| Live captions check | 0 of 49 master playlists has a text track |
| Reproducible build | Same SHA-256 from the worktree and from a CRLF export of `641105b` |

Smoke-test poster count: the authoritative live count is **28**. 32 owner-
approved posters were rolled out, and 4 of them belong to titles restricted
on 2026-10-23. The smoke test asserts exactly 28, so it still catches missing
artwork, and it asserts each restricted ID is absent (`dc86b1b`).

## 4. Physical tests still required

docs/TV-TESTS.md section 8 (about 20 minutes): RC5 package identity (no test
title), playback keys, Rewind/Fast Forward, sign-in/out and Continue
Watching, deep links (movie, episode, restricted ID), network loss, Back to
exit. The 2-hour soak (section 5) has never been run. Emulator results do not
replace these.

## 5. Rights clearance status

store/rights-launch-classification.md, all 56 titles:

| Class | Titles |
| --- | --- |
| Cleared with documented evidence | **4**: Tears of Steel, Sintel (CC BY 3.0, attributed), The Lost Camp, Dead Air (creator agreements) |
| Requires further verification (live today) | **45**: film basis known but PROtv's source copy, soundtrack or restoration not documented, or tier C/D questions |
| Restricted | **7**: not restored |

Enforcement is verified on every PROtv path (section 3). **Residual:** the
restricted titles' Mux playback IDs are public-policy IDs. Anyone who saved
one can still stream it from stream.mux.com. The IDs are only in Firestore
and Mux. Admin access was not used, so they were not tested directly.
**Revocation impact:** deleting a restricted asset's public playback ID
affects only that asset. No permitted title is involved, provided each title
has its own asset (confirm in Mux). Re-approving such a title later needs a
new playback ID written to its record. Not done: owner decision.

## 6. Caption status

Player verified on TV (RC4 caption-test package). Catalog: **0 of 49 titles
has captions.** Mux auto-captions carry no extra charge but attach to the
live asset, which would publish unreviewed captions, so they were not used.
A reviewed one-title workflow (Tears of Steel, Blender's official subtitles)
is ready in store/captions-investigation.md. Fetching the file needs your
browser, because the server shows a browser check. Roku 4.8 requires captions
"where required by law". Whether 47 CFR 79.4 covers any title (programming
shown on US TV with captions) is **counsel's decision**. No PROtv text claims
captions.

## 7. Legal and privacy status

- **Live policy is out of date:** watchprotv.com/privacy (effective
  2026-09-16) omits Google sign-in, AdSense (which loads on every page, client
  ca-pub-4919337744329286), Mux Data playback analytics, Vercel Web Analytics
  details, watch progress, TV sessions and account deletion. It says providers
  process "only the information needed", which AdSense's cross-site
  collection contradicts.
- **Drafts:** store/legal/privacy-policy-draft.md and terms-of-use-draft.md
  (review copy 3). Every observed live practice is covered. Video ads are
  confirmed off (`/api/ads/session/<id>` → `{"enabled":false}`). Open
  placeholders for owner or counsel: effective date, **postal address**,
  deletion turnaround, ad network, and the terms' disclaimers, liability and
  governing-law section. Questions L1–L10 and technical gaps T1–T7 are in
  store/legal/REVIEW.md. **Nothing was published.**
- **Account deletion:** manual runbook (store/legal/ACCOUNT-DELETION-RUNBOOK.md).
  The Roku Account screen shows the request address (auto-tested), and the
  support mailbox has MX records (privateemail.com). **Not verified end to
  end:** it needs the Firebase console and a disposable test account. No
  customer account was touched.

## 8. Store asset inventory

| Asset | Status |
| --- | --- |
| Channel icons 290x218 / 540x405 | In package; opaque (every pixel alpha 255) |
| Splash 1280x720 / 1920x1080 | In package |
| Store poster 540x405 JPEG | store/app-poster-540x405.jpg (black, royal/electric blue, white) |
| Name, descriptions (227 / 826 chars), category, release notes | store/listing.md |
| Deep-link samples | Movie: Tears of Steel (`gbcxmtl6mAHQeBxx8Dgs`). Episode: Fleischer Studios' Superman (`iUX01XuVHd9okFW4gmqR`), owner to confirm (no episode is fully cleared) |
| Reviewer notes, test-account and .rasp script procedures | store/listing.md |
| Screenshots (up to 6, 1920x1080) | **Not captured**: needs your TV (procedure below). None were fabricated |
| Privacy / terms / support / learn-more URLs | /privacy and /terms exist but need the approved text; /contact and /about live |

**Screenshots:** sideload RC5, open `http://<TV-IP>` > Utilities > Screenshot
on each screen listed in store/listing.md "Artwork". Save the 1280x720 PNG
and scale it ×1.5 to 1920x1080 without cropping or editing. Use cleared
titles only.

## 9. Package signing status

**Not signed.** Roku (packaging guide, updated 2026-10-15) signs only on a
developer device linked to your Roku developer account. Run `genkey` once
over Telnet port 8080 (it prints a Dev ID and password), sideload, then open
Utilities > Packager. No signing key, Dev ID or password exists in this
repository or on this PC, and none was invented.

## 10. Release ZIP

`D:\protv\tv\roku\dist\releases\protv-roku-v1.0.0-rc5-candidate.zip`
(680,917 bytes, read-only). Built with the website's public Firebase web key
injected (account linking enabled); the key is never written to source.

## 11. Signed PKG

None (section 9).

## 12. SHA-256 checksums

| File | SHA-256 |
| --- | --- |
| protv-roku-v1.0.0-rc5-candidate.zip | `94fc56ce2ef411fa4c24c2439b55b7c49f4c6ced80b9838d62bb093eeb8812c7` |
| protv-roku-v1.0.0-rc4-candidate.zip (rollback) | `e6eca2793c21cdd82ddf269a16b29b288ac6fb381285b1c780aa63806d2e8d61` |
| protv-roku-v1.0.0-rc4-caption-test.zip (diagnostic, never submit) | `91059398eae7345ec25e30e68c1bf23fc24c8257911409e453da7ec28bc932d2` |
| protv-roku-v1.0.0-rc3-candidate.zip | `da6e1057b47070fa57cdf1dc57d1e17a80a30c6d72cd9408f8380f8f56b3c2d6` |
| protv-roku-v1.0.0-rc2.zip | `471f12dd0cc9974acc3351e2988433bc289dbca8ee7a09b59d1db361095c5bf8` |

**Rebuild:** `git checkout 641105b` (or a later commit on this branch, which
changes only tools and records), then in `tv/roku` run `npm ci`. Set
`ROKU_FIREBASE_API_KEY` to the website's `VITE_FIREBASE_API_KEY`, then run
`node tools/package.mjs`. The result has the SHA-256 above.

## 13. Git

Branch `release/roku-1.0-rc5` (pushed; not merged). App code at `641105b`.
`main` and `release/roku-1.0` are unchanged. The GitHub repository is
**public**; no secrets are tracked (the Mux .pem, Firebase service-account
JSON and `.env` are git-ignored and absent from history).

## 14. Certification readiness (submission gates)

| # | Gate | Status |
| --- | --- | --- |
| 1 | RC5 automated tests pass | **Met** |
| 2 | No known critical playback regressions | **Met** (RC4 TV-verified; RC5 playback code identical) |
| 3 | Physical RC5 testing | **Open**: TV-TESTS.md section 8 and the 2-hour soak |
| 4 | Mandatory caption requirements | **Open**: counsel decides whether 47 CFR 79.4 covers any title; 0 titles captioned |
| 5 | Content rights cleared for launch titles | **Not met**: 4 of 49 cleared; 45 need verification, or a narrower launch catalog |
| 6 | Legal/privacy approved and live | **Not met**: drafts pending counsel; live policy inaccurate |
| 7 | Account deletion verified | **Partly**: documented manual process; not tested end to end |
| 8 | Signing credentials | **Not available** here (owner's device) |
| 9 | Signed package | **Not produced** |
| 10 | Screenshots and store assets | **Partly**: text, icons, splash, poster ready; screenshots need the TV |
| 11 | Reviewer account and scripts | **Not done** |
| 12 | Developer account access | **Not available** here |
| 13 | Owner approval of the final package and submission | **Not given** |

Roku criteria rechecked (page updated 2026-10-05): docs/CERTIFICATION.md.
New since the last review, and already met: 3.6 video start beacons (fired
by Roku OS for the Video node), 3.7 the 4 MB limit (test-enforced).

**Verdict: not ready to submit now.**

## 15. Remaining owner actions (in order)

1. **Counsel:** approve the privacy policy and terms drafts. Supply the postal
   address and fill the placeholders. Then publish them on watchprotv.com
   (`frontend/src/pages/Privacy.jsx`, `Terms.jsx`).
2. **Counsel and owner:** decide the launch catalog. Either clear the 45 titles
   (RIGHTS-REPORT.md section 6 queue: source copies, silent-film scores, CCE
   renewals, Sita, Bundy), or restrict those not cleared with the existing
   reversible workflow (this changes the website too). Decide whether to
   revoke the restricted titles' Mux playback IDs.
3. **Counsel:** the captions decision (47 CFR 79.4). Optionally run the
   one-title Tears of Steel workflow.
4. Sideload RC5; run TV-TESTS.md section 8 and the 2-hour soak.
5. Create the reviewer account and record the two .rasp scripts
   (store/listing.md).
6. Capture the 6 screenshots (section 8).
7. Run `genkey` once, back up the Dev ID and password, package RC5, back up
   the .pkg, and record its SHA-256.
8. Test account deletion end to end with a disposable account
   (ACCOUNT-DELETION-RUNBOOK.md).
9. Enter the support phone and administrative/technical contacts.
10. Consider making the GitHub repository private (legal drafts and rights
    research are public).
11. Give explicit approval of the signed package and the submission.

## 16. Submission instructions (after every gate is met)

1. developer.roku.com > Streaming Store > Add app: Public, Video, English.
2. Store info from store/listing.md: name PROtv, descriptions, category
   Movies & TV, release notes, Made for kids: No, Free, sign-in Yes,
   **United States only**, mature age rating (questionnaire).
3. Upload the poster and 6 screenshots.
4. URLs: privacy https://watchprotv.com/privacy (after publishing), terms
   https://watchprotv.com/terms, support https://watchprotv.com/contact,
   learn more https://watchprotv.com/about; support email
   support@watchprotv.com; your phone and contacts.
5. Test credentials: the reviewer account only. Deep-link samples from
   section 8. Reviewer notes from store/listing.md.
6. Upload the signed RC5 .pkg (set minimum firmware as Roku asks; Squashfs
   needs 8.0 or higher). Run Static Analysis and App Behavior Analysis
   (upload the .rasp scripts) and fix any error.
7. Submit for certification only after the approval in section 15.

## 17. Rollback

- **Before publication:** sideload `protv-roku-v1.0.0-rc4-candidate.zip`
  (TV-verified; same playback code; it carries the dormant caption-check
  code, so do not submit RC4 as is). The source is `2756e20` on
  `fix/roku-caption-options`.
- **After publication:** a store build cannot be swapped silently. Repackage
  the earlier source with a higher version number (certification 6.1) and the
  **same signing key**, then submit it as an update.
- **Website records:** this release changed nothing in production. Rights
  restrictions roll back through Admin > approve (RIGHTS-REPORT.md section 1).
