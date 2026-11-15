# PROtv — App UI Description (content for Samsung's App UI Description template)

Samsung Seller Office requires this on Samsung's own template file; copy these sections into it.
Version 1.0.0, package `PROtvTizen`, application `PROtvTizen.PROtv`. Screens are 1920x1080.

## 1. Overview

PROtv is a free-to-watch video-on-demand app: original films from independent creators and open-licensed
movies. No purchases. An account is optional (guests can browse and watch); signing in only syncs My List
and Continue Watching with watchprotv.com.

## 2. Launch

Splash (PROtv logo, "Where the fire lives", spinner) → Home, usually within 3–5 seconds. If the catalog
cannot load: "We can't reach PROtv right now" with **Try again** focused.

## 3. Screen map

| Screen | Reached from | Contents |
| --- | --- | --- |
| Home | Launch; rail **Home** | Featured spotlight (Play / Resume, More Info, My List); rows: Continue Watching (when there is progress), From PROtv Creators, genre rows |
| Search | Rail **Search** | On-screen A–Z / 0–9 keyboard, Space, Delete, Clear; results update as you type; "No results for …" state |
| Movies | Rail **Movies** | Grid of all movies |
| Series | Rail **Series** | Series grid, seasons and episodes (shows "Nothing here yet" when no series is available) |
| Categories | Rail **Categories** | Genre and collection tiles → filtered grid |
| My List | Rail **My List** | Saved titles (signed in) or a sign-in prompt (guest) |
| Account | Rail **Account** | Sign in with phone or computer / Sign out, Clear history on this TV, privacy policy, terms, help |
| Details | OK on any title | Poster, synopsis, rights credit, Play / Resume / Start Over, My List |
| Player | Play / Resume | Full-screen video; controls: timeline, Back 10s, Play/Pause, Forward 10s, Start Over, Next Episode (series) |

## 4. Remote control

| Key | Behaviour |
| --- | --- |
| Arrows | Move focus (always visible: white/blue ring). Left from content opens the rail; Right returns to the same card. Up/Down at the ends of the rail stay in the rail |
| OK / Enter | Select. In the player, toggles play/pause on the timeline or activates the focused button |
| Return (Back) | One level back: Player → previous screen; Details → the same card; row → hero; Home → "Exit PROtv?" dialog (Cancel focused) |
| Play, Pause, Play/Pause | Player control (registered media keys) |
| Fast-forward / Rewind | ±30 seconds |
| Left / Right in the player | ±10 seconds; repeated presses accumulate into one seek |
| Stop | Leaves the player and saves progress |
| Exit / Home | Handled by the TV; playback is paused and progress saved, and resumes on return |

## 5. Playback

Samsung AVPlay, HLS from Mux. Resume position is offered on Details. Network errors show "Reconnecting…"
and resume at the same point (up to three attempts). The screen saver is disabled during playback only.
End of a title shows "Thanks for watching" (or "Up next" for an episode).

## 6. Sign-in (for reviewers)

Account → **Sign in with phone or computer** → the TV shows a code → on a phone/computer open
https://watchprotv.com/activate, sign in with the reviewer account, enter the code. No password is typed
on the TV. Reviewer credentials: supplied by the owner in the "Test information" field (not in this file).

## 7. Data and privacy

Collected only when signed in: account identifier, My List, watch progress. Guest progress stays on the TV
(**Clear history on this TV**). Privacy policy: https://watchprotv.com/privacy (English).
No advertising and no purchases in 1.0.0.
