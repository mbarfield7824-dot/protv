# PROtv catalog rights and accessibility matrix

**Read-only review for the owner, 2026-10-23. Not a legal opinion, and nothing
here grants or asserts rights.** Built from the live catalog (56 titles) and
the structured rights fields in Firestore (`copyrightStatus`,
`licenseType`, `rightsHolder`, `attribution*`, `publicDomain*`,
`rightsVerificationNotes`). Full data with every column, including
unresolved issues per title: `store/rights-matrix.csv`.

## Summary

| Rights basis on record | Titles | Evidence |
| --- | --- | --- |
| Public domain, structured record with source link | 11 | Archive/source URL and license evidence stored |
| Creator-owned, signed Creator Schedule | 2 (The Lost Camp, Dead Air) | "Ownership and signed contract were verified in the PROtv Creator Agent" |
| Public description note "Public domain." only; structured status **unknown** | 38 | None stored |
| Note "CC BY 3.0, Blender Foundation" only; structured status unknown | 4 (Big Buck Bunny, Elephants Dream, Sintel, Tears of Steel) | None stored |
| Note "PROtv exclusive" only; structured status unknown | 1 (The Bundy Chronicles) | None stored; no rights holder or agreement on record |

- **Captions:** 0 of 56 titles have caption or subtitle tracks (live HLS
  manifests checked) and no `subtitles` field is populated.
- **Maturity ratings:** 2 of 56 (Jungle Book 1942: PG; Dead Air: TV-MA).
  The rest are unrated. No rating was invented.
- **Attribution:** none of the 4 Blender titles has attribution text in
  `attributionText`; the credit appears only in the description note. CC BY
  requires attribution wherever the work is shown (the description satisfies
  this on screens that show the description).

## Unresolved (owner / counsel)

1. **43 titles rely only on a description note.** Before choosing countries,
   record the source copy and the basis (e.g. not renewed, pre-1929, US
   government work, CC license) for each, as the 11 structured titles already
   do. Public-domain status is country-specific: a film that is public domain
   in the US may be protected elsewhere.
2. **The Bundy Chronicles ("PROtv exclusive")** has no rights holder, license
   type or agreement on record. Confirm the agreement exists and its territory.
3. **Compilations** (Looney Tunes Classics: Collection, Merri Melodies
   shorts) are marked Public Domain Mark, but public-domain status is per
   short; confirm every short in each video.
4. **Elephants Dream** is published by the Blender Foundation under CC BY 2.5
   (the other three under CC BY 3.0); the note says 3.0. Confirm and correct
   the note if so.
5. **Creator titles:** confirm the territory clause in each signed schedule
   covers Roku distribution in the chosen countries. Dead Air carries TV-MA;
   The Lost Camp has no rating.
6. **Restored editions:** where a source is a modern restoration (e.g.
   Woman on the Run, D.O.A., Night of the Living Dead have well-known
   restorations), confirm the copy used is the original public-domain release
   and not a newly copyrighted restoration or soundtrack.

## Territory recommendation

Launch **United States only**. Every public-domain basis on record is a US
basis; worldwide rights are not documented for 43 titles. Expand only after
item 1 is resolved per country. This is a recommendation, not a declaration.

## Captions (certification 4.8 "where required by law")

Roku requires captions where the law requires them. The US rule is the FCC's
IP closed-captioning rule, 47 CFR 79.4:

- It covers nonexempt **full-length video programming that is "published or
  exhibited on television in the United States with captions"** (79.4(b)(1)).
  "Video programming" is programming comparable to a TV broadcast station's
  and excludes consumer-generated media (79.4(a)(1)).
- **Archival programming:** once a title already online is shown on US
  television with captions, the online version must be captioned within
  **15 days** (for showings on or after March 30, 2016; 79.4(b)(1)(iv)).
- There is a de minimis provision (79.4(c)(3)) and an economic-burden
  exemption only by FCC petition (79.4(d)). **No exemption is claimed here.**

What this means for PROtv (needs counsel to confirm):

- Classic films and TV episodes in the catalog (for example Night of the
  Living Dead, His Girl Friday, the Fleischer Superman cartoons, One Step
  Beyond, Cavalcade of Stars) are the kind of programming that may have aired
  on US television with captions. If any has, the rule can apply to PROtv's
  copy. PROtv has no record either way.
- Independent creator films and Blender shorts that never aired on TV with
  captions are likely outside the trigger, but this is not established.
- Beyond the legal minimum, Roku reviewers and accessibility expectations
  favor captions on all long-form titles.

**Recommended path (no cost incurred by this review):** generate captions for
every title. Mux can add text tracks to existing assets (uploaded WebVTT/SRT,
or Mux auto-generated captions — the owner should confirm current Mux pricing
before enabling). The Roku app needs **no change**: the Roku Video node shows
WebVTT tracks from the HLS manifest automatically when the viewer turns on
captions in Roku settings or the * menu (left to Roku, certification 4.4).
Verify one captioned title on the TV once tracks exist.

## Per-title matrix

Columns: rights basis on record, evidence stored, recommended territory,
attribution text stored, caption tracks, maturity rating. Restrictions: none
recorded in any title. See the CSV for issues per title.

| Title | ID | Type | Rights basis on record | Evidence | Territory | Attribution | Captions | Rating |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dead Air | `creator_89303465-51e3-46bb-bd21-ff5ed2db2c49` | Movie | creator-owned (Creator Schedule replacement) | Creator Agent verification note | Per signed creator agreement | — | none | TV-MA |
| The Lost Camp | `creator_20752565-9909-4c2b-9f53-c9719ca26769` | Movie | creator-owned (Creator Schedule B) | Creator Agent verification note | Per signed creator agreement | — | none | unrated |
| 50 Classic Cartoons (Silver Screen Video) | `1uuUM2H0SzmcKeOpIe3V` | Movie | public-domain (Public Domain Mark) | [source](https://archive.org/details/50-classic-cartoons-silver-screen-video) | US | — | none | unrated |
| Cavalcade of Stars | `FOn1pIGiBKaUb89oE6Gm` | Episode | public-domain (Public Domain Mark) | [source](https://archive.org/details/Cavalcade_Of_Stars) | US | — | none | unrated |
| Fleischer Studios' Superman | `iUX01XuVHd9okFW4gmqR` | Episode | public-domain (Public Domain Mark) | [source](https://archive.org/details/fleischer-superman) | US | — | none | unrated |
| His Girl Friday (1940) | `LiMNMZWXBxJj3LoP73kU` | Movie | public-domain (Public Domain Mark) | [source](https://archive.org/details/HisGirlFriday1940_201711) | US | — | none | unrated |
| KIPHO | `hFVcdczhgn8dT3cZcXAR` | Movie | public-domain (Public domain) | [source](https://commons.wikimedia.org/wiki/File:KIPHO.webm) | US | — | none | unrated |
| Looney Tunes Classics: Collection | `lussNXvK08RN9xtfq4wN` | Episode | public-domain (Public Domain Mark) | [source](https://archive.org/details/looney-tunes-classics-public-domain-collection) | US | — | none | unrated |
| Merri Melodies shorts | `v_1789872561270_i3svw5cbz` | Episode | public-domain (Public Domain Mark) | [source](https://archive.org/details/ltmm-publicdomain) | US | — | none | unrated |
| NASA's Documentary Film - Hubble25 | `vmsxoXY005wf3SwsfF7F` | Movie | public-domain (Public domain) | [source](https://commons.wikimedia.org/wiki/File:NASA%27s_Documentary_Film_-_Hubble25.webm) | US | — | none | unrated |
| Parker Solar Probe | `BcyriYT9mIQj4ZDd9jFr` | Movie | public-domain (Public domain) | [source](https://commons.wikimedia.org/wiki/File:Parker_Solar_Probe_Countdown_to_T-Zero_in_4K_-_Flying_Faster,_Hotter_and_Closer_Than_Ever_to_the_Sun.webm) | US | — | none | unrated |
| Superman cartoons | `morl7jrTRiEF2ihf282A` | Movie | public-domain (Public Domain Mark) | [source](https://archive.org/details/SupermanCartoons) | US | — | none | unrated |
| Woman On The Run 1950 | `9P2whdYluJRAJeI6cOuh` | Movie | public-domain (Public domain) | [source](https://commons.wikimedia.org/wiki/File:Woman_On_The_Run_1950.webm) | US | — | none | unrated |
| A Day in the Life of a Coal Miner (1910) | `u3dXF1OlGIXiRPAHz3hE` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Africa Screams (1949) | `uvRcBLWVKxLyHsswVZOo` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Angel and the Badman (1947) | `aIZ4FeTCPjuTlycMgxiK` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Angel on My Shoulder (1946) | `KS5fwSoYxy8h3FkrTWW3` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Attack of the Giant Leeches (1959) | `ZIWIKF2lyh7hJCcRkPLr` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Beat the Devil (1953) | `UPq8eJixIfLiKXPIOXRm` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Big Buck Bunny (2008) | `hKPU3JNJ4faWLgWE6ZSq` | Movie | note only: "Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blende" | none on record | Unresolved | — | none | unrated |
| Big Timers (1945) | `dKxiQCeBcuT92BKv9dgJ` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Body and Soul (1925) | `biitnhJJnBvHGFx8TJZC` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Captain Kidd (1945) | `CmN3oev0txAoerdvsjCb` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Carnival of Souls (1962) | `WIVB9NPQQzvtvjTBsiKw` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| D.O.A. (1950) | `WMmLodEvI2gpEVW9v6yL` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Detour (1945) | `IHkqDr5bGIY0Nw5Lhkky` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Elephants Dream (2006) | `6wWGoL2qWRqtCmCTSRQY` | Movie | note only: "Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blende" | none on record | Unresolved | — | none | unrated |
| Gulliver’s Travels (1939) | `t6Ii7hflAigcefjBRz3r` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| House on Haunted Hill 1959 | `p532d2Aqpb3bC2rvYkQw` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Jungle Book 1942 | `aFRblRPxcp3LEm1lf4ye` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | PG |
| Murder in Harlem (1935) | `6h3blkiA6LTeLv66jj1v` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Night of the Living Dead (1968) | `zGpbFWvSaup6ioUaoqsN` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| One Step Beyond - The Storm | `5FHvg3BEwBlk9qqNdZT5` | Episode | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Plan 9 from Outer Space (1957) | `B2MDEH2b25NknMQMEhoM` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Sintel (2010) | `sCWQqVE5WIoNNN5wAGQ2` | Movie | note only: "Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blende" | none on record | Unresolved | — | none | unrated |
| Sita Sings the Blues (2008) | `vuvTzWOcVJJeg12CsTq9` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Tears of Steel (2012) | `gbcxmtl6mAHQeBxx8Dgs` | Movie | note only: "Creative Commons Attribution 3.0 (CC BY 3.0). Credit: Blende" | none on record | Unresolved | — | none | unrated |
| The Amazing Mr. X (1948) | `evCYYCPlc23BKzpmt2ug` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Battle of Midway (1942) | `2OTfk1MA9SNAJcXQajCl` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Blood of Jesus (1941) | `PqGsChF8xtTQdaQFEWQI` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Brain from Planet Arous (1957) | `vyjpYtuEpOlCWzyzlaxM` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Brain That Wouldn't Die (1962) | `RwDe3WkIWoHQ1EUzfWn9` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Bronze Buckaroo (1939) | `goOpjlfjJF3YWw5dlHqe` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Bundy Chronicles | `sqKR6c5Cq7MD9lg1GDxG` | Movie | note only: "PROtv exclusive" | none on record | Unresolved | — | none | unrated |
| The Duke Is Tops (1938) | `1l1uGB4v8CaUr9p4TTGv` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Exile (1931) | `uzZVSNOg0sOZaTk4tlV6` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Girl from Chicago (1932) | `Ts881xyfGAz4E4TZHIeg` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Incredible Petrified World (1959) | `MZ6Q6DI2S62pP8laH9Ku` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Last Man on Earth (1964) | `s0Eu00ADQQZnAoknUpxx` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Little Shop of Horrors (1960) | `3NAU6BldsmCNs9wjM08a` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Phantom of the Opera | `WeNPJRItOH2nOdbwLkDG` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Plow That Broke the Plains (1936) | `APlVZLmiQPIczS9uEbEd` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The River (1938) | `tsq6EVuAjU7hf95yuGl8` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| The Scar of Shame (1927) | `tuwoR1lZN8VnSTCSEiTc` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Voyage to the Planet of Prehistoric Women (1968) | `SWSvCl89kxWp2qMXHT3w` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
| Within Our Gates [1920] | `XMj306OZSbomES2Zz0Fz` | Movie | note only: "Public domain." | none on record | Unresolved | — | none | unrated |
