# Samsung emulator / TV test pass (emulator runs 2026-11-15 and 2026-11-16; physical TV not yet run)

Run with the **signed release** package against a backend that has the Samsung rule deployed (or the
signed preview package against today's production). Record model, firmware/Tizen version and result.

| # | Area | Steps | Expected |
| --- | --- | --- | --- |
| 1 | Launch | Cold start | Splash, then Home within ~5 s; no white flash |
| 2 | Remote | Arrows across hero, every row, rail, all screens | Visible focus always; no traps; rows remember position |
| 3 | Back | Back from player, details, series, search, rows, Home | Returns one level; Home shows "Exit PROtv?" (Cancel default) |
| 4 | Exit | Exit key and Exit in dialog | App closes; relaunch works |
| 5 | Catalog | Count titles | Only the 8 Samsung-cleared titles |
| 6 | Playback | Play each of the 8 titles | AVPlay starts within ~5 s, full screen, A/V in sync |
| 7 | Controls | OK, Play, Pause, Play/Pause, FF, RW, Left/Right, Stop | As documented in README; seek lands where shown |
| 8 | Buffering | Throttle network | Spinner, then recovery |
| 9 | Network loss | Unplug network mid-play, reconnect | "Reconnecting…", resumes at the same point |
| 10 | Suspend | Home button mid-play, return | Paused/restored at the same point; progress saved |
| 11 | Activation | Account > Sign in; approve on phone | Signs in; My List + Continue Watching load |
| 12 | Persistence | Power-cycle TV | Still signed in |
| 13 | My List | Add/remove; check watchprotv.com | Matches |
| 14 | Progress | Watch 1 min, Back, check website | Continue Watching matches on both |
| 15 | Search | On-screen keyboard; Samsung IME if any | Results update; no-results state |
| 16 | Errors | Airplane mode at launch | Offline banner + "Try again" recovers |
| 17 | Performance | Fast scrolling | No stutter; memory stable after 30 min |
| 18 | Screen saver | Long playback | Screen saver does not start during playback |

Known unverified on hardware: AVPlay seek accuracy on Mux HLS, `setDisplayMethod` on 2018 firmware,
media-key availability per remote, `webapis.appcommon` on older models.

## Results: Samsung TV emulator, 2026-11-15 (UTC)

Environment: Tizen Studio 6.1, emulator **tv-samsung-10.0** (Tizen 10.0, Chromium 130), WHPX on an AMD
Ryzen 5 5600X, host GL with offscreen rendering. Package: **localtest** flavor (release rules, isolated
loopback backend with the 8 Samsung-cleared records + 1 uncleared control record), **signed with the Samsung
certificate profile `PROtv`**, installed with `tizen install`. Evidence: inspector (CDP) reads of
`webapis.avplay` state plus window screenshots. Emulator only, not TV hardware.

| # | Result | Evidence |
| --- | --- | --- |
| 1 | **PASS** | Splash ~1 s after launch, Home ~3 s; frames stay dark (no white flash) |
| 2 | **PASS** (after fix) | Every rail item and screen reached; focus always visible. **Fixed:** Down from the last rail item jumped into content (9bed68d) |
| 3 | **PASS** | Player → Details → Home → "Exit PROtv?" with Cancel focused; Cancel returns to the hero |
| 4 | **PASS** | Exit closes the app; cold relaunch works; local Continue Watching survives |
| 5 | **PASS** | 8 titles on device; control title absent; its direct playback request returns 404 for Samsung |
| 6 | **PASS** (timing note) | All 8 play real video (AVPlay PLAYING, time advancing, duration reported). Start 3–8 s typical; one 56 s outlier from emulator networking |
| 7 | **PASS** (after fix) | Pause, Play, Play/Pause, FF +30, RW −30, Right/Left ±10 with accumulation, Start Over, Back. **Fixed:** seeking while paused showed "Pause" while AVPlay stayed paused (21c4b77). Seeks land on the nearest keyframe (≤ 3 s before target) |
| 8 | **PARTIAL** | Not throttled deliberately; natural emulator rebuffering showed the spinner and recovered |
| 9 | **PASS (observed)** | Real `PLAYER_ERROR_CONNECTION_FAILED` mid-play → "Reconnecting…" → re-authorized, resumed at the same position. Cable-pull not simulated |
| 10 | **PASS** (after fix) | Remote Home → AVPlay suspended at 78.7 s, progress saved; return → resumed there with "Pause" shown (21c4b77) |
| 11 | **NOT RUN** | Isolated backend has no device sessions (503); the app shows a clear error and "Get a new code". Needs production + reviewer account |
| 12 | **NOT RUN** | Depends on 11 |
| 13 | **NOT RUN** | Guest My List asks to sign in (correct); sync depends on 11 |
| 14 | **PARTIAL** | Local progress saved/resumed (Resume 1:28; 100 % at end; Continue Watching row); website sync depends on 11 |
| 15 | **PASS** | On-screen keyboard "bun" → Big Buck Bunny; "bunzz" → "No results…". Samsung IME not used by design |
| 16 | **PASS (backend-down variant)** | Backend stopped at launch → "We can't reach PROtv right now" after the 15 s timeout; Try again recovers. TV airplane mode not simulated |
| 17 | **PASS** | JS heap 9.5 MB flat across 320 key presses, 5 play/stop cycles and a ~37 min playback soak; Home DOM stable; 0.45 ms per key |
| 18 | **PASS** | `setScreenSaver(OFF)` at play start, `ON` when leaving the player |

Audio: Windows output peak meter 0.13 while playing, exactly 0 while paused, so the sound comes from AVPlay.

Still required: steps 11–14 against production with a reviewer account, and at least one physical Samsung TV
(ideally a 2018–2020 model for the Chromium 56–69 floor).

## Results: account and sync against production, Samsung TV emulator, 2026-11-16

Package: **release** flavor (production API), signed with profile `PROtv` (rc2, commit `43d3ce3`), on the same
emulator. Production had the Samsung rule live (`dpl_6oC21Wk7WsQZELruyGjaTQTBSe2y`). Reviewer account
`support+samsung-review-1@watchprotv.com` was created through the website's own sign-up form. Website actions
ran in a separate headless browser with every ad host blocked, so no ad impressions were made.

| # | Result | Evidence |
| --- | --- | --- |
| 11 | **PASS** | Account > Sign in showed code S9TR-2GTB; approved at watchprotv.com/activate ("Your TV is connected"); TV showed "Signed in as …" and returned Home |
| 12 | **PASS** | Still signed in after an app update reinstall, after an app relaunch, and after a hard power cut (emulator process killed, cold boot); My List and Continue Watching reloaded from the account |
| 13 | **PASS** (after fix) | TV add → account `/users/me/favorites` updated; TV remove → updated. Website add (Sintel, Big Buck Bunny) and remove (Tears of Steel) appeared on the TV **without relaunching** (fix `43d3ce3`) |
| 14 | **PASS** | ~66 s of Big Buck Bunny on TV (AVPlay PLAYING, audio peak 0.02) → account progress 66/596 s; website Continue Watching "9 min left"; progress set through the website's progress API (Sintel 3:20) → TV Continue Watching first card, "Resume 3:20" |
| — | **PASS** | Sign out: confirmation (Cancel focused) → guest; stored session removed; My List asks to sign in; account data kept on the server |

Defects found and fixed in this run (local commits, retested on the emulator against production):
- `c7b0f8e`: the spotlight kept rotating while its buttons were focused, so Right, Right, OK added the next title.
  It now holds while the remote is in use, and OK within 1.2 s of a rotation acts on the title that was showing.
- `43d3ce3`: changes made on the website reached the TV only after a relaunch or Sync now. The app now refreshes
  (at most every 30 s) on return to the foreground and when Home or My List opens. Unsent local progress is kept.
