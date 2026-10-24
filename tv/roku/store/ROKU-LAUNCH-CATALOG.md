# Roku launch catalog and rights evidence matrix

For the owner and counsel, 2026-10-24. **Not a legal opinion.** Supersedes
the classifications in TITLE-RIGHTS-MATRIX.md, which keeps the per-title copy
findings; this file adds the primary-record searches and the remediation.
Nothing in production was changed.

| Group | Titles | Roku |
| --- | --- | --- |
| A. Ready for launch | **28** | In the server-side Roku allowlist (branch `feature/roku-launch-eligibility`) |
| B. Remediation ready | **6** | Verified replacement staged; joins the allowlist after the owner approves the swap |
| C. Rights hold | **15** | Excluded from Roku browse, search, deep links and playback |
| Restricted (since 2026-10-23) | 7 | Unchanged; not live anywhere |

## Method (new in this pass)

1. **Renewal records, primary sources.** Films published 1931-1949 renew in
   their 28th year, which falls between 1958 and 1977. All 20 Catalog of
   Copyright Entries motion-picture volumes (1958-1977) and 33 music volumes
   were searched from the Internet Archive's OCR text. The search was
   calibrated against known results: Casablanca's renewal is found (1970);
   It's a Wonderful Life is absent, as it was never renewed; Brother, Can You
   Spare a Dime? is found (1959); The Grapes of Wrath is found in the 1966
   book renewals (Project Gutenberg transcription). Films from 1950 onward
   were checked in the Copyright Office public records API (1978 onward).
   OCR can miss an entry, so a "not found" is strong evidence, not proof.
2. **Studio cross-checks.** Where a studio renewed other titles in the same
   window (Columbia 1967; Warner/UAA 1958-61), the absence of our title is
   meaningful.
3. **Music.** Song and score renewals were searched in the music volumes for
   each film's window. That search found the Gulliver's Travels songs and the
   1932 cartoon song.
4. **What PROtv streams.** Frames of PROtv's own copies and of every
   replacement candidate were inspected, and candidate audio was measured
   with ffmpeg over HTTP range requests. Replacement sources are pinned by the
   Internet Archive's SHA-1, size and runtime.
5. **Recordations.** 2025 bulk recordations ("Crossbow: The Movie & 2407 other
   titles", V15039D155; "Abilene Town & 295 other titles", V15035D376/451)
   list some catalog titles among thousands, including undisputed
   public-domain films. A recordation transfers whatever rights exist; it
   does not create them. They are noted, not treated as claims of validity.

## Coverage limits

- Music renewal volumes searched: 1958-1960, 1962-1963, 1965-1970 and 1972
  (both halves), and January-June only for 1973-1977. The July-December
  1973-1977 music volumes were not available in the Internet Archive
  listing. For Angel on My Shoulder, Angel and the Badman, The Amazing Mr. X,
  Africa Screams and D.O.A., separately published music was therefore only
  half-checked. Their film renewal checks are complete. A Copyright Office
  search of those music windows would close this.
- A music search finds songs whose entry names the film ("from <film>") or
  the song title we searched. An unpublished underscore has no entry to find;
  that is the normal case for film scores of this era.

## A. Ready for launch (28)

| Title | ID | Rights basis (primary records) | Copy PROtv streams / replacement | Music | Artwork | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A Day in the Life of a Coal Miner (1910) | `u3dXF1OlGIXiRPAHz3hE` | Published 1910: US term expired | Archive digitization, silent, no audio (archive.org silent-a-day-in-the-life-of-a-coal-miner) | None | Owner-supplied PROtv poster | US only |
| Africa Screams (1949) | `uvRcBLWVKxLyHsswVZOo` | No renewal in CCE motion-picture renewals 1958-1977 (window 1976-77) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Black-and-white Nassour print (colorized versions not used) | No music renewal found | Owner-supplied PROtv poster |  |
| Angel and the Badman (1947) | `aIZ4FeTCPjuTlycMgxiK` | No renewal in CCE motion-picture renewals 1958-1977 (window 1974-75) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Black-and-white Republic print (1991 colorized version not used) | No music renewal found | PROtv generated artwork (legacy set) |  |
| Angel on My Shoulder (1946) | `KS5fwSoYxy8h3FkrTWW3` | No renewal in CCE motion-picture renewals 1958-1977 (window 1973-74) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | archive.org angel_on_my_shoulder; no restoration marks | No renewal of a score or song from the film found 1973-74 | Owner-supplied PROtv poster |  |
| Attack of the Giant Leeches (1959) | `ZIWIKF2lyh7hJCcRkPLr` | No USCO renewal (window 1986-87); 1982 recordation references LP20359 | AIP print | No music renewal found | Owner-supplied PROtv poster |  |
| Big Buck Bunny (2008) | `hKPU3JNJ4faWLgWE6ZSq` | CC BY 3.0 (Blender Foundation) | Official 480p release (archive.org BBB-480p) | Film soundtrack under the film licence | Owner-supplied PROtv poster | Attribution in description |
| Big Timers (1945) | `dKxiQCeBcuT92BKv9dgJ` | No renewal in CCE motion-picture renewals 1958-1977 (window 1972-73) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Original print, "Copyright 1945 by All American News" | No music renewal found | Owner-supplied PROtv poster |  |
| Captain Kidd (1945) | `CmN3oev0txAoerdvsjCb` | No renewal in CCE motion-picture renewals 1958-1977 (window 1972-73) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Original United Artists print | No music renewal found | Owner-supplied PROtv poster |  |
| D.O.A. (1950) | `WMmLodEvI2gpEVW9v6yL` | No renewal in CCE motion-picture renewals 1958-1977 (calibrated: Casablanca found 1970; It's a Wonderful Life absent); no USCO renewal (1978+) | English Questar video print (distributor card at the end; optional trim) | No music renewal found | Owner-supplied PROtv poster | Catalog IMDb link was corrected 2026-10-23 |
| Dead Air | `creator_89303465-51e3-46bb-bd21-ff5ed2db2c49` | Signed creator agreement (Firestore creatorContractReference) | Creator-supplied file | Covered by the agreement | Creator-supplied poster | Rated TV-MA |
| Elephants Dream (2006) | `6wWGoL2qWRqtCmCTSRQY` | CC BY 2.5 (Orange Open Movie) | Official release ("orange open movie project" titles) | Part of the CC BY film | Owner-supplied PROtv poster | Attribution in description |
| His Girl Friday (1940) | `LiMNMZWXBxJj3LoP73kU` | No renewal in CCE motion-picture renewals 1958-1977 (window 1967-68) (calibrated: Casablanca found 1970; It's a Wonderful Life absent); Columbia renewed The Amazing Mr. Williams (1939) in 1967, so the volume is complete. Source play The Front Page (1928) is public domain | Original Columbia print (archive.org HisGirlFriday1940_201711; no Criterion material) | No songs; no music renewal found 1967-68 | **Replace**: current poster depicts Cary Grant and Rosalind Russell; original PROtv design staged |  |
| Jungle Book 1942 | `aFRblRPxcp3LEm1lf4ye` | No renewal in CCE motion-picture renewals 1958-1977 (window 1969-70) (calibrated: Casablanca found 1970; It's a Wonderful Life absent); Kipling source public domain | Original Technicolor print (archive.org JungleBook1942_201701) | No Rozsa score or suite renewal found 1968-70 | PROtv generated artwork (legacy set) |  |
| Murder in Harlem (1935) | `6h3blkiA6LTeLv66jj1v` | No renewal in CCE motion-picture renewals 1958-1977 (window 1962-63) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Black-and-white print | No music renewal found 1962-63 | PROtv generated artwork (legacy set) |  |
| Plan 9 from Outer Space (1957) | `B2MDEH2b25NknMQMEhoM` | No USCO renewal (window 1986-87); 1981 registration PA0000102338 and bulk 2025 recordations (trailer) noted for counsel | Black-and-white DCA print (2007 colorized version not used) | Library music | PROtv generated artwork (legacy set) |  |
| Sintel (2010) | `sCWQqVE5WIoNNN5wAGQ2` | CC BY 3.0 (Blender Foundation) | Official film (archive.org tweakers001907, 888 s) | Part of the CC BY film | Owner-supplied PROtv poster | Attribution in description |
| Tears of Steel (2012) | `gbcxmtl6mAHQeBxx8Dgs` | CC BY 3.0 (Blender Foundation, mango.blender.org/sharing) | Official release (Commons file, 734.06 s) | Part of the CC BY film | Owner-supplied PROtv poster | Attribution in description. Official CC BY subtitles prepared (review pending) |
| The Amazing Mr. X (1948) | `evCYYCPlc23BKzpmt2ug` | No renewal in CCE motion-picture renewals 1958-1977 (window 1975-76; also searched "The Spiritualist") (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | archive.org 1948-the-amazing-mr-x (VOSE upload); 8 frames incl. dialogue show no burned-in subtitles | No music renewal found | Owner-supplied PROtv poster |  |
| The Battle of Midway (1942) | `2OTfk1MA9SNAJcXQajCl` | No renewal in CCE motion-picture renewals 1958-1977 (window 1969-70) (calibrated: Casablanca found 1970; It's a Wonderful Life absent); made by US Navy personnel | US Navy release ("Official United States Navy") | Traditional songs; no music renewal found | PROtv generated artwork (legacy set) |  |
| The Blood of Jesus (1941) | `PqGsChF8xtTQdaQFEWQI` | No renewal in CCE motion-picture renewals 1958-1977 (window 1968-69) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Sack Amusement print | Spirituals (traditional); no music renewal found | Owner-supplied PROtv poster |  |
| The Brain That Wouldn't Die (1962) | `RwDe3WkIWoHQ1EUzfWn9` | No USCO renewal (window 1989-90); 1988 registration PA0000399511 and later new versions noted for counsel | Old TV print (not the 2013 Synapse restoration) | No music renewal found | Owner-supplied PROtv poster |  |
| The Bronze Buckaroo (1939) | `goOpjlfjJF3YWw5dlHqe` | No renewal in CCE motion-picture renewals 1958-1977 (window 1966-67) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Original Hollywood Productions print (not the 1990 Viking edition) | No song renewal found in CCE music 1966-67 | Owner-supplied PROtv poster |  |
| The Duke Is Tops (1938) | `1l1uGB4v8CaUr9p4TTGv` | No renewal in CCE motion-picture renewals 1958-1977 (window 1965-66) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Original Million Dollar Productions print | No song renewal found in CCE music 1965-66 | **Replace**: current poster shows a realistic performer face; original PROtv design staged |  |
| The Exile (1931) | `uzZVSNOg0sOZaTk4tlV6` | No renewal in CCE motion-picture renewals 1958-1977 (window 1958-59) (calibrated: Casablanca found 1970; It's a Wonderful Life absent); every 1931 work is public domain from 2027-01-01 | Library of Congress digitization | No music renewal found | Owner-supplied PROtv poster |  |
| The Girl from Chicago (1932) | `Ts881xyfGAz4E4TZHIeg` | No renewal in CCE motion-picture renewals 1958-1977 (window 1959-60) (calibrated: Casablanca found 1970; It's a Wonderful Life absent) | Library of Congress digitization (federal) | No music renewal found 1959-60 | Owner-supplied PROtv poster |  |
| The Incredible Petrified World (1959) | `MZ6Q6DI2S62pP8laH9Ku` | No USCO registration or renewal for the film (window 1986-88) | archive.org the-incredible-petrified-world-1959 | No music renewal found | **Replace**: current image is a Google Images thumbnail (already withheld by the Roku app); original PROtv design staged |  |
| The Little Shop of Horrors (1960) | `3NAU6BldsmCNs9wjM08a` | No USCO renewal (window 1987-88); later registrations are other works (1985 musical, 2008 colorized, 2025 new version) | Standard old print | No music renewal found | PROtv generated artwork (legacy set) |  |
| The Lost Camp | `creator_20752565-9909-4c2b-9f53-c9719ca26769` | Signed creator agreement (Firestore creatorContractReference) | Creator-supplied file | Covered by the agreement | Creator-supplied poster |  |

## B. Remediation ready (6)

| Title | ID | Rights basis (primary records) | Copy PROtv streams / replacement | Music | Artwork | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Carnival of Souls (1962) | `WIVB9NPQQzvtvjTBsiKw` | No USCO renewal (window 1989-90); 1996 director's cut (PA0000827002) is a separate work and is not used | Current: Criterion/Janus release (Blu-ray rip). **Replacement:** Herts-Lion theatrical print, archive.org CarnivalOfSouls720p1962 (2012), SHA-1 814775ffaaf080379e65666628b84aa41212afd6 | Original organ score | Owner-supplied PROtv poster |  |
| Detour (1945) | `IHkqDr5bGIY0Nw5Lhkky` | No renewal in CCE motion-picture renewals 1958-1977 (window 1972-73) (calibrated: Casablanca found 1970; It's a Wonderful Life absent); source novel by Martin Goldsmith (1939) not renewed in 1966-67 book renewals (calibrated: The Grapes of Wrath found) | Current: 2018 Academy Film Archive restoration via a YTS Blu-ray rip. **Replacement:** original PRC print, archive.org Detour/Detour.MPEG (2007 upload), SHA-1 6ab29d86e7fbb2b6f28361c045ffd8c8d14836ed | Original score | Owner-supplied PROtv poster |  |
| KIPHO | `hFVcdczhgn8dT3cZcXAR` | German film published 1925: US term expired | Current: Deutsche Kinemathek release with unidentified music. **Replacement:** the same Commons file with the audio track removed (video bytes unchanged; Kinemathek logo kept as provenance), SHA-256 b076e60d...106f | None (muted) | Owner-supplied PROtv poster |  |
| Night of the Living Dead (1968) | `zGpbFWvSaup6ioUaoqsN` | Published 1968 without a valid notice; no USCO renewal | Current: clean HD transfer that may derive from the 2017 restoration (PA0002026041). **Replacement:** original video master, archive.org Night_Of_The_Living_Dead_raw_HD_WS (2013), SHA-1 ab7a006c34a7a2f6e62c05b10f7ce44d3470fc06 | Library music | Owner-supplied PROtv poster |  |
| The Phantom of the Opera (1925) | `WeNPJRItOH2nOdbwLkDG` | Published 1925; reissue elements 1929-30, all past the 95-year term | Current: unknown source with an unidentified score. **Replacement:** silent Universal print, archive.org ThePhantomOfTheOpera_201612, SHA-1 521bb6c1be15e0948dc79c4cbfbb313aba0b8a28 | None (silent) | PROtv-proxied image, origin not recorded (owner to confirm or replace) |  |
| The Scar of Shame (1927) | `tuwoR1lZN8VnSTCSEiTc` | Published 1927: US term expired | Current: LoC presentation **with a score composed and performed by Makia Matsumura** (end credit). **Replacement:** the same LoC presentation with no audio track, archive.org the-scar-of-shame_1927 original file, SHA-1 5e4c4da4d4852be5417c596040803bf2a8ea2690 | None (silent) | Owner-supplied PROtv poster | Its end card still credits the music; trim it or leave it as provenance |

## C. Rights hold (15)

| Title | ID | Rights basis (primary records) | Copy PROtv streams / replacement | Music | Artwork | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Body and Soul (1925) | `biitnhJJnBvHGFx8TJZC` | Published 1925 (film public domain) | Every available copy is the Criterion/George Eastman House release (Criterion logo in both archive copies) | Criterion-commissioned modern score | — | Needs a non-Criterion source or a licensed/public-domain score |
| Cavalcade of Stars | `FOn1pIGiBKaUb89oE6Gm` | A 1951 DuMont live broadcast (Honeymooners sketch): may never have been "published"; unpublished works made for hire last 120 years | Kinescope (archive.org Cavalcade_Of_Stars) | Part of the broadcast | — | Counsel |
| Fleischer Studios' Superman | `iUX01XuVHd9okFW4gmqR` | Cartoon (1941) not renewed (no CCE renewal 1968-69) | Original Paramount print | Sammy Timberg score | — | Underlying Superman comics (DC, renewed) are protected; exhibiting a derivative may infringe the underlying work (Stewart v. Abend). Counsel |
| Gulliver’s Travels (1939) | `t6Ii7hflAigcefjBRz3r` | Film not renewed, but its songs were: "Faithful Forever", "Bluebirds in the Moonlight", "All's Well", "I Hear a Dream", "Faithful", "Forever" (Famous Music, 1966, e.g. R397319, R397320) and "It's a Hap-Hap-Happy Day" (Sammy Timberg, 1966) | Original Paramount print | Renewed songs, protected to the end of 2034 | — | Same pattern as the restricted Thomson titles |
| House on Haunted Hill (1959) | `p532d2Aqpb3bC2rvYkQw` | Film renewal **RE0000318809** (1986-01-12, "House on a haunted hill. By Allied Artists", Revival Pictures) and song renewal RE0000309723 | Allied Artists print | Renewed title song | — | Counsel: renewal vs the reported missing notice |
| Looney Tunes Classics: Collection | `lussNXvK08RN9xtfq4wN` | "Dumb Patrol" (1931): no renewal found (Warner renewed 1933 Bosko shorts in 1961; no 1931-32 Harman-Ising shorts appear) | Harman-Ising Looney Tunes print | Songs not identified | — | Every 1931 work is public domain from 2027-01-01: eligible then. Catalog title should name the short |
| Merri Melodies shorts | `v_1789872561270_i3svw5cbz` | Cartoon "You're Too Careless with Your Kisses!" (1932): no film renewal found; **title song renewed 1959 (R236180, R236532; Mort Dixon & Harry Woods, EP29967 1932)** | Harman-Ising Merrie Melodies print | Renewed song, protected through 2027 | — | Eligible 2028-01-01. Catalog title should name the short |
| NASA's Documentary Film - Hubble25 | `vmsxoXY005wf3SwsfF7F` | NASA work (US government) | NASA TV copy | Music uncredited; archival newsreel footage | — | Identify music and third-party footage |
| One Step Beyond - The Storm | `5FHvg3BEwBlk9qqNdZT5` | Listed in a 1992 recorded assignment of a CBS TV catalog (V2826P703); USCO renewals exist for the series title (episode-level check needed) | Episode print | Harry Lubin score | — | Counsel / CBS |
| Parker Solar Probe | `BcyriYT9mIQj4ZDd9jFr` | NASA work (US government) | NASA TV copy | Music uncredited; Goddard productions use licensed library music (e.g. Killer Tracks) | — | Identify the music or mute |
| Sita Sings the Blues (2008) | `vuvTzWOcVJJeg12CsTq9` | Film CC BY-SA 3.0 / CC0; 1920s songs licensed by the filmmaker for the film | Fan DVD encode of the official film | Licensed songs | — | Counsel: does streaming fall within the published song terms |
| Superman cartoons | `morl7jrTRiEF2ihf282A` | As Fleischer Studios' Superman | Wayzata "Supertoons" CD-ROM transfer (1993-94) | As above | — | Duplicate in substance; same counsel question |
| The Bundy Chronicles | `sqKR6c5Cq7MD9lg1GDxG` | No creator agreement, rights holder or AI-tool terms recorded | Admin upload (2025-09-13), vertical 9:16 | Unknown | — | Owner records authorship and tool terms |
| Within Our Gates (1920) | `XMj306OZSbomES2Zz0Fz` | Published 1920 (film public domain) | Only surviving version is the 1993 LoC restoration | Modern score in the current copy; a silent copy exists | — | Restoration card: English intertitles "reconstructed by Scott Simmon … previous translation by Kathleen Newman"; whether that text is a federal work or protectable authorship is a counsel question |
| Woman on the Run (1950) | `9P2whdYluJRAJeI6cOuh` | Score renewal **RE0000909148** (2005, Bruin Music Company for John Carl Parker) | Current copy is the UCLA preservation | Renewed score | — | Any copy carries the renewed score |

## Sources

- Catalog of Copyright Entries, Third Series, Parts 12-13 (Motion Pictures)
  1958-1977 and Part 5 (Music) 1958-1977, Internet Archive scans (for
  example catalogofc19693231213libr, catalogofco1966320512lib,
  catalogofcopyrig3135lib).
- U.S. Copyright Office public records (api.publicrecords.copyright.gov):
  RE0000318809, RE0000309723, RE0000909148, PA0000827002, PA0002026041,
  PA0000399511, PA0000102338.
- Project Gutenberg "U.S. Copyright Renewals" 1966-1967 (ebooks 11833-11836).
- Internet Archive item metadata for every replacement (SHA-1, size,
  runtime); Wikimedia Commons file metadata for KIPHO.
