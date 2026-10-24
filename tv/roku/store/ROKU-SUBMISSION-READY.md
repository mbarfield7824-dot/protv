# PROtv for Roku 1.0.0 — submission readiness (final handoff)

For the owner (Prophecy Entertainment LLC), 2026-10-24. **Not submitted.
Not signed.** RC5 engineering is frozen and unchanged.

**Verdict: not ready to submit.** The app is finished and TV-verified. What
remains is rights, legal and owner-only steps (section 9), not engineering.

## Update, 2026-10-24 (rights remediation pass)

| Item | Status |
| --- | --- |
| Roku launch catalog | **28 titles ready (Group A)**, 6 remediation-ready (Group B), 15 on rights hold (Group C); 7 restricted unchanged. Evidence: ROKU-LAUNCH-CATALOG.md |
| Server-side eligibility | Built and tested on `feature/roku-launch-eligibility` (`58d0f28`); **not deployed**. Roku sees only Group A; website and Fire TV unchanged |
| Replacement media | 6 verified sources pinned by checksum; KIPHO muted file staged; `apply-remediation.cjs check` passed; not applied |
| Posters | 3 original replacements (900x1350): His Girl Friday, The Duke Is Tops, The Incredible Petrified World; not applied |
| Captions | Official Tears of Steel subtitles (CC BY) converted and checked (timing aligned to +0.1 s); human review pending; not attached |
| RC5 | Unchanged (SHA-256 `94fc56ce…`); 12/12 tests pass; live smoke passes |
| Signing | Not signed: no Roku reachable from this PC and no credentials exist here |
| 2-hour soak | **Not performed** |
| Ready to submit | **No.** Next steps: OWNER-APPROVALS.md (5 batched decisions) |

Earlier content below is kept for history; where it differs, this update and
OWNER-APPROVALS.md take precedence.


## 1. Completed requirements

| Requirement | Status | Evidence |
| --- | --- | --- |
| RC5 build, unchanged | Done | `protv-roku-v1.0.0-rc5-candidate.zip`, SHA-256 `94fc56ce2ef411fa4c24c2439b55b7c49f4c6ced80b9838d62bb093eeb8812c7` (re-verified today); app code unchanged since `641105b` |
| Automated tests | Pass | bsc 0 errors; 12/12 node tests (226 scene, 23 PlayerRemote); live smoke (RC5-FINAL-SUBMISSION-HANDOFF.md section 3) |
| Physical testing | RC5 reported working flawlessly by the owner (2026-10-24); RC4 detailed results in docs/TV-TESTS.md | Owner report |
| Remote, Back, playback, captions menu, Continue Watching, sign-in | Verified on TV (RC4, same code) | docs/TV-TESTS.md section 7 |
| Rights investigation, all 49 live titles | Done | TITLE-RIGHTS-MATRIX.md |
| Restricted titles enforced | Verified live | 7 titles: 404 on every PROtv path |
| Privacy and terms drafts, checked against live behaviour | Done (not published) | legal/LIVE-VS-DRAFT-CORRECTIONS.md, legal/privacy-policy-draft.md, legal/terms-of-use-draft.md |
| Account deletion audit | Done; runbook verification defect fixed | legal/ACCOUNT-DELETION-RUNBOOK.md |
| Captions assessment and rollout | Done | CAPTIONS-ASSESSMENT.md, captions-investigation.md |
| Store listing, every dashboard field | Done except owner-only values | STORE-SUBMISSION-PACKAGE.md, listing.md |
| Certification criteria (2026-10-05) | Rechecked | docs/CERTIFICATION.md |

## 2. Rights matrix

TITLE-RIGHTS-MATRIX.md (CSV: evidence/rights-matrix-2026-10-24.csv).

| Class | Titles |
| --- | --- |
| Documented clearance | **7**: Tears of Steel, Sintel, Big Buck Bunny, Elephants Dream, The Lost Camp, Dead Air, A Day in the Life of a Coal Miner (US) |
| Evidence incomplete: high risk | **8**: Body and Soul, Carnival of Souls, Cavalcade of Stars, Detour, One Step Beyond - The Storm, The Scar of Shame, Within Our Gates, Woman on the Run |
| Evidence incomplete: medium | 22 |
| Evidence incomplete: low (one music or renewal check left) | 12 |
| Restricted (unchanged) | 7 |

Key findings from PROtv's own copies: Criterion/Janus releases (Body and
Soul, Carnival of Souls), modern restorations (Detour 2018 Academy Film
Archive; Woman on the Run UCLA; KIPHO Deutsche Kinemathek), and modern scores
on silent films. Also unpublished-broadcast and CBS questions (Cavalcade of
Stars, One Step Beyond), song copyrights (Gulliver's Travels and others), and
poster provenance (32 owner-supplied posters with no recorded creation
method; two depict real performers; one hotlinked image). **No catalog change
was made.**

Limit: Firestore was read read-only. The printed Catalog of Copyright Entries
(renewals before 1978) was not searched.

## 3. Privacy and legal drafts

- Drafts (review copy 3) match every verified practice: Google sign-in,
  AdSense, Mux Data, Vercel Analytics, TV sign-in, the Roku email request,
  progress and history, safety reports, video ads off.
- The live policy omits most of them; legal/LIVE-VS-DRAFT-CORRECTIONS.md gives
  each live passage and its replacement (P1–P6, T1–T6).
- Roku dashboard privacy answers are in the same file, section 4.

## 4. Caption assessment

- 0 of 49 titles captioned. The player is verified on TV.
- 47 CFR 79.4 applies only to programming "published or exhibited on
  television in the United States with captions" since 2012-09-30. Library
  titles must be captioned within 15 days of such a showing after 2016-03-30.
- Counsel needs per-title airing facts (CAPTIONS-ASSESSMENT.md section 3);
  nothing is assumed either way.
- Pilot: Tears of Steel with Blender's official subtitles. The rights are
  verified (Mango CC BY 3.0 covers "all the data we publish"), but the file
  must be downloaded in a browser, because the server shows a browser check.
- 9 classic titles have free speech-recognition drafts aligned to PROtv's copy.

## 5. Store asset inventory

| Asset | Status |
| --- | --- |
| Name, descriptions, category, rating guidance, release notes | Ready (within limits) |
| Poster 540x405 | Ready (`store/app-poster-540x405.jpg`) |
| Channel icons, splash (in package) | Ready (opaque; HD and FHD) |
| Screenshots (6) | **Owner captures** (STORE-SUBMISSION-PACKAGE.md section 4). No Roku was reachable from this PC, and none were fabricated |
| Reviewer notes, authentication walkthrough, deep-link samples and tests | Ready (sections 6–7 of the package) |
| Sign-in/sign-out .rasp scripts | Owner records (key sequences ready) |
| Privacy / terms URLs | Live pages exist; approved text not yet published |
| Support URL, email, learn-more URL | Ready |
| Support phone, admin and technical contacts | **Owner** |

## 6. Reviewer account procedure

STORE-SUBMISSION-PACKAGE.md section 5: a dedicated non-admin mailbox,
email/password (not Google), verified, one My List title and 2 minutes
played; credentials only in the dashboard; password changed after
certification. No real user credentials appear anywhere in the repository.

## 7. Signing status

**Not signed.** Roku signs only on a developer Roku linked to your developer
account: `genkey` over Telnet port 8080 (it prints a Dev ID and password),
sideload, then Utilities > Packager. No Dev ID, key, password or .pkg exists on
this PC (searched by file name; nothing printed). A ZIP is not a signed
package and must not be uploaded as one.

## 8. Physical test evidence

| Build | Evidence |
| --- | --- |
| RC4 | Owner, 2026-10-24: playback excellent; OK, Play/Pause, Up/Down, seeking, *, OK after captions, Back, Continue Watching after restart; caption-test subtitles shown |
| RC5 | Owner, 2026-10-24: "works flawlessly". Detailed results for TV-TESTS.md section 8 (package identity, deep links, restricted link, network loss) are not recorded |
| 2-hour soak (TV-TESTS.md section 5) | **Never performed. Outstanding.** Not claimed |

## 9. Outstanding decisions and actions

**Legal and rights (counsel and owner):**

1. Decide each high-risk title: clear it with evidence, replace the copy or
   score, or restrict it with the existing reversible workflow (website and
   Roku both). You certify distribution rights when you submit.
2. Approve and publish the privacy policy and terms. Supply the **postal
   address**; decide L2–L8.
3. Captions determination under 47 CFR 79.4, with the per-title airing facts.
4. Likeness on two posters; record how the 32 owner posters were made; replace
   the hotlinked poster.
5. Creator-record handling on deletion; whether to revoke restricted titles'
   Mux playback IDs.

**Owner-only steps:**

6. Run TV-TESTS.md section 8 on RC5 and record the results; run the 2-hour soak.
7. Capture the 6 screenshots (cleared titles only).
8. Create the reviewer account; record the 2 .rasp scripts.
9. `genkey` once; back up the Dev ID and password; package RC5; back up the
   .pkg and record its SHA-256.
10. Test account deletion with a throwaway account (runbook section 5).
11. Enter the support phone and administrative and technical contacts.
12. Explicitly authorize the final submission.

## 10. Exact submission steps (only after section 9 is done)

1. developer.roku.com > Streaming Store > add app; fill every field from
   STORE-SUBMISSION-PACKAGE.md sections 1–3.
2. Upload the poster and 6 screenshots.
3. Add test credentials, deep-link samples and reviewer notes (sections 5–7).
4. Upload the signed RC5 .pkg; set minimum firmware; run Static Analysis and
   fix errors.
5. Upload the .rasp scripts; run App Behavior Analysis.
6. Schedule (second business day at the earliest; not Friday or weekend);
   tick both confirmations **only when they are true**; submit.

Rollback: RC5-FINAL-SUBMISSION-HANDOFF.md section 17.
