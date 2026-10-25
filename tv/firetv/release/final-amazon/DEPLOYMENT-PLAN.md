# Production changes for the Fire TV launch (awaiting owner authorization)

2026-10-25. Nothing below has been applied. Each change is reversible.

## Change 1: Fire TV-only launch eligibility (backend)

| Item | Detail |
|---|---|
| Branch | `feature/firetv-only-eligibility`, head `39d981d`, based on `origin/main` `9b17039` (includes account deletion) |
| Net diff vs main | `backend/src/catalog/platformEligibility.js` (new, 28-title Fire TV list), `backend/src/catalog/router.js` (filter applied in the single catalog loader; `Vary: X-PROtv-Platform`), `backend/test/firetvEligibility.test.js` (new) |
| Who is filtered | Only requests with `X-PROtv-Platform: firetv` (Fire TV 1.0.0 code 6+): browse, search, title, playback, series, podcasts |
| Unchanged | Roku (no Roku filter; Roku User-Agent and `roku` header return the full catalog), website, Android, Fire TV builds before code 6, sitemap, all data |
| Tests | 273/275; the same 2 tests fail on `origin/main` (271 tests, 269 pass) because they need a built frontend |
| Merge | Squash (the branch history has an intermediate Roku-filter commit that the final commit removes). PR: https://github.com/mbarfield7824-dot/protv/pull/new/feature/firetv-only-eligibility |
| Verify after deploy | `curl -H "X-PROtv-Platform: firetv" https://watchprotv.com/api/v1/catalog?view=all` returns 28 items; without the header, and with `-A "Roku/DVP-14.0 (x)"`, it returns 49; `/titles/IHkqDr5bGIY0Nw5Lhkky/playback` is 404 with the header and 200 without. On the Firestick, code 6 shows 28 titles |
| Rollback | Redeploy `9b17039` |

Client-identification limits: the header is self-declared. It controls what the Fire TV app shows; it is not access control, so any client can omit it and see the full public catalog, as today. Fire TV sideloads older than code 6 send no header. The legacy `/api/videos/:id` routes are outside the catalog router; the Fire TV app never calls them.

## Change 2: approved replacement media and posters (Roku remediation Batch 2)

Script: `tv/roku/store/remediation/apply-remediation.cjs` on `release/roku-1.0-rc9` (`check` → `stage` → `apply` → `verify`; `rollback`). It uses `D:\protv\backend\.env` and never prints secrets.

| Record ID | Title | Change | New verified source (full checksum) |
|---|---|---|---|
| `IHkqDr5bGIY0Nw5Lhkky` | Detour (1945) | `muxAssetId`, `muxPlaybackId`, `duration` 4145 → 4058 | archive.org `Detour/Detour.MPEG`, SHA-1 `6ab29d86e7fbb2b6f28361c045ffd8c8d14836ed`, 1,783,015,424 B |
| `WIVB9NPQQzvtvjTBsiKw` | Carnival of Souls (1962) | same fields, 4694 → 4664 | `CarnivalOfSouls720p1962/CarnivalOfSouls720p.mp4`, SHA-1 `814775ffaaf080379e65666628b84aa41212afd6`, 512,082,539 B |
| `zGpbFWvSaup6ioUaoqsN` | Night of the Living Dead (1968) | same fields, 5753 → 5742 | `Night_Of_The_Living_Dead_raw_HD_WS/NightOfTheLivingDeadWSInternationalPrint.mp4`, SHA-1 `ab7a006c34a7a2f6e62c05b10f7ce44d3470fc06`, 817,380,054 B |
| `tuwoR1lZN8VnSTCSEiTc` | The Scar of Shame (1927) | same fields, duration unchanged | `the-scar-of-shame_1927/the-scar-of-shame_1927.mp4`, SHA-1 `5e4c4da4d4852be5417c596040803bf2a8ea2690`, 6,235,413,237 B |
| `WeNPJRItOH2nOdbwLkDG` | The Phantom of the Opera (1925) | same fields, 6389 → 6416 | `ThePhantomOfTheOpera_201612/The Phantom of the Opera.mp4`, SHA-1 `521bb6c1be15e0948dc79c4cbfbb313aba0b8a28`, 1,093,984,342 B |
| `hFVcdczhgn8dT3cZcXAR` | KIPHO | same fields, duration unchanged | local `KIPHO-silent.webm`, SHA-256 `b076e60d8f54f165c95b3405cc950d8300e875711d1d1bbd2b9878a42539106f` |
| `LiMNMZWXBxJj3LoP73kU` | His Girl Friday (1940) | `posterUrl`, `thumbnailUrl` | `his-girl-friday.jpg`, SHA-256 `d76f508f4442bdd88f5fe1a2fc484560efcd1da18fb6ddb9d3e2cd7113414d2b` |
| `1l1uGB4v8CaUr9p4TTGv` | The Duke Is Tops (1938) | `posterUrl`, `thumbnailUrl` | `the-duke-is-tops.jpg`, SHA-256 `b0a2ae5a0da319f0066fb91c949d5bd44844bc36be733c12bbbba3ee9eab83a4` (the manifest's short form `…e6c2` is a typo; the script pins this full value) |
| `MZ6Q6DI2S62pP8laH9Ku` | The Incredible Petrified World (1959) | `posterUrl` added, `thumbnailUrl` | `the-incredible-petrified-world.jpg`, SHA-256 `029ca5f9ce7e25e5959c383b21159b015e34720db9412a7a799949848378e6c2` |

Verified 2026-10-25:
- All 9 checksums: files hashed locally, and archive.org metadata SHA-1 and sizes match.
- The script's own `check` passed against the sources.
- The 9 live records still carry exactly the references recorded by the 2026-10-24 checkpoint.
- Dry run of the script's `check`/`apply`/`rollback` code on an in-memory copy of the 9 records: `apply` changed only those 9 records and only the listed fields; `rollback` restored all 9 exactly (including removing the added `posterUrl`); `apply` refused when a record changed after `check`.
- Old Mux assets and posters are never deleted.

**Effects outside Fire TV:** the records are shared, so the website and Roku also start playing the 6 replacement copies and showing the 3 new posters. Roku's app, package and Dashboard are untouched, but Roku reviewers would see these 9 titles change.

**Fire TV dependency:** the 6 media titles are not in the Fire TV launch list, so Fire TV does not need them to launch. The 3 posters are on Fire TV titles: His Girl Friday, The Duke Is Tops and The Incredible Petrified World.

Steps once authorized: `check` (read-only) → `stage --approved "<ref>"` (new Mux assets, about 7.5 h of basic-quality storage) → `apply --approved "<ref>"` → `verify`. Rollback: `rollback --approved "<ref>"`.
