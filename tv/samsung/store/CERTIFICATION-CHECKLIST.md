# Samsung emulator / TV test pass (not yet run)

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
