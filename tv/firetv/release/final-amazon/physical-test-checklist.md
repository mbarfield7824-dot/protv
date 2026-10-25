# Firestick test: PROtv 1.0.0 (code 4, signed release)

Device: Amazon Fire TV Stick (AFTMM). Build SHA-256 `e52fea8c…be0b9`.
Mark each item **PASS** or **FAIL** and note anything odd. Use the Firestick remote.

## Start

| # | Check | How | Result |
|---|---|---|---|
| 1 | App launches | Open PROtv from the Fire TV home screen | |
| 2 | Home and featured content | The hero shows a featured title with Play; rows load below | |
| 3 | Poster artwork | Scroll the rows; posters fill their cards without stretching | |

## Navigation

| # | Check | How | Result |
|---|---|---|---|
| 4 | Menu sections | Press Left to open the menu. You should see Home, Movies, TV, Continue Watching, My List, Search, Settings, and **no** Music, Podcasts or New Releases | |
| 5 | Category navigation | Open Movies, then TV; rows show matching titles | |
| 6 | Search | Open Search, type a word such as "night"; results appear and open | |
| 7 | Back button | Press Back from a section (returns Home), from the menu (closes it), and from Home (asks to exit; choose stay) | |

## Playback

| # | Check | How | Result |
|---|---|---|---|
| 8 | Video playback | Open a title and press Play; video starts | |
| 9 | Pause / resume | Press Select or Play/Pause; video pauses and resumes | |
| 10 | Fast-forward / rewind | Use the FF and RW buttons | |
| 11 | Back from player | Press Back; the player closes and you return to the same place | |

## Account

| # | Check | How | Result |
|---|---|---|---|
| 12 | Settings deletion info | Menu > Settings: a card shows "Delete your PROtv account", watchprotv.com/delete-account and a QR code (signed out) | |
| 13 | Sign-in | Settings > Sign in; scan the QR or visit watchprotv.com/activate and enter the code | |
| 14 | Account persistence | Unplug the Firestick for 10 seconds, reopen PROtv; you are still signed in | |
| 15 | My List | Add a title to My List; it appears under My List and on watchprotv.com | |
| 16 | Continue Watching / resume | Watch 2 minutes, go Back, reopen the title; it resumes near where you stopped | |
| 17 | Creator Portal QR | Settings > Manage account > Creator Portal shows creators.watchprotv.com with a QR; Back returns | |
| 18 | Account-deletion QR | Settings > Manage account > Delete account shows watchprotv.com/delete-account with a QR; Back returns | |
| 19 | Scan test | Scan the deletion QR with a phone; it opens the PROtv deletion page | |
| 20 | Sign out and in | Manage account > Sign out, then sign in again | |

## Catalog

| # | Check | How | Result |
|---|---|---|---|
| 21 | Catalog refresh | Settings > Refresh catalog; rows reload without errors | |
| 22 | New content visibility | (When a title is next published) it appears after Refresh without an app update | |
| 23 | Hidden empty sections | Same as #4: Music, Podcasts and New Releases are absent | |
