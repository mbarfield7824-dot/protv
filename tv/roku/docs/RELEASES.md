# Roku release checkpoints

## 1.0.0 release candidate 6 (2026-10-24) — submission candidate, TV recheck needed

| Item | Value |
| --- | --- |
| Branch | `release/roku-1.0-rc6` (from RC5 `9538cb1`) |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc6-candidate.zip` (read-only), 680,915 bytes |
| SHA-256 | `30ca43cc6f61d0f169710219e8ca6c3ba7b2df95ed624c33d6518c0db91e47f4` |
| Why | Roku Static Analysis (official sca-cmd, Oct 2026 build) reported an **ERROR** on RC5: the manifest needs `rsg_version=1.3`. Roku: "You must set this parameter to rsg_version=1.3 by October 1, 2026, to continue passing certification testing." RC5 also used the deprecated `InitClientCertificates()` |
| Changes from RC5 | Exactly two lines: manifest adds `rsg_version=1.3`; `components/HttpTask.brs` drops `transfer.InitClientCertificates()` (device client certificates; PROtv never requests them; server certificate checking is unchanged). Every other file is byte-identical to RC5 |
| Static Analysis | **0 errors.** Warnings: AppDialog beacons (not applicable: no dialog before Home) and 5 memory-monitoring suggestions (advisory) |
| Tests | bsc 0 errors; 12/12 node tests (new guards for both lines) |
| Physical | Not yet tested on a TV: TV-TESTS.md section 9 (about 10 minutes) |

RC5 (`94fc56ce…`) is preserved unchanged as the rollback baseline.

## 1.0.0 release candidate 5 (2026-10-24) — submission candidate, owner TV-tested

Owner report, 2026-10-24: RC5 "works flawlessly" on a physical Roku TV.
Detailed TV-TESTS.md section 8 results are not recorded; the 2-hour soak has
not been run.

| Item | Value |
| --- | --- |
| Branch / commit | `release/roku-1.0-rc5` at `641105b` (app code; later commits are tools and records only). Not merged |
| Manifest | 1.0.0 (title PROtv) |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc5-candidate.zip` (read-only), 680,917 bytes |
| SHA-256 | `94fc56ce2ef411fa4c24c2439b55b7c49f4c6ced80b9838d62bb093eeb8812c7` |
| Reproducible | Same SHA-256 from the worktree and from a CRLF `git archive` export of `641105b` (ROKU_FIREBASE_API_KEY = the website's public Firebase web key) |
| Changes since RC4 | Removed the dormant caption-check title and its manifest flag (ProtvScene.brs -5/+1 lines, model.brs -16 lines). Six untouched files differ from RC4 in line endings only (RC4 mixed CRLF/LF; RC5 packages LF). No change to playback, remote keys, sign-in, Continue Watching or deep links |
| Tests | `bsc` 0 errors; 12/12 node tests (226 scene, 23 PlayerRemote, model, package release guards, caption tool); live smoke passed (49 titles, 28 approved posters, 7 restrictions) |
| Signed .pkg | None. Signing needs the owner's developer Roku (store/RC5-FINAL-SUBMISSION-HANDOFF.md) |

Rollback: RC4 (`protv-roku-v1.0.0-rc4-candidate.zip`, TV-verified) is the
baseline. RC4 and RC5 run the same remote-control code.

## 1.0.0 release candidate 4 (2026-10-24) — TV-verified by the owner (rollback baseline)

Owner TV results, 2026-10-24: playback excellent; OK shows the controls and
pauses/resumes; Play/Pause; Up/Down show the controls; Left/Right seek; *
opens Roku's caption settings and OK works after closing them; Back returns
to the title details; Continue Watching persists after restart; the
caption-test package shows English subtitles.


| Item | Value |
| --- | --- |
| Branch / commit | `fix/roku-caption-options` at `2756e20` (app code; this doc commit follows). Not merged |
| Manifest | 1.0.0 |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc4-candidate.zip` (read-only), 681,436 bytes |
| SHA-256 | `e6eca2793c21cdd82ddf269a16b29b288ac6fb381285b1c780aa63806d2e8d61` |
| Caption-check ZIP | `dist/releases/protv-roku-v1.0.0-rc4-caption-test.zip` (read-only), 681,467 bytes, SHA-256 `91059398eae7345ec25e30e68c1bf23fc24c8257911409e453da7ec28bc932d2`. **TV testing only; never submit.** Same code; the manifest adds `protv_caption_test=1` and the title "PROtv CAPTION TEST" |
| Changes since RC3 | OK during playback shows PROtv's controls again. Focus goes to `playerKeys` (new `PlayerRemote` component) nested in the Video node: PROtv's keys are caught there, and * passes up to the Video node for Roku's caption settings. Package files changed: `components/PlayerRemote.brs/.xml` (new), `ProtvScene.brs/.xml`, `source/model.brs`; every other file is byte-identical to RC3 |
| Tests | `bsc` clean; 11/11 node tests: 228 scene checks (27 fail against RC3's controller), 23 PlayerRemote checks, model and package checks. `npm run smoke` fails on live data unrelated to this change (28 approved posters, test expects 32) |

**Cause of the RC3 failure:** a focused Video node swallows OK even with
`enableUI="false"`. RC3 focused the Video node so Roku's Options overlay could
open, so OK never reached the scene. The scene tests called `onKeyEvent`
directly and so could not see this; they now route keys through the focus
chain.

RC2 and RC3 are preserved unchanged. Neither RC4 ZIP is signed. TV checks:
TV-TESTS.md section 7.

## 1.0.0 RC3 candidate (2026-10-23, NOT TV-tested; RC2 remains the stable candidate)

| Item | Value |
| --- | --- |
| Branch / commit | `fix/roku-caption-options` at `d023f0a` (pushed; not merged) |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc3-candidate.zip` (read-only), 679,768 bytes |
| SHA-256 | `da6e1057b47070fa57cdf1dc57d1e17a80a30c6d72cd9408f8380f8f56b3c2d6` |
| Change from RC2 | The Video node keeps focus during playback, so Roku's Options (*) overlay (captions) can open; package differs from RC2 only in ProtvScene.brs/.xml |
| Promote to stable only if | TV-TESTS.md section 7 passes on a physical Roku |

## 1.0.0 release candidate 2 (2026-10-23, not yet TV-tested) — submission candidate

| Item | Value |
| --- | --- |
| Branch / commit | `release/roku-1.0` at `d99f2ef` (app code; this doc commit follows) |
| Manifest | 1.0.0 |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc2.zip` (read-only), 679,714 bytes |
| SHA-256 | `471f12dd0cc9974acc3351e2988433bc289dbca8ee7a09b59d1db361095c5bf8` |
| Changes since RC1 | A deep link during sign-in ends the sign-in flow before playing (5.1); signed-in Account screen shows the deletion contact |

RC1 is preserved unchanged. Neither ZIP is signed; the signed .pkg is made on
the developer TV with Roku's Packager (store/listing.md "Signing").

## 1.0.0 release candidate 1 (2026-10-24, not yet TV-tested)

| Item | Value |
| --- | --- |
| Branch | `release/roku-1.0` (local) |
| Manifest | 1.0.0 |
| Sideload ZIP | `dist/releases/protv-roku-v1.0.0-rc1.zip` (read-only) |
| SHA-256 | `86571fab6be10be332d9b2aa29ddb7d24d6eaa95048a0b137931e8485571732f` |
| Changes since v0.6.1 | Loading spinner for visible waits (certification 3.4); version 1.0.0 |

This is a **sideload ZIP, not a signed store package**. The signed .pkg is
made on the developer TV with Roku's Packager (RELEASE-PREP.md section 5).

## roku-v0.6.1-tv-verified (2026-10-24)

Owner-verified on a physical Roku: on-device email/password sign-in, Roku
keyboard navigation, sign-in persistence, movie playback, Continue Watching
after restart (with backend fix b123f03 in production), resume.

| Item | Value |
| --- | --- |
| Git tag | `roku-v0.6.1-tv-verified` (annotated, local) on `92b8105` |
| Manifest | 0.6.1 |
| Sideload ZIP | `dist/releases/protv-roku-v0.6.1-tv-verified.zip` (read-only) |
| SHA-256 | `d2975203d75f2398744526ddcd98b00e774d30c64f08b52bd1644b87d24f1229` |
| Needs backend | `/api/auth/tv/*` (PR #11) and the progress fix (PR #12), both in production |

## roku-v0.5.6-tv-verified (2026-10-23)

Owner-verified on a physical Roku TV. All seven tests passed:

1. Playback controls (progress bar, time, Pause/Resume, thumbnail) disappear on exit.
2. Continue Watching syncs with the website.
3. Resume starts at the saved position.
4. Sign-in persists after an app restart.
5. My List syncs with the website.
6. Episodes play.
7. Remote playback controls work (OK, Play/Pause, seeking, Back).

| Item | Value |
| --- | --- |
| Git tag | `roku-v0.5.6-tv-verified` (annotated, local) |
| Commit | `c19ebea` (runtime files identical to the build commit `644ac48`) |
| Branch | `feature/issue-7-roku-phase-1` (not pushed, not merged) |
| Manifest | 0.5.6 |
| Sideload ZIP | `dist/releases/protv-roku-v0.5.6-tv-verified.zip` (read-only) |
| SHA-256 | `78805d67b6bcbb9694ea9355792a2651350e7850c917cf6299ce47545920763c` |

`protv-roku-v0.5.6-candidate.zip` is the same file (same SHA-256), kept
read-only. Roll back with the same steps as below, using this ZIP or the
v0.5.5 one. Not certified or submitted to Roku.

## roku-v0.5.5-working (2026-10-23)

Owner-verified on a physical Roku TV: account activation, login, movie
playback, OK pause/resume and the PROtv playback overlay work. Saved sign-in
after a restart was not reported and remains unverified.

| Item | Value |
| --- | --- |
| Git tag | `roku-v0.5.5-working` (annotated, local) |
| Commit | `c86eea1fc8d3f6cb70ec0b78b9bceb916f126ca9` |
| Branch | `feature/issue-7-roku-phase-1` (not pushed, not merged) |
| Manifest | 0.5.5 |
| Sideload ZIP | `dist/releases/protv-roku-v0.5.5-working.zip` (read-only) |
| SHA-256 | `8e5cb5fba0548a103658f84ca9f79dd6ca3a205f98eee321eb233c633db61331` |

This build still contains the temporary sign-in diagnostics (console
`PROtv AUTH` lines and the "diagnostic" label on the Account screen). They log
shapes and lengths only, never token values.

`dist/` is not in Git. If the ZIP copy is lost, rebuild it from the tag (the
packager injects the public Firebase web key from `frontend/.env`):

```
git checkout roku-v0.5.5-working
cd tv/roku
npm ci
npm run build
```

The rebuilt ZIP should match the SHA-256 above, given the same `frontend/.env`
key. If it does not, compare the key first.

### Roll back the TV

1. Open `http://<Roku IP>` on a computer on the same network and sign in as
   `rokudev`.
2. Upload `dist/releases/protv-roku-v0.5.5-working.zip` and choose Replace or
   Install.
3. Check that the Account screen footer reads `PROtv Roku 0.5.5`.

A saved sign-in and guest progress live in the app's registry section and
survive a reinstall of the same developer app.

### Roll back the code

- Inspect: `git checkout roku-v0.5.5-working` (detached), then
  `git switch -` to return.
- Discard later local Roku commits on the branch:
  `git reset --hard roku-v0.5.5-working`. This deletes those commits from the
  branch, so tag or branch anything worth keeping first.
- Undo one later commit but keep history: `git revert <commit>`.
