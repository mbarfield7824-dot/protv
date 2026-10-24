# Production change manifest (awaiting owner approval)

2026-10-24. **Nothing below has been applied.** Approve the batches in
OWNER-APPROVALS.md; each one is reversible. Evidence for every row is in
ROKU-LAUNCH-CATALOG.md.

## Batch 1 — Roku launch eligibility (backend deploy)

| Item | Detail |
| --- | --- |
| Change | Deploy branch `feature/roku-launch-eligibility` (`58d0f28`): the catalog router serves Roku clients only the 28 Group A titles. Roku is detected by `User-Agent: Roku/DVP-…` or `X-PROtv-Platform: roku` |
| Effect on Roku | Browse, search, title, playback and series show the 28 titles; held titles return 404 (deep links cannot reach them) |
| Effect elsewhere | None: website, Fire TV and Android receive the unchanged catalog (tested). Responses gain `Vary: User-Agent, X-PROtv-Platform` |
| Data changes | None |
| Tests | 4 new tests pass; full backend suite 263 pass, 2 pre-existing failures that also fail on `origin/main` (they need a built frontend) |
| Verify after deploy | `curl -A "Roku/DVP-14.0 (x)" https://watchprotv.com/api/v1/catalog?view=all` returns 28 items; without the header it returns 49. On the TV, RC5 shows 28 titles and the Series menu is hidden |
| Rollback | Redeploy the previous backend commit (`b123f03`) |

## Batch 2 — media replacements and poster fixes

Applied with `tv/roku/store/remediation/apply-remediation.cjs` (`check` passed
2026-10-24; `stage`, `apply` and `rollback` refuse to run without
`--approved`). `stage` creates new Mux assets (public, basic quality,
`passthrough: rights-remediation:<id>`) and immutable poster objects, and
changes no catalog record. `apply` updates only the listed fields, in one
transaction, and refuses if any record changed since `check`.

| Title | Old source | New verified source | Evidence | Mux change | Metadata change | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| Detour (1945) | 2018 Academy Film Archive restoration (YTS Blu-ray rip), 4145 s | archive.org `Detour/Detour.MPEG`, original PRC print (2007 upload), 1,783,015,424 bytes, SHA-1 `6ab29d86e7fbb2b6f28361c045ffd8c8d14836ed`, 4058 s | Opening shows "COPYRIGHT MCMXLV BY PRC PICTURES"; no restoration card; film and source novel not renewed | New asset; old asset kept | `muxAssetId`, `muxPlaybackId`, `duration` 4145 → 4058 | `rollback` restores prior IDs and duration |
| Carnival of Souls (1962) | Criterion/Janus release (Blu-ray rip) | archive.org `CarnivalOfSouls720p1962/CarnivalOfSouls720p.mp4` (2012), 512,082,539 bytes, SHA-1 `814775ffaaf080379e65666628b84aa41212afd6`, 4664 s | Herts-Lion theatrical titles; no Criterion/Janus logos; theatrical length (the 1996 director's cut is not used); no USCO renewal | New asset | as above; 4694 → 4664 | as above |
| Night of the Living Dead (1968) | Clean HD transfer of uncertain provenance | archive.org `Night_Of_The_Living_Dead_raw_HD_WS/…WSInternationalPrint.mp4` (2013, before the 2017 restoration), 817,380,054 bytes, SHA-1 `ab7a006c34a7a2f6e62c05b10f7ce44d3470fc06`, 5742 s | Original credits; uploaded before the 2017 restoration existed | New asset | as above; 5753 → 5742 | as above |
| The Scar of Shame (1927) | LoC presentation with Makia Matsumura's score | archive.org `the-scar-of-shame_1927/the-scar-of-shame_1927.mp4` (no audio track), 6,235,413,237 bytes, SHA-1 `5e4c4da4d4852be5417c596040803bf2a8ea2690`, 5195 s | Same LoC presentation; ffprobe shows no audio stream | New asset | as above; duration unchanged | as above |
| The Phantom of the Opera (1925) | Unknown source, unidentified score | archive.org `ThePhantomOfTheOpera_201612/The Phantom of the Opera.mp4`, 1,093,984,342 bytes, SHA-1 `521bb6c1be15e0948dc79c4cbfbb313aba0b8a28`, 6416 s | Universal titles, no restoration marks; audio measured silent (−91 dB) | New asset | as above; 6389 → 6416 | as above |
| KIPHO (1925) | Deutsche Kinemathek release with unidentified music | `KIPHO-silent.webm` (staged locally; audio removed, video bytes copied unchanged), SHA-256 `b076e60d8f54f165c95b3405cc950d8300e875711d1d1bbd2b9878a42539106f` | Source verified against Commons SHA-1 `e6bece9b…2274`; Kinemathek logo kept as provenance | New asset (direct upload) | as above; duration unchanged | as above |
| His Girl Friday (1940) | Painted poster depicting Cary Grant and Rosalind Russell | `posters/his-girl-friday.jpg` 900x1350, SHA-256 `d76f508f…14d2b`: original PROtv illustration (typewriter and newspaper), no people | Vector source in the repo; no embedded images | — | `posterUrl`, `thumbnailUrl` | `rollback` restores prior URLs; files kept |
| The Duke Is Tops (1938) | Realistic performer portrait | `posters/the-duke-is-tops.jpg`, SHA-256 `b0a2ae5a…e6c2`: original illustration (microphone and piano) | as above | — | as above | as above |
| The Incredible Petrified World (1959) | Google Images thumbnail (hotlinked) | `posters/the-incredible-petrified-world.jpg`, SHA-256 `029ca5f9…78e6c2`: original illustration (diving bell in a crystal cavern) | as above | — | `posterUrl` (added), `thumbnailUrl` | rollback deletes the added `posterUrl` and restores `thumbnailUrl` |

**Watch progress and My List are keyed by title ID, so they are kept.**
Where a replacement's runtime differs (Detour −87 s, Carnival −30 s, Night of
the Living Dead −11 s, Phantom +27 s), saved resume positions land a little
early or late. No action is needed.

**Costs:** new assets use the existing Mux account (basic quality). That adds
storage for about 7.5 hours of video until the old assets are deleted, which
is a separate, later decision. No new paid service.

**After apply:** run `verify`, then add the six titles to the Roku allowlist
(a one-line-per-title backend change) and redeploy Batch 1.

## Batch 3 — Tears of Steel captions (after human review)

`captions/tears-of-steel.en.vtt` (official Blender subtitles, CC BY 3.0) is
prepared, but not reviewed by a person. Review it with
CAPTION-REVIEW-TEARS-OF-STEEL.md, then attach it with Mux's create-track API
(captions-investigation.md). Rollback: delete the track.
