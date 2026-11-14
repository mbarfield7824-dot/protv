# PROtv for Samsung Smart TV (Tizen)

Tizen web application for Samsung TVs, 2018 models onward (**Tizen 4.0+**, Chromium 56). Plain
ES2017 JavaScript, no framework and no runtime dependencies, so the package is small and runs on
older TVs. Branch: `feature/samsung-tizen` (isolated worktree `D:\protv-samsung`).

## Status at a glance

| | |
| --- | --- |
| App | Feature-complete for v1.0.0; tested in unit tests and a headless-Chromium browser preview |
| Package | `dist/PROtv-1.0.0-release-unsigned.wgt` builds reproducibly (same SHA-256 every build) |
| Tizen Studio | 6.1 at `D:\tizen-studio` (TV Extensions 10.0, Samsung Certificate Extension 2.0.75, TV emulator 10.0), installed 2026-11-14 |
| Signed | **Emulator-only.** `dist/signed/*-tizen-emulator-signed.wgt`, signed by the official `tizen package` CLI with a Tizen author certificate + Tizen distributor (key and password in `%USERPROFILE%\PROtv-signing`, outside Git). **Samsung** author/distributor certificates (Samsung account sign-in in Certificate Manager) are still required for a physical TV and Seller Office |
| Emulator | **Not run.** The TV emulator refuses to start: "Your system cannot support HW virtualization". This PC is AMD (Intel HAXM unsupported) and Windows Hypervisor Platform is off (`check-whpx` exit 2) |
| TV | Not run |
| Backend | Samsung rights rule in `backend/src/catalog/platformEligibility.js`, **not deployed** |
| Store | Listing drafted in `store/LISTING.md`; nothing submitted |

Until the backend rule is deployed, the **release** app shows "PROtv is almost here" and no titles
(fail closed). The **preview** build also accepts today's production API by intersecting with the same
allowlist the backend uses; it is for testing only.

## What it reuses

| From | Reused as |
| --- | --- |
| Shared catalog API (`/v1/catalog`, `/titles/:id/playback`) | Catalog, search data, playback authorization; `X-PROtv-Platform: samsung` |
| Roku model (`tv/roku/source/model.brs`) | Catalog rules: rights-note stripping, HTTPS artwork, held artwork, creators first, series/season grouping, search semantics |
| Fire TV device activation (`/auth/device-sessions`) | Sign-in on a phone or computer at watchprotv.com/activate; no password typed on the TV |
| Roku Firebase REST session | Custom token -> Firebase ID/refresh token, refresh before account calls, 4xx = sign out |
| `/users/me/favorites`, `/users/me/progress` | My List and Continue Watching, same 95% / 20-second rules as Roku and Fire TV |
| Rights investigations (Roku, Fire TV, iOS) | Samsung allowlist — see `docs/samsung-rights-2026-11-14.md` |
| PROtv blue brand and wordmark | Palette, focus treatment, icon |

## Layout

```
app/            the widget (packaged as-is)
  config.xml    Tizen manifest: package PROtvTizen, app PROtvTizen.PROtv, tv-samsung profile
  index.html    shell; loads $WEBAPIS/webapis/webapis.js for AVPlay on TVs
  js/catalog.js progress.js account.js focus.js player.js   pure modules (unit tested in Node)
  js/http.js keys.js app.js                                  transport, remote keys, UI controller
tests/          Node unit tests + fixtures (production records, test-only)
tools/          validate, build (.wgt), serve, e2e (CDP), icon rendering
store/          icon, screenshots, listing, certification checklist
```

## Commands (Node 22+)

```powershell
cd D:\protv-samsung\tv\samsung
npm ci
npm test                                   # 36 unit tests
node tools/validate.mjs                    # config.xml / ES2017 / CSS / secrets checks
node tools/build.mjs --env-file D:\protv\frontend\.env            # release .wgt (unsigned)
node tools/build.mjs --preview --env-file D:\protv\frontend\.env  # preview .wgt (unsigned)
node tools/build.mjs --test-api http://10.0.2.2:5055/api --env-file D:\protv\frontend\.env
                                           # "localtest" .wgt: release rules against an isolated
                                           # loopback test backend (emulator host = 10.0.2.2); never submit
node tools/e2e.mjs                         # 19 remote-key scenarios, fixture backend
node tools/e2e.mjs --live                  # read-only production GETs + store screenshots
node tools/serve.mjs                       # http://127.0.0.1:8790 (arrows, Enter, Esc = Back)
```

`--env-file` reads only `VITE_FIREBASE_API_KEY`, the website's **public** Firebase web client key
(not a privileged credential). It is injected into the package, never into source, and never printed.
Without it, the build is guest-only.

## Remote control

| Key | Behaviour |
| --- | --- |
| Arrows | Spatial focus; Left/Right step card by card in rows; rows remember their position |
| Left from content | Opens the rail; Right returns to the same card. Up/Down never fall into the rail |
| OK | Select. In the player: play/pause (on the timeline) or the focused control |
| Back | Player -> screen you came from; details -> same card; row -> hero; Home -> "Exit PROtv?" (Cancel default) |
| Play / Pause / Play-Pause | Registered via `tizen.tvinputdevice`; work in the player and on cards |
| FF / RW | ±30 s; Left/Right in the player ±10 s, repeated presses accumulate into one seek |
| Stop | Leaves the player and saves progress |
| Exit | Handled by the TV (app closes) |

## Playback

- **AVPlay** (`webapis.avplay`) is the TV path for Mux HLS: `open` -> `setDisplayRect(0,0,1920,1080)` ->
  `prepareAsync` -> `seekTo(resume)` -> `play`. HTML5 `<video>` is used only when AVPlay is absent (browser).
- Every play re-authorizes through the Samsung-filtered playback endpoint; signed creator media gets a
  short-lived token. Stalls, network loss and expired tokens re-authorize and resume at the last position
  (3 attempts with backoff, waiting while offline); unsupported media and withdrawn titles stop with a message.
- App hidden (Home button / multitasking) -> `avplay.suspend()` + progress flush; visible -> `restore()`.
- Screen saver is turned off during playback (`webapis.appcommon`).

## Signing and installing (needs Tizen Studio — not done yet)

1. Install Tizen Studio 6.1 CLI (official installer, `download.tizen.org/sdk/Installer/tizen-studio_6.1/`),
   then Package Manager -> **TV Extensions** (TV-SAMSUNG) and **Samsung Certificate Extension**.
2. Certificate Manager -> new **Samsung** certificate profile (TV). This is where the Samsung account
   sign-in happens. For a physical TV, add the TV's **DUID** to the distributor certificate.
   Keep the `.p12` files and passwords **outside the repo** (they are git-ignored here as a backstop).
3. Package and sign the built widget (build first):
   `tizen package -t wgt -s <profile> -- D:\protv-samsung\tv\samsung\build\release`
4. Emulator: Emulator Manager -> TV image -> launch -> `sdb connect` -> `tizen install -n PROtv.wgt -t <emulator>`
   -> `tizen run -p PROtvTizen.PROtv -t <emulator>`.
5. TV: Apps -> type `12345` -> Developer mode ON, host PC IP -> restart TV -> `sdb connect <tv-ip>` ->
   `tizen install` / `tizen run` as above. Use `store/CERTIFICATION-CHECKLIST.md` for the pass.

## Backend change (compatible, not deployed)

`samsung` joins the device platforms. Only Samsung requests get the new `platformPolicy` field; every
other client's responses are unchanged (tested). Deploying is the owner's call, with the normal website
release; rollback is the previous Vercel deployment. The iOS branch edits the same file, so merge with care.
