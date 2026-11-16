# Samsung Smart TV — release readiness and approval request (2026-11-15)

Status: **NO-GO for store submission today.** The app works on the Samsung TV 10 emulator, including real
AVPlay video and audio, but three gates remain. Each needs the owner: deploying the backend Samsung rule,
sign-in/sync testing against production, and a physical TV pass. Nothing has been deployed, pushed, merged
to the production line or submitted.

## Branches and artifacts

| Item | Value |
| --- | --- |
| App branch | `feature/samsung-tizen` @ `150c0e5` (worktree `D:\protv-samsung`), local only |
| Fixes this pass | `21c4b77` player paused-seek / suspend phase; `9bed68d` rail edge focus; `359f298` store assets; `150c0e5` results |
| iOS integration | `integration/samsung-ios` @ `4d81ce8` (worktree `D:\protv-samsung-ios-integration`), local only |
| Release candidate | `tv\samsung\dist\release-candidate-1.0.0-rc1-NOT-APPROVED\PROtv-1.0.0-release-samsung-signed-rc1.wgt` (+ `.sha256`), production API, signed with profile `PROtv` |
| Earlier builds kept | `tv\samsung\dist\signed\*` (Tizen-signed, rejected by the TV 10 emulator), `tv\samsung\dist\*-unsigned.wgt` |
| Test record | `tv/samsung/store/CERTIFICATION-CHECKLIST.md` (emulator results) |

## Approval 1 — deploy the backend Samsung rule (requested, not done)

**Exact change** (`feature/protv-live...feature/samsung-tizen`, backend only): `backend/src/catalog/platformEligibility.js`
(+45: Samsung allowlist of 8 titles with 2028 cutoffs for 4 signed titles, `samsungHold`, `platformPolicy()`),
`backend/src/catalog/router.js` (±15: Samsung responses carry `platformPolicy: "samsung-rights-v1"`),
`backend/test/samsungEligibility.test.js` (+109).

**Affected systems:** only requests with `X-PROtv-Platform: samsung` (59 → 8 titles; other IDs 404 for playback).
Website, Android, Roku (35), Fire TV (28), PROtv LIVE, Creator/Admin portals, contracts, sponsorships,
analytics, sitemap: code paths unchanged (see `docs/samsung-backend-impact-review-2026-11-14.md`).

**Tests:** backend 471/471 on `feature/samsung-tizen` with the website built (the earlier 469/471 were two tests
that need `frontend/dist`, not defects); 476/476 on the iOS integration branch; Samsung app 38/38 unit,
20/20 remote-key e2e, `validate` 0 errors; live production read-only today: web 59, Roku 35, Fire TV 28,
all 8 Samsung titles present.

**Merge state:** `feature/samsung-tizen` and `integration/samsung-ios` both merge cleanly into
`feature/protv-live` (`d1d62b6`). If iOS ships first or together, deploy from `integration/samsung-ios`.

**Risks:** low; stateless; responses are `no-store` and `Vary: X-PROtv-Platform`. Rights: counsel to confirm
"app" in the Double Date agreement covers smart-TV apps (title can be withdrawn with `samsungHold`).

**Rollback:** record the current production deployment ID before promoting; rollback = promote it again
(no data migration).

## Approval 2 — Seller Office submission (after 1, 3, 4)

Prepared: name PROtv (matches `config.xml`), description, category Video, 512x423 + 1920x1080 icons,
1920x1080 background, 5 screenshots (1920x1080 JPEG < 500 KB), App UI Description content
(`tv/samsung/store/APP-UI-DESCRIPTION.md`), listing (`tv/samsung/store/LISTING.md`). Wording: free to watch at
launch; no claim of being ad-free.

## Gates still open

3. **Account flow on production:** device activation, persistence, My List and progress sync (checklist 11–14).
   The isolated backend has no device sessions by design.
4. **Physical TV:** none registered (certificate lists only the emulator DUID). The minimum is Tizen 4.0
   (2018, Chromium 56). Only Tizen 10 / Chromium 130 was tested; the code is checked for ES2017 and the CSS
   avoids Chromium 56 gaps, but AVPlay seek accuracy, `setDisplayMethod`, media keys and `appcommon` on older
   firmware need hardware.

## Compatibility

Supported target declared: Tizen 4.0+ (2018–2026 models). Samsung model-year mapping: 2018 Tizen 4.0/M56 …
2026 Tizen 10.0/M130 (Samsung Web Engine Specifications). Privileges: `internet`, `tv.inputdevice` only
(no partner-level APIs, no Samsung Checkout).

## Emulator notes (development machine only)

The emulator needs WHPX (`em-cli modify -w yes`), host GL on, and `rendering=offscreen` in `vm_launch.conf`.
Onscreen rendering crashes the AMD OpenGL driver (`atio6axx.dll`) once the app draws. This doesn't affect TVs.
