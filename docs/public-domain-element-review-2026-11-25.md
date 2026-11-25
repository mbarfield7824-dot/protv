# Public-domain element review (2026-11-25)

This is an evidence record, not a legal opinion. It completes the three checks that the 2026-10-23 review left open for
the 22 U.S. public-domain classics: the soundtrack, the source of PROtv's own copy, and primary renewal records for the
films whose status rested on secondary sources. The results are recorded per title in
`backend/src/catalog/ctvRightsRegistry.json` (the `evidence` field).

## Method
1. **Film renewals (primary source).** I downloaded the Catalog of Copyright Entries (CCE), Parts 12–13 (Motion Pictures),
   as full text from the Internet Archive for 1957–1977 and searched each film's 28th-year renewal window.
   - The renewal sections are intact. Control: *Citizen Kane* (1941) appears as a renewal in 1968–69, and *The Big
     Sleep* in 1973.
2. **Music (primary source).** I searched the CCE Part 5 (Music) volumes for 1958–1960 and 1965–1977 for:
   - the film titles;
   - the credited composers and songwriters;
   - the song titles.
   - A film that has fallen into the public domain does not free a separately published composition that was renewed.
3. **Source copy.** I took eight frames from each Mux asset (the opening, credits, mid-film and end) and checked them
   for:
   - colorized or re-edited versions;
   - restoration-company branding;
   - watermarks.

   I also checked the asset metadata: tracks, resolution and duration.

## Cleared: film, soundtrack and source copy (14)
These are now eligible on iPhone/iPad, Apple TV and Samsung for U.S. requests. They play by a signed Mux playback ID,
added 2026-11-25 with no re-upload and with the public IDs unchanged.

| Title | Film | Music | Copy |
| --- | --- | --- | --- |
| A Day in the Life of a Coal Miner (1910) | Published 1910 | No audio track | Faithful digitization; one plain added title card |
| His Girl Friday (1940) | Notice MCMXXXIX; no CCE renewal 1966–68 | Studio score; no renewal 1966–68 | Original Columbia print |
| Angel on My Shoulder (1946) | No CCE renewal 1973–74 | Tiomkin score; no renewal tied to the film | Original print |
| The Amazing Mr. X (1948) | No CCE renewal 1975–77 | Laszlo score; his renewals found are of other works | Original print |
| Africa Screams (1949) | No CCE renewal 1975–77 | Schumann score; his renewals found are of other works | Original B&W, not colorized |
| Angel and the Badman (1947) | No CCE renewal 1974–75 | Hageman score; his renewals found are of other works | Original B&W Republic print, not the 1991 colorized version |
| Captain Kidd (1945) | No CCE renewal 1972–73 | Janssen score; the 1972 renewal of a song titled "Captain Kidd" is an unrelated popular song | Original print |
| D.O.A. (1950) | Notice MCMXLIX; no CCE renewal 1976–77 | Tiomkin score; the only Tiomkin renewal found 1972–77 is *Duel in the Sun* | Original United Artists print |
| Jungle Book (1942) | No CCE renewal 1969–70 | Rózsa renewed other works in 1969 (*Lydia*, R466754), but not the Jungle Book score or suite | Original Technicolor |
| The Blood of Jesus (1941) | No CCE renewal 1968–69 | Traditional spirituals | Original print |
| The Battle of Midway (1942) | U.S. Navy; no CCE renewal (no Fox claim) 1969–70 | Pre-1931 and traditional songs | Original Navy Technicolor print |
| The Little Shop of Horrors (1960) | Published without notice | Score published with the film | Original print |
| The Brain That Wouldn't Die (1962) | Published without a valid notice | Score published with the film | Original print |
| Attack of the Giant Leeches (1959) | No renewal in the online Copyright Office records | Laszlo score; no renewal tied to the film | Original AIP print |

Also cleared: **Elephants Dream** (2006), whose licence is verified as CC BY 2.5, stated by the copyright holder. It is
worldwide and needs no signed ID.

## Not cleared (8), and why
| Title | Finding |
| --- | --- |
| The Bronze Buckaroo (1939) | **Renewed song.** "Pay Day Blues" (words Johnny Lange, music Lew Porter; EU209282, 1939) was renewed on 28 Feb 1967 (R405470). Lew Porter wrote the film's songs, and the film features "Got the Payday Blues". Porter's songs for *Harlem on the Prairie* (1937) were also renewed. |
| The Duke Is Tops (1938) | The film shows no CCE renewal for 1965–66. **However,** "Killin' Jive" (Austin Powell; EU210199), performed in the film by the Cats and the Fiddle, was renewed on 28 Feb 1967 (R405418). |
| Plan 9 from Outer Space (1957) | The score is stock library music by Trevor Duncan and other British library composers. It is separately owned and may have been restored in the U.S. under 17 U.S.C. 104A. |
| The Incredible Petrified World (1959) | PROtv's copy carries a burned-in "rarelust.com" watermark, so it came from a download site. Replace it with a verified archive copy. |
| The Exile (1931) | The film shows no CCE renewal for 1958–59, and the copy is from the Library of Congress. However, Donald Heywood wrote the score and songs, and he renewed his 1932 songs in 1959 (R235016, R235017). The film's own songs are not identified. |
| The Girl from Chicago (1932) | The film shows no CCE renewal for 1959–60, and the copy is from the Library of Congress. Its musical numbers are not identified. |
| Big Timers (1945) | The film shows no CCE renewal for 1972–73. Its musical acts are not identified. |
| Murder in Harlem (1935) | Owner-approved rights hold. Its LIVE slots were replaced with cleared programming. |

The Bronze Buckaroo, The Duke Is Tops and Plan 9 findings concern music that **also airs on the website, Roku, Fire
TV and Android**, where these films are still carried under the October standard.

## Limits
- CCE text is OCR, so a garbled entry can be missed. The control titles were found as expected.
- Post-1978 renewals (films first published in 1950–1963) were not re-checked beyond the October online search.
- Song titles were not identified for The Exile, The Girl from Chicago and Big Timers. They stay off Apple and Samsung
  rather than being cleared on an assumption.

## PROtv LIVE programming changes (2026-11-25, same master timeline)
Every change keeps the original start and end to the second, so nothing else on the timeline moves. Logs are in the
session scratchpad (`unify/*-log-*.json`), listing the removed entries in full.
- **Murder in Harlem** (rights hold): 14 slots → Three Thirty; The Thirst + Concrete; 2212 + The Lost Camp + Curtain Call.
- **Petrified World, Plan 9, The Duke Is Tops and The Bronze Buckaroo**: 89 slots → programming cleared on all seven
  platforms.
  - Each slot now carries a creator film or a cleared classic, plus a short.
  - The five Wednesday 8 PM *Mr. Ceasefire* stand-ins return to **UNITED NATIONS**: U.S. viewers on every platform, by
    signed playback.
- **Week of Dec 21–27** (previously empty apart from the Dec 24 Ironborn finale): filled by Repeat Week from Dec 14–20.
  The three Double Date repeats that could not be copied (LIVE not granted) were filled with creator titles.
- **Breaks:** every new break was filled with house spots, so all 1,040 future breaks carry spots.
