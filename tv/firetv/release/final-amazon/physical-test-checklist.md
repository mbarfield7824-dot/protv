# Firestick test: PROtv 1.0.0 (code 6, signed release)

Device: owner's Amazon Fire TV Stick (AFTMM "mantis", serial G070VM2213661NEC), Fire OS 6.7.1.1 (API 25).
Build SHA-256 `4f3ef48a…e6dd` (code 6; #1–#12 and #21–#23 were run on codes 4/5). Run on 2026-10-25.

How it was run: remote keys (D-pad, Select, Back, Play/Pause, FF, RW) were sent over ADB as the same key codes the remote sends; each result was checked from a screenshot, the focused-element dump and logcat. Evidence is in `D:\protv-firetv-artifacts\firestick-screenshots\` and `firestick-records\`. Items that need a person (signing in on a phone, scanning a QR, unplugging the stick) are marked **OWNER**.

## Start

| # | Check | How | Result |
|---|---|---|---|
| 1 | App launches | Open PROtv from the Fire TV home screen | **PASS**: cold launch 1.3 s (code 4), 1.4 s (code 5) |
| 2 | Home and featured content | The hero shows a featured title with Play; rows load below | **PASS** |
| 3 | Poster artwork | Scroll the rows; posters fill their cards without stretching | **PASS** |

## Navigation

| # | Check | How | Result |
|---|---|---|---|
| 4 | Menu sections | Press Left to open the menu. You should see Home, Movies, TV, Continue Watching, My List, Search, Settings, and **no** Music, Podcasts or New Releases | **PASS** |
| 5 | Category navigation | Open Movies, then TV; rows show matching titles | **FAIL on code 4, PASS on code 5.** Code 4 crashed choosing TV from the menu while a Movies row had focus. Fixed in code 5; every menu switch re-tested, including from deep rows and empty pages |
| 6 | Search | Open Search, type a word such as "night"; results appear and open | **PASS**: 4 results; Select starts playback |
| 7 | Back button | Press Back from a section (returns Home), from the menu (closes it), and from Home (asks to exit; choose stay) | **PASS**: Settings, Search and player all return; "Exit PROtv?" with Stay focused |

## Playback

| # | Check | How | Result |
|---|---|---|---|
| 8 | Video playback | Open a title and press Play; video starts | **PASS**: The Little Shop of Horrors (hero), Night of the Living Dead (search) |
| 9 | Pause / resume | Press Select or Play/Pause; video pauses and resumes | **PASS**: paused frames identical, resumed frames change |
| 10 | Fast-forward / rewind | Use the FF and RW buttons | **PASS**: FF +15 s per press (0:50 → 1:20), RW −5 s (1:20 → 1:15) |
| 11 | Back from player | Press Back; the player closes and you return to the same place | **PASS** |

## Account

| # | Check | How | Result |
|---|---|---|---|
| 12 | Settings deletion info | Menu > Settings: a card shows "Delete your PROtv account", watchprotv.com/delete-account and a QR code (signed out) | **PASS**; code 5 also opens Settings with Sign in focused (code 4 opened with nothing focused) |
| 13 | Sign-in | Settings > Sign in; scan the QR or visit watchprotv.com/activate and enter the code | **PASS**: activation screen (code, link, QR, expiry, Cancel); the owner approved a code and the TV signed in |
| 14 | Account persistence | Unplug the Firestick for 10 seconds, reopen PROtv; you are still signed in | Partial: the sign-in survived the code 5 → 6 update and app restarts. Unplug test: **OWNER** |
| 15 | My List | Add a title to My List; it appears under My List and on watchprotv.com | **PASS on the TV**: "Add to My List" in the player, the title appears under My List next to one added earlier from the account. Website check: **OWNER** (optional) |
| 16 | Continue Watching / resume | Watch 2 minutes, go Back, reopen the title; it resumes near where you stopped | **PASS**: The Amazing Mr. X from Continue Watching ("1h 17m left") resumed at 1:40 |
| 17 | Creator Portal QR | Settings > Manage account > Creator Portal shows creators.watchprotv.com with a QR; Back returns | **PASS** |
| 18 | Account-deletion QR | Settings > Manage account > Delete account shows watchprotv.com/delete-account with a QR; Back returns | **PASS on code 6.** Code 5 clipped the Delete account label (squeezed off the panel at 1080p); fixed in code 6 |
| 19 | Scan test | Scan the deletion QR with a phone; it opens the PROtv deletion page | **OWNER** |
| 20 | Sign out and in | Manage account > Sign out, then sign in again | Sign out **PASS** (code 6: returns to Settings with Sign in, no account shown). Sign in again: **OWNER** |

## Catalog

| # | Check | How | Result |
|---|---|---|---|
| 21 | Catalog refresh | Settings > Refresh catalog; rows reload without errors | **PASS** (code 4 and code 5) |
| 22 | New content visibility | (When a title is next published) it appears after Refresh without an app update | Not run: no new title published during the test |
| 23 | Hidden empty sections | Same as #4: Music, Podcasts and New Releases are absent | **PASS** |

## Creative Commons attribution (code 6)

| Check | Result |
|---|---|
| Big Buck Bunny shows "© Blender Foundation · CC BY 3.0 · creativecommons.org/licenses/by/3.0" as playback starts, clears after 8 s, and returns with the controls | **PASS** |
| Public-domain titles show no credit line | **PASS** (The Amazing Mr. X) |

## Not covered

- Fire OS 16 / API 36 behaviour (including the Back-key opt-out on API 36): **not tested**. This Firestick runs Fire OS 6 (API 25), and this PC cannot run the emulator.
- Fire OS 7 and 8 devices: not tested.
