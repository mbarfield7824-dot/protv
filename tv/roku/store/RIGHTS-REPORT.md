# PROtv catalog rights report (US launch)

**Generated from production Firestore on 2026-10-24. Not a legal opinion.**
Evidence: store/evidence/rights-evidence.md (per title), Firestore
`titleRightsEvidence/{videoId}` (structured: film copyright, soundtrack, source
copy, territory, attribution, creator permission kept separate), and
`adminAudit` (every change with previous values).

| Group | Titles |
| --- | --- |
| Live in the public catalog | 49 |
| Restricted (rights verification required) | 7 |
| Verified film-rights basis, no open item | 8 |
| Film basis verified, material items open | 22 |
| Unresolved, kept live pending evidence | 9 |
| Earlier admin-confirmed public-domain records (re-review recommended) | 10 |

Territory: **United States only.** No other territory is enabled or proposed.
`commercialUseStatus` stays `unverified` on every reviewed title because no
source copy has been confirmed.

## 1. Restricted titles (reversible)

Mechanism: the existing admin "Request rights verification" workflow
(`approvalStatus: rights-verification-required`). The record, Mux asset and
artwork are unchanged. The title is gone from the catalog, title, playback,
legacy `/api/videos/:id` and Roku deep-link paths (all verified 404 / absent).
**Residual:** a viewer who already has the Mux playback ID can still open the
public Mux stream directly. Closing that means changing the Mux playback ID
(owner decision).

**Rollback:** Admin > Catalog > approve the title (`PATCH
/api/videos/admin/:id/approve`), or restore the previous approval fields
stored in the audit entry.

| Title | ID | Restricted (UTC) | Audit ID | Reason and evidence |
| --- | --- | --- | --- | --- |
| 50 Classic Cartoons (Silver Screen Video) | `1uuUM2H0SzmcKeOpIe3V` | 2026-10-24T02:11:38.856Z | `4e310f55-db1d-4ee3-861c-343ab0908aa1` | Compilation includes The Unruly Hare (Warner Bros., 1945), whose copyright was renewed on 1972-10-25 (Wikipedia, The Unruly Hare). Also includes An Itch in Time (1943), absent from the public-domain Looney Tunes list, and The Big Bad Wolf, whose identity is unconfirmed. Restrict until the compilation is edited or every short is cleared. |
| The Plow That Broke the Plains (1936) | `APlVZLmiQPIczS9uEbEd` | 2026-10-24T02:11:38.395Z | `85f95fb6-eb96-49fe-a48d-290210654fbb` | Film is a US government work, but its Virgil Thomson score is copyrighted: music published 1942 (EP105394) and renewed R462214 (1969); assignments recorded 1990-91. Streaming the soundtrack performs the protected composition. |
| Voyage to the Planet of Prehistoric Women (1968) | `SWSvCl89kxWp2qMXHT3w` | 2026-10-24T02:11:39.076Z | `b165fbf6-b687-437d-a482-d08e94b7eee0` | Its stated basis ('not renewed', Commons) does not apply to 1968 works, which were renewed automatically; it would be public domain only if published without notice, which is not documented. Most footage comes from the 1962 Soviet film Planeta Bur, a foreign work eligible for URAA restoration. |
| Beat the Devil (1953) | `UPq8eJixIfLiKXPIOXRm` | 2026-10-24T02:11:37.881Z | `c5b4a4f7-866b-47e5-84cb-5e83586b62cb` | Foreign (UK) work with US copyright claimed: Columbia Pictures registered the film in 2016 (PA0001394584, nation of publication United Kingdom, 1953-11-26), consistent with URAA restoration; Columbia declaration recorded 1992 (V2677P365); source novel by James Helvick renewed (RE0000028779, 1979), protected to 2046. |
| The Last Man on Earth (1964) | `s0Eu00ADQQZnAoknUpxx` | 2026-10-24T02:11:38.145Z | `c6b6a3d7-9afc-4a35-aa32-10b3cec021b2` | Adaptation of Richard Matheson's novel I Am Legend, renewed RE0000141686 (1982-11-04; protected to 2049), with literary rights assigned to Warner Bros. (V2782P253, 1992). 1964 works were renewed automatically, so 'not renewed' is not a valid basis; Italian co-production (possible URAA restoration). |
| The River (1938) | `tsq6EVuAjU7hf95yuGl8` | 2026-10-24T02:11:38.623Z | `0553a428-3ced-437d-b9c3-5b50d1dd51a2` | Film is a US government work, but its Virgil Thomson music is copyrighted: 'The River; instrumental' renewal R342616 (1964), suite renewal RE0000293855 (1986); assignment recorded 1990 (V2569P442). |
| The Brain from Planet Arous (1957) | `vyjpYtuEpOlCWzyzlaxM` | 2026-10-24T02:07:15.328Z | `a3cb47e3-2dc5-43fe-973a-2ca64e5b2606` | US copyright renewed: RE0000258469 (1985-09-03, Howco Productions, Inc., PWH) renews LP0000009453 (1957-11-27) for this motion picture; assignment V15035D376 (2025-05-29) and exclusive license V15035D451 (2025-06-02) recorded. Likely protected through 2052. |

## 2. Verified film-rights basis

| Title | ID | Basis |
| --- | --- | --- |
| Angel on My Shoulder (1946) | `KS5fwSoYxy8h3FkrTWW3` | B: Copyright not renewed (Wikipedia: "U.S. copyright expired in 1973"); Commons file dedicated CC0 |
| Attack of the Giant Leeches (1959) | `ZIWIKF2lyh7hJCcRkPLr` | B: Copyright not renewed (Wikipedia; Commons; Wikipedia PD list) |
| The Amazing Mr. X (1948) | `evCYYCPlc23BKzpmt2ug` | B: Copyright not renewed (Commons; Wikipedia: "The film is in the public domain"; Wikipedia PD list) |
| Tears of Steel (2012) | `gbcxmtl6mAHQeBxx8Dgs` | A: CC BY 3.0 (Wikidata, Commons) |
| Sintel (2010) | `sCWQqVE5WIoNNN5wAGQ2` | A: CC BY 3.0 (Wikidata, Commons) |
| Gulliver’s Travels (1939) | `t6Ii7hflAigcefjBRz3r` | B: Copyright not renewed (Wikipedia: "failed to be renewed in 1967"; Commons; Wikipedia PD list) |
| The Lost Camp | `creator_20752565-9909-4c2b-9f53-c9719ca26769` | Creator-owned: Creator Schedule B; Ownership and signed contract were verified in the PROtv Creator Agent before Administrator-approved publishing. |
| Dead Air | `creator_89303465-51e3-46bb-bd21-ff5ed2db2c49` | Creator-owned: Creator Schedule replacement; Ownership and signed contract were verified in the PROtv Creator Agent before Administrator-approved publishing. |

## 3. Film basis verified, material items open

| Title | ID | Open items |
| --- | --- | --- |
| The Battle of Midway (1942) | `2OTfk1MA9SNAJcXQajCl` | Confirm Fox did not hold copyright in the released version (renewal window 1969–70 is not online) |
| The Little Shop of Horrors (1960) | `3NAU6BldsmCNs9wjM08a` | Santa Clara Productions registered the film in 1985 (PA0000301210); a later registration cannot restore a work published without notice, but it signals a claimant; 2025 registration by Grandave Renew, LLC (PAu004285538) covers a new version only |
| Elephants Dream (2006) | `6wWGoL2qWRqtCmCTSRQY` | Public Rights note says CC BY 3.0; the license is 2.5 |
| Plan 9 from Outer Space (1957) | `B2MDEH2b25NknMQMEhoM` | Legend Films registered a colorized version (2007); use the black-and-white original |
| Captain Kidd (1945) | `CmN3oev0txAoerdvsjCb` | Renewal RE0000568672 (1992) is a UPA cartoon, not this film |
| Detour (1945) | `IHkqDr5bGIY0Nw5Lhkky` | Academy Film Archive 2018 restoration: confirm PROtv copy is not the restoration; Based on the 1939 novel by Martin Goldsmith; the novel's renewal status is not established (derivative-work risk) |
| The Blood of Jesus (1941) | `PqGsChF8xtTQdaQFEWQI` | Renewal window (1968–69) is not in the online records; not independently checked |
| The Brain That Wouldn't Die (1962) | `RwDe3WkIWoHQ1EUzfWn9` | Rex Carlton Productions registered the film in 1988 (PA0000399511); Synapse (2013) and Flagship (2021) registered new versions |
| Carnival of Souls (1962) | `WIVB9NPQQzvtvjTBsiKw` | Foreign release carried a notice and was protected overseas (Wikipedia): US only; Rights dispute 1990–95; Criterion lists copyright by Harold Harvey and John Clifford; 1996 director's version registered (PA0000827002): use the 1962 theatrical cut |
| D.O.A. (1950) | `WMmLodEvI2gpEVW9v6yL` | Catalog links the wrong IMDb title (Darah dan Doa, 1950) and shows its rating on the website |
| The Phantom of the Opera (1925) | `WeNPJRItOH2nOdbwLkDG` | PROtv copy has a music soundtrack; restorations with modern scores are registered (e.g. Film Preservation Associates 1996, PA0000802742); Catalog links the wrong IMDb title (2004 film) and shows its 7.2 rating on the website |
| Within Our Gates (1920) | `XMj306OZSbomES2Zz0Fz` | PROtv copy has a music soundtrack of unknown source; Catalog year is wrong (1927; the film is 1920) |
| Jungle Book 1942 | `aFRblRPxcp3LEm1lf4ye` | Produced by the US company Alexander Korda Films, Inc. (no foreign-restoration issue indicated); Maturity rating PG has no recorded source (the film predates MPAA ratings) |
| Angel and the Badman (1947) | `aIZ4FeTCPjuTlycMgxiK` | Colorized version registered 1991 (PA0000523396): use the black-and-white original |
| Body and Soul (1925) | `biitnhJJnBvHGFx8TJZC` | PROtv copy has a music soundtrack (measured); the score is not 1925 and its source and rights are unknown |
| The Bronze Buckaroo (1939) | `goOpjlfjJF3YWw5dlHqe` | Single reviewed source; Viking Entertainment registered a 1990 video edition (PA0000548771) |
| Big Buck Bunny (2008) | `hKPU3JNJ4faWLgWE6ZSq` | The separately released score is CC BY-NC-ND 3.0; the film as released (with its soundtrack) is CC BY 3.0 |
| House on Haunted Hill (1959) | `p532d2Aqpb3bC2rvYkQw` | No Wikipedia statement; colorized (Legend Films 2007) and 2025 Grandave Renew registrations: use the black-and-white original |
| The Scar of Shame (1927) | `tuwoR1lZN8VnSTCSEiTc` | PROtv copy has a music soundtrack; Video Yesteryear registered a 1995 edition (PA0000741769) that may include a copyrighted score |
| A Day in the Life of a Coal Miner (1910) | `u3dXF1OlGIXiRPAHz3hE` | British film (Kineto, Charles Urban; sponsored by the London & North Western Railway): BFI Screenonline http://www.screenonline.org.uk/film/id/809895/ . US status rests on the 1910 date; UK status not reviewed (US-only launch); PROtv synopsis wrongly describes it as American |
| Africa Screams (1949) | `uvRcBLWVKxLyHsswVZOo` | Colorized versions registered (1988, 2005): use the black-and-white original |
| Night of the Living Dead (1968) | `zGpbFWvSaup6ioUaoqsN` | Image Ten registered a 2017 restoration (PA0002026041): confirm PROtv copy is not the restoration |

## 4. Unresolved (live; evidence queue)

| Title | ID | Tier | Evidence still required |
| --- | --- | --- | --- |
| The Duke Is Tops (1938) | `1l1uGB4v8CaUr9p4TTGv` | C | Owner/counsel: check the 1965–66 Catalog of Copyright Entries renewals. Renewal window (1965–66) is not online; no primary record checked |
| One Step Beyond - The Storm | `5FHvg3BEwBlk9qqNdZT5` | C | Owner/counsel: confirm this episode is public domain, or remove. "The storm (One step beyond)" is listed in a 1992 recorded assignment of a 25,606-title TV catalog (V2826P703); Which episodes CBS still holds is not established |
| Murder in Harlem (1935) | `6h3blkiA6LTeLv66jj1v` | C | Owner/counsel: CCE renewal check, or remove until verified. No Wikipedia, Wikidata or Commons statement; Renewal window (1962–63) is not online |
| The Incredible Petrified World (1959) | `MZ6Q6DI2S62pP8laH9Ku` | C | Keep with owner sign-off, or confirm notice/registration history. No Wikipedia, Wikidata or Commons statement |
| The Girl from Chicago (1932) | `Ts881xyfGAz4E4TZHIeg` | C | Owner/counsel: CCE renewal check, or remove until verified. No Wikipedia, Wikidata or Commons statement; Renewal window (1959–60) is not online |
| Big Timers (1945) | `dKxiQCeBcuT92BKv9dgJ` | C | Owner/counsel: CCE renewal check, or remove until verified. No Wikipedia, Wikidata or Commons statement; Renewal window (1972–73) is not online |
| The Bundy Chronicles | `sqKR6c5Cq7MD9lg1GDxG` | D | Kept available. Owner: record the rights holder (and the AI tools' commercial-use terms) or provide the agreement. No creator request, contract reference, creator ID or agreement exists in Firestore; uploaded directly on 2026-09-13 by the admin account that also confirms public-domain sources; Labelled "PROtv exclusive" in AI Cinema: consistent with PROtv's own production, but authorship and tool terms are not recorded |
| The Exile (1931) | `uzZVSNOg0sOZaTk4tlV6` | C | Owner/counsel: CCE renewal check, or remove until verified. No Wikipedia, Wikidata or Commons statement; Renewal window (1958–59) is not online |
| Sita Sings the Blues (2008) | `vuvTzWOcVJJeg12CsTq9` | D | Kept available (official terms permit showing the unaltered film). Counsel question only. Official site: film CC0; "Some of the songs in Sita Sings the Blues are not free"; 11 songs licensed so they may be heard "in the context of the original film"; others may "show" and "broadcast" the film; payments apply per DVD sold; The 1920s Hanshaw recordings remain federally protected until 2027-2030; whether streaming needs anything beyond the published terms is a question for counsel |

## 5. Earlier admin-confirmed public-domain records

Ingested before this review with "Administrator confirmed the source
evidence"; their evidence is the source item's license label, which is set
by uploaders (the Method section of rights-evidence.md shows such labels can be
wrong). Re-review recommended; not restricted.

| Title | ID | Source on record |
| --- | --- | --- |
| Woman on the Run (1950) | `9P2whdYluJRAJeI6cOuh` | Wikimedia Commons https://commons.wikimedia.org/wiki/File:Woman_On_The_Run_1950.webm (Public domain) |
| Parker Solar Probe | `BcyriYT9mIQj4ZDd9jFr` | Wikimedia Commons https://commons.wikimedia.org/wiki/File:Parker_Solar_Probe_Countdown_to_T-Zero_in_4K_-_Flying_Faster,_Hotter_and_Closer_Than_Ever_to_the_Sun.webm (Public domain) |
| Cavalcade of Stars | `FOn1pIGiBKaUb89oE6Gm` | Internet Archive https://archive.org/details/Cavalcade_Of_Stars (Public Domain Mark) |
| His Girl Friday (1940) | `LiMNMZWXBxJj3LoP73kU` | Internet Archive https://archive.org/details/HisGirlFriday1940_201711 (Public Domain Mark) |
| KIPHO | `hFVcdczhgn8dT3cZcXAR` | Wikimedia Commons https://commons.wikimedia.org/wiki/File:KIPHO.webm (Public domain) |
| Fleischer Studios' Superman | `iUX01XuVHd9okFW4gmqR` | Internet Archive https://archive.org/details/fleischer-superman (Public Domain Mark) |
| Looney Tunes Classics: Collection | `lussNXvK08RN9xtfq4wN` | Internet Archive https://archive.org/details/looney-tunes-classics-public-domain-collection (Public Domain Mark) |
| Superman cartoons | `morl7jrTRiEF2ihf282A` | Internet Archive https://archive.org/details/SupermanCartoons (Public Domain Mark) |
| Merri Melodies shorts | `v_1789872561270_i3svw5cbz` | Internet Archive https://archive.org/details/ltmm-publicdomain (Public Domain Mark) |
| NASA's Documentary Film - Hubble25 | `vmsxoXY005wf3SwsfF7F` | Wikimedia Commons https://commons.wikimedia.org/wiki/File:NASA%27s_Documentary_Film_-_Hubble25.webm (Public domain) |

Specific follow-ups: Looney Tunes Classics: Collection and Merri Melodies
shorts (identify the exact short in each video; public-domain status is per
short, and redrawn colorized versions may be protected).

## 6. Evidence queue (in priority order)

1. Silent-film scores: identify the score on Body and Soul, The Scar of
   Shame, Within Our Gates and The Phantom of the Opera (source file
   credits), or replace them with a public-domain or licensed score.
2. Tier C titles: a Catalog of Copyright Entries renewal search for the
   renewal year shown in rights-evidence.md (The Duke Is Tops, Murder in
   Harlem, The Girl from Chicago, The Exile, Big Timers), and the One Step
   Beyond episode status with CBS.
3. Source copies: record the source file or URL for every title, and
   confirm the original release where rights-evidence.md lists a
   restoration or colorized version.
4. Sita Sings the Blues: counsel confirms the published music terms cover
   streaming.
5. The Bundy Chronicles: owner records the rights holder (and the AI tools'
   commercial-use terms).
6. Re-review the earlier admin-confirmed records (section 5).

## 7. Recommended US launch catalog

The 49 titles live today, all playable (verified by the catalog
check after each batch). Tier C and section 5 titles stay live under the
existing owner confirmation and are first in the evidence queue. If counsel
prefers a narrower launch, restrict the tier C titles with the same
reversible workflow.
