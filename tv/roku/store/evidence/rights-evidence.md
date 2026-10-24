# Rights evidence: the 43 titles without structured rights records

**Research file for the owner and counsel, 2026-10-23. Not a legal opinion.**
Applied 2026-10-23 (owner-authorized): structured film-status fields for tiers
A and B, evidence records for all 43 titles (Firestore
`titleRightsEvidence`), and 7 reversible restrictions. See
store/RIGHTS-REPORT.md. Companion files: `rights-evidence.csv` (one row per
title) and `proposed-rights-fields.json` (the structured values that were
applied).

## Method

For every title PROtv stores as `copyrightStatus: unknown`:

1. **Identity:** matched by IMDb ID to Wikidata, or by title and year where the
   catalog has no IMDb ID or a wrong one (2 wrong IDs found; see the metadata
   proposal).
2. **Secondary sources:** Wikidata copyright status with its determination
   method; English Wikipedia statements; Wikipedia's sourced *List of films in
   the public domain in the United States*; Wikimedia Commons license review
   (the file's legal-basis category).
3. **Primary source:** US Copyright Office public records
   (publicrecords.copyright.gov), searched by title for registrations,
   **renewals** (RE/R numbers) and recorded transfers. Online records start
   in 1978, so they cover renewals for films first published 1950–1963.
   Earlier renewals are only in the printed *Catalog of Copyright Entries*
   (CCE) and were **not** checked.
4. **PROtv's own copy:** live HLS manifests checked for audio; the silent
   films were measured for sound (all four carry a music score).
5. **Origin:** Wikidata country of origin and source work, for foreign-work
   restoration (URAA, 17 USC 104A) and derivative-work risks.

Internet Archive "Public Domain Mark" labels are set by uploaders. *The Brain
from Planet Arous* carries them although its copyright was renewed, so they
are listed for reference only and never counted as evidence.

## Result

| Tier | Titles | Meaning | Recommended |
| --- | --- | --- | --- |
| A — documentary basis | 9 | Date of publication, or a license stated by the rights holder | Keep; resolve the noted soundtrack and attribution items |
| B — multiple independent sources | 19 | Two or more independent sources agree on the basis; no contrary record found | Keep for the US; confirm the source copy where flagged |
| C — weak or single source | 7 | Only one secondary source, or uploader labels | Owner sign-off or a CCE renewal search before launch |
| D — contrary evidence or unresolved third-party rights | 8 | A record contradicts the claim, or third-party rights (music, footage, novel, agreement) are unresolved | Counsel decision; remove if unresolved |

### Highest-priority findings

1. **RESTRICTED 2026-10-23 — The Brain from Planet Arous (1957):** renewal
   **RE0000258469** (1985-09-03, Howco Productions) renews LP0000009453
   (1957-11-27) for this film; an assignment and an exclusive license were
   recorded in 2025. Protected in the US through 2052.
2. **RESTRICTED — Beat the Devil (1953):** Columbia registered the film in 2016
   (PA0001394584, published in the UK 1953-11-26, the pattern for a URAA
   restoration); the source novel was renewed (RE0000028779).
3. **RESTRICTED — The Last Man on Earth (1964):** based on *I Am Legend*,
   renewed RE0000141686 (1982), protected to 2049.
4. **RESTRICTED — The Plow That Broke the Plains and The River:** government
   films whose Virgil Thomson scores are renewed copyrights (R462214, 1969;
   R342616, 1964).
5. **RESTRICTED — Voyage to the Planet of Prehistoric Women (1968):** the
   stated basis is invalid for 1968 works, and the footage is mostly from a
   Soviet film eligible for URAA restoration.
6. **RESTRICTED (structured-record title) — 50 Classic Cartoons:** contains
   *The Unruly Hare* (Warner Bros., 1945), renewed 1972-10-25.
7. **Open, not restricted:** silent films carry modern scores of unknown
   origin (Body and Soul, The Scar of Shame, Within Our Gates, The Phantom of
   the Opera); Sita Sings the Blues (CC0 film; its official terms permit
   showing the unaltered film; recording rights are a counsel question); The
   Bundy Chronicles (no agreement on record; consistent with PROtv's own
   production).

### Copy checks the owner can do from the source files

Several titles are public domain only in their original release; restored,
colorized or re-cut versions were registered later. Confirm PROtv's copy is
the original black-and-white theatrical release for Plan 9 from Outer Space,
Angel and the Badman, Africa Screams and House on Haunted Hill, and is not
the 2017 restoration of Night of the Living Dead, the 2018 restoration of
Detour, the 1996 director's version of Carnival of Souls or the Sony
restoration of Beat the Devil.

## Per-title evidence

### Tier A — documentary basis

#### A Day in the Life of a Coal Miner (1910) — `u3dXF1OlGIXiRPAHz3hE`

- **Basis:** Published 1910 (US term expired; works published before 1931 are public domain in the US)
- **Origin / audio:** not recorded; no audio
- **Risk:** British film (Kineto, Charles Urban; sponsored by the London & North Western Railway): BFI Screenonline http://www.screenonline.org.uk/film/id/809895/ . US status rests on the 1910 date; UK status not reviewed (US-only launch)
- **Risk:** PROtv synopsis wrongly describes it as American
- **Recommended:** Keep (US). Record the source copy URL; correct the synopsis and category.

#### Big Buck Bunny (2008) — `hKPU3JNJ4faWLgWE6ZSq`

- **Basis:** CC BY 3.0, stated by the copyright holder (Blender Foundation)
- **Origin / audio:** Netherlands; audio track
- Wikidata [Q282456](https://www.wikidata.org/wiki/Q282456): licensed under Creative Commons [stated by copyright holder at source website] (worldwide)
- Wikipedia [article](https://en.wikipedia.org/wiki/Big_Buck_Bunny): "It was released as an open-source film under the Creative Commons Attribution 2."
- Commons [file](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm): CC BY 3.0 (CC-BY-3.0)
- Internet Archive (uploader labels, not evidence of status): [BigBuckBunny1280x720Stereo](https://archive.org/details/BigBuckBunny1280x720Stereo) no license
- **Risk:** The separately released score is CC BY-NC-ND 3.0; the film as released (with its soundtrack) is CC BY 3.0
- **Recommended:** Keep worldwide with attribution.

#### Body and Soul (1925) — `biitnhJJnBvHGFx8TJZC`

- **Basis:** Published 1925 (US term expired)
- **Origin / audio:** United States; audio track
- Wikidata [Q4936871](https://www.wikidata.org/wiki/Q4936871) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Body_and_Soul_(1925_film))
- Commons [file](https://commons.wikimedia.org/wiki/File:Body_and_Soul_(1925).webm): Public domain (PD US expired)
- Internet Archive (uploader labels, not evidence of status): [body-and-soul_202107](https://archive.org/details/body-and-soul_202107) no license
- **Risk:** PROtv copy has a music soundtrack (measured); the score is not 1925 and its source and rights are unknown
- **Recommended:** Keep the film; identify the score (or replace with a public-domain/licensed score).

#### Elephants Dream (2006) — `6wWGoL2qWRqtCmCTSRQY`

- **Basis:** CC BY 2.5, stated by the copyright holder (Wikidata, Commons)
- **Origin / audio:** Netherlands; audio track
- Wikidata [Q825197](https://www.wikidata.org/wiki/Q825197): Creative Commons Attribution 2.5 Generic; copyrighted [stated by copyright holder at source website] (worldwide)
- Wikipedia [article](https://en.wikipedia.org/wiki/Elephants_Dream): "The film itself, along with the other Blender Foundation “open movies,” was released under the Creative Commons Attribution License, so that viewers may learn from it and use it as long as proper attr"
- Commons [file](https://commons.wikimedia.org/wiki/File:Elephants_Dream_(2006).webm): CC BY 2.5 (CC-BY-2.5)
- Internet Archive (uploader labels, not evidence of status): [ElephantsDream](https://archive.org/details/ElephantsDream) CC licenses/by/3.0/us
- **Risk:** Public Rights note says CC BY 3.0; the license is 2.5
- **Recommended:** Keep worldwide with attribution; correct the note to 2.5.

#### Sintel (2010) — `sCWQqVE5WIoNNN5wAGQ2`

- **Basis:** CC BY 3.0 (Wikidata, Commons)
- **Origin / audio:** Netherlands; audio track
- Wikidata [Q925587](https://www.wikidata.org/wiki/Q925587): copyrighted [http://www.wikidata.org/.well-known/genid/3526dca040461e38069e1d0772db8b24]
- Wikipedia [article](https://en.wikipedia.org/wiki/Sintel): "Both the final product and production data, including animation data, characters and textures are released under the Creative Commons Attribution License."
- Commons [file](https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm): CC BY 3.0 (CC-BY-3.0)
- **Recommended:** Keep worldwide with attribution.

#### Tears of Steel (2012) — `gbcxmtl6mAHQeBxx8Dgs`

- **Basis:** CC BY 3.0 (Wikidata, Commons)
- **Origin / audio:** Netherlands; audio track
- Wikidata [Q1173161](https://www.wikidata.org/wiki/Q1173161): copyrighted
- Wikipedia [article](https://en.wikipedia.org/wiki/Tears_of_Steel): "The film itself and any material made in the studio are released under the Creative Commons Attribution License."
- Commons [file](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm): CC BY 3.0 (CC-BY-3.0, Files from external sources with reviewed licenses)
- **Recommended:** Keep worldwide with attribution.

#### The Phantom of the Opera — `WeNPJRItOH2nOdbwLkDG`

- **Basis:** Published 1925 (Wikidata: "published more than 95 years ago", US); Wikipedia: Universal did not renew in 1953
- **Origin / audio:** United States; audio track; based on The Phantom of the Opera by Gaston Leroux (1910)
- Wikidata [Q927919](https://www.wikidata.org/wiki/Q927919): public domain [published more than 95 years ago] (countries which use the rule of the shorter term); public domain [published more than 95 years ago] (United States)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Phantom_of_the_Opera_(1925_film)): "In 1953, the film entered the public domain in the United States because the film's distributor Universal Pictures did not renew its copyright registration in the 28th year after publication."
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Phantom_of_the_Opera_(1925)_reissue_1929.webm): Public domain (CC-PD-Mark, PD-old-70-expired)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Phantom_of_the_Opera_(1925)_preview.webm): Public domain (CC-PD-Mark, PD-old-80-expired, PD-old missing SDC copyright status)
- Internet Archive (uploader labels, not evidence of status): [ThePhantomOfTheOpera1925NewYorkGeneralReleasePrint_620](https://archive.org/details/ThePhantomOfTheOpera1925NewYorkGeneralReleasePrint_620) no license; [ThePhantomOfTheOpera_201612](https://archive.org/details/ThePhantomOfTheOpera_201612) no license; [ThePhantomoftheOpera](https://archive.org/details/ThePhantomoftheOpera) CC licenses/publicdomain; [el-fantasma-de-la-opera-1925-sub-espanol](https://archive.org/details/el-fantasma-de-la-opera-1925-sub-espanol) no license
- **Risk:** PROtv copy has a music soundtrack; restorations with modern scores are registered (e.g. Film Preservation Associates 1996, PA0000802742)
- **Risk:** Catalog links the wrong IMDb title (2004 film) and shows its 7.2 rating on the website
- **Recommended:** Keep the film; identify the score; fix IMDb link.

#### The Scar of Shame (1927) — `tuwoR1lZN8VnSTCSEiTc`

- **Basis:** Published 1927 (US term expired); Commons "PD US expired"
- **Origin / audio:** United States; audio track
- Wikidata [Q7762389](https://www.wikidata.org/wiki/Q7762389) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Scar_of_Shame)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Scar_of_Shame_(1929)_by_Frank_Peregini.webm): Public domain (Media uploaded for Public Domain Day 2025, PD US expired)
- Internet Archive (uploader labels, not evidence of status): [the-scar-of-shame_1927](https://archive.org/details/the-scar-of-shame_1927) no license
- **Risk:** PROtv copy has a music soundtrack; Video Yesteryear registered a 1995 edition (PA0000741769) that may include a copyrighted score
- **Recommended:** Keep the film; identify the score.

#### Within Our Gates [1920] — `XMj306OZSbomES2Zz0Fz`

- **Basis:** Published 1920 (Wikidata: "published more than 95 years ago", US)
- **Origin / audio:** United States; audio track
- Wikidata [Q2517806](https://www.wikidata.org/wiki/Q2517806): public domain [published more than 95 years ago] (United States)
- Wikipedia [article](https://en.wikipedia.org/wiki/Within_Our_Gates)
- Commons [file](https://commons.wikimedia.org/wiki/File:Within_Our_Gates_HQ.webm): Public domain (PD US)
- Internet Archive (uploader labels, not evidence of status): [WithinOurGates](https://archive.org/details/WithinOurGates) CC publicdomain/zero/1.0; [silent-within-our-gates](https://archive.org/details/silent-within-our-gates) no license
- **Risk:** PROtv copy has a music soundtrack of unknown source
- **Risk:** Catalog year is wrong (1927; the film is 1920)
- **Recommended:** Keep the film; identify the score; correct year.

### Tier B — multiple independent sources

#### Africa Screams (1949) — `uvRcBLWVKxLyHsswVZOo`

- **Basis:** Copyright not renewed (Wikipedia: "fell into the public domain in 1977"; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q23892](https://www.wikidata.org/wiki/Q23892): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Africa_Screams): "The film entered the public domain in 1977."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Africa_Screams_(1949).webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [AfricaScreams720p1949](https://archive.org/details/AfricaScreams720p1949) no license; [AfricaScreams](https://archive.org/details/AfricaScreams) CC licenses/publicdomain
- **Risk:** Colorized versions registered (1988, 2005): use the black-and-white original
- **Recommended:** Keep.

#### Angel and the Badman (1947) — `aIZ4FeTCPjuTlycMgxiK`

- **Basis:** Copyright not renewed (Wikipedia: NTA did not renew in 1975; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q645771](https://www.wikidata.org/wiki/Q645771): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Angel_and_the_Badman): "In 1975, the film entered the public domain in the United States because National Telefilm Associates did not renew its copyright registration 28 years after its release."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Angel_and_the_Badman_(1947)_by_James_Edward_Grant.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [angelandthebadman1947](https://archive.org/details/angelandthebadman1947) no license; [angel_and_the_badman](https://archive.org/details/angel_and_the_badman) CC licenses/publicdomain
- **Risk:** Colorized version registered 1991 (PA0000523396): use the black-and-white original
- **Recommended:** Keep.

#### Angel on My Shoulder (1946) — `KS5fwSoYxy8h3FkrTWW3`

- **Basis:** Copyright not renewed (Wikipedia: "U.S. copyright expired in 1973"); Commons file dedicated CC0
- **Origin / audio:** United States; audio track
- Wikidata [Q1770219](https://www.wikidata.org/wiki/Q1770219) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Angel_on_My_Shoulder): "== Cast == == Copyright status and remakes == The film’s U."
- Commons [file](https://commons.wikimedia.org/wiki/File:Angel_on_My_Shoulder_(1946).webm): CC0 (CC-Zero)
- Internet Archive (uploader labels, not evidence of status): [AngelOnMyShoulder_43](https://archive.org/details/AngelOnMyShoulder_43) CC publicdomain/mark/1.0; [angelOnMyShoulder](https://archive.org/details/angelOnMyShoulder) CC licenses/publicdomain; [angel-on-my-shoulder-1946-720p](https://archive.org/details/angel-on-my-shoulder-1946-720p) CC publicdomain/mark/1.0; [angel_on_my_shoulder](https://archive.org/details/angel_on_my_shoulder) CC licenses/publicdomain
- **Recommended:** Keep.

#### Attack of the Giant Leeches (1959) — `ZIWIKF2lyh7hJCcRkPLr`

- **Basis:** Copyright not renewed (Wikipedia; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q4817961](https://www.wikidata.org/wiki/Q4817961): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Attack_of_the_Giant_Leeches): "Attack of the Giant Leeches is now in the public domain; its copyright was never renewed."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Attack_of_the_Giant_Leeches_(1959)_by_Bernard_L._Kowalski.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [cco_attackofthegiantleeches](https://archive.org/details/cco_attackofthegiantleeches) CC licenses/publicdomain; [AttackOfTheGiantLeeches1959](https://archive.org/details/AttackOfTheGiantLeeches1959) CC licenses/publicdomain; [AttackOfTheGiantLeeches_201711](https://archive.org/details/AttackOfTheGiantLeeches_201711) CC publicdomain/mark/1.0; [AttackOfTheGiantLeeches](https://archive.org/details/AttackOfTheGiantLeeches) CC licenses/publicdomain
- **Copyright Office:** No renewal in the online Copyright Office records (renewal due 1987)
- **Recommended:** Keep.

#### Captain Kidd (1945) — `CmN3oev0txAoerdvsjCb`

- **Basis:** Copyright not renewed (Wikipedia: "producers neglected to renew the copyright in 1972"; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q839419](https://www.wikidata.org/wiki/Q839419): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Captain_Kidd_(film)): "It has entered the public domain because the producers neglected to renew the copyright in 1972."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Captain_Kidd_(1945)_by_Rowland_V._Lee%2C_colorized.webm): Public domain (PD US not renewed)
- Commons [file](https://commons.wikimedia.org/wiki/File:Captain_Kidd_(1945)_by_Rowland_V._Lee.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [CaptainKidd_](https://archive.org/details/CaptainKidd_) CC licenses/publicdomain
- **Risk:** Renewal RE0000568672 (1992) is a UPA cartoon, not this film
- **Recommended:** Keep.

#### Carnival of Souls (1962) — `WIVB9NPQQzvtvjTBsiKw`

- **Basis:** US release prints lacked a copyright notice (Wikipedia; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q1852671](https://www.wikidata.org/wiki/Q1852671): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Carnival_of_Souls): "While the US release of Carnival of Souls failed to include a copyright on the prints, automatically placing them in the public domain, the foreign release marketed by Walter Manley did contain a copy"
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Carnival_of_Souls_(1962)_by_Herk_Harvey.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [CarnivalOfSouls1962](https://archive.org/details/CarnivalOfSouls1962) CC licenses/by/3.0; [CarnivalOfSouls_ipod](https://archive.org/details/CarnivalOfSouls_ipod) CC licenses/publicdomain; [CarnivalOfSouls_823](https://archive.org/details/CarnivalOfSouls_823) no license; [CarnivalOfSouls_201508](https://archive.org/details/CarnivalOfSouls_201508) CC publicdomain/mark/1.0
- **Risk:** Foreign release carried a notice and was protected overseas (Wikipedia): US only
- **Risk:** Rights dispute 1990–95; Criterion lists copyright by Harold Harvey and John Clifford; 1996 director's version registered (PA0000827002): use the 1962 theatrical cut
- **Recommended:** Keep, US only; confirm theatrical cut.

#### D.O.A. (1950) — `WMmLodEvI2gpEVW9v6yL`

- **Basis:** Copyright not renewed (Wikipedia: "due to a filing error"; Commons; Wikipedia PD list, renewal year 1977)
- **Origin / audio:** United States; audio track
- Wikidata [Q585983](https://www.wikidata.org/wiki/Q585983) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/D.O.A._(1949_film)): "Due to a filing error, the copyright to the film was not renewed on time, causing it to fall into the public domain: it was subsequently remade as Color Me Dead (1969), D."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:DOA%2C_1949.ogv): Public domain (PD US not renewed)
- **Risk:** Catalog links the wrong IMDb title (Darah dan Doa, 1950) and shows its rating on the website
- **Recommended:** Keep; fix IMDb link.

#### Detour (1945) — `IHkqDr5bGIY0Nw5Lhkky`

- **Basis:** Copyright not renewed (Commons; Wikipedia PD list; Wikipedia: "today is in the public domain")
- **Origin / audio:** United States; audio track; based on Detour by Martin Goldsmith
- Wikidata [Q2062566](https://www.wikidata.org/wiki/Q2062566): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Detour_(1945_film)): "The film, which today is in the public domain and freely available for viewing at various online sources, was restored by the Academy Film Archive in 2018."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Detour_(1945)_by_Edgar_G._Ulmer.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [detour1945HD](https://archive.org/details/detour1945HD) CC publicdomain/mark/1.0; [detour.-1945.1080p.-blu-ray.-remux.-avc.-lpcm.-1.0-fgt](https://archive.org/details/detour.-1945.1080p.-blu-ray.-remux.-avc.-lpcm.-1.0-fgt) CC publicdomain/mark/1.0; [Detour-WeirdnessBadMovie](https://archive.org/details/Detour-WeirdnessBadMovie) CC licenses/by-nd/3.0; [detour-1945-colorized-movie-720p-hd](https://archive.org/details/detour-1945-colorized-movie-720p-hd) CC publicdomain/mark/1.0
- **Risk:** Academy Film Archive 2018 restoration: confirm PROtv copy is not the restoration
- **Risk:** Based on the 1939 novel by Martin Goldsmith; the novel's renewal status is not established (derivative-work risk)
- **Recommended:** Keep (US); confirm source copy; counsel to check the novel.

#### Gulliver’s Travels (1939) — `t6Ii7hflAigcefjBRz3r`

- **Basis:** Copyright not renewed (Wikipedia: "failed to be renewed in 1967"; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track; based on Gulliver's Travels by Jonathan Swift (1726)
- Wikidata [Q246418](https://www.wikidata.org/wiki/Q246418): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/Gulliver's_Travels_(1939_film)): "=== Home media === Gulliver's Travels is currently in the public domain, as its copyright failed to be renewed in 1967."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Gulliver's_Travels_(1939).webm): Public domain (PD Old auto: author died less than 50 years ago, PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [GulliversTravels720p1939](https://archive.org/details/GulliversTravels720p1939) no license; [GulliversTravels720p_652](https://archive.org/details/GulliversTravels720p_652) CC publicdomain/zero/1.0; [GulliversTravels1939_201509](https://archive.org/details/GulliversTravels1939_201509) CC publicdomain/mark/1.0; [gullivers_travels1939_vostfr](https://archive.org/details/gullivers_travels1939_vostfr) no license
- **Recommended:** Keep.

#### House on Haunted Hill 1959 — `p532d2Aqpb3bC2rvYkQw`

- **Basis:** Public domain per Wikidata; no renewal found
- **Origin / audio:** United States; audio track
- Wikidata [Q263583](https://www.wikidata.org/wiki/Q263583): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/House_on_Haunted_Hill)
- Internet Archive (uploader labels, not evidence of status): [The_House_On_Haunted_Hill](https://archive.org/details/The_House_On_Haunted_Hill) CC licenses/publicdomain; [HouseOnHauntedHill1959](https://archive.org/details/HouseOnHauntedHill1959) CC licenses/by/3.0; [HouseOnHauntedHill-WeirdnessBadMovie](https://archive.org/details/HouseOnHauntedHill-WeirdnessBadMovie) CC licenses/by-nd/3.0; [HouseOnHauntedHill_201605](https://archive.org/details/HouseOnHauntedHill_201605) no license
- **Copyright Office:** No renewal in the online Copyright Office records (renewal due 1986–87)
- **Risk:** No Wikipedia statement; colorized (Legend Films 2007) and 2025 Grandave Renew registrations: use the black-and-white original
- **Recommended:** Keep.

#### Jungle Book 1942 — `aFRblRPxcp3LEm1lf4ye`

- **Basis:** Copyright not renewed (Commons; Wikipedia: "the film is in public domain")
- **Origin / audio:** United Kingdom, United States; audio track; based on The Jungle Book by Rudyard Kipling (1894)
- Wikidata [Q1167592](https://www.wikidata.org/wiki/Q1167592) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Rudyard_Kipling's_Jungle_Book): "Although the film is in public domain, the master 35mm elements are with ITV Studios Global Entertainment."
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Jungle_Book_(1942).webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [JungleBook](https://archive.org/details/JungleBook) CC licenses/publicdomain
- **Risk:** Produced by the US company Alexander Korda Films, Inc. (no foreign-restoration issue indicated)
- **Risk:** Maturity rating PG has no recorded source (the film predates MPAA ratings)
- **Recommended:** Keep; owner to confirm the PG source.

#### Night of the Living Dead (1968) — `zGpbFWvSaup6ioUaoqsN`

- **Basis:** Published without a copyright notice (Wikidata, Commons, Wikipedia, Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q623051](https://www.wikidata.org/wiki/Q623051): public domain [no copyright due to missing copyright notice] (United States)
- Wikipedia [article](https://en.wikipedia.org/wiki/Night_of_the_Living_Dead): "Since the film was mistakenly created without a copyright notice, it entered the public domain upon release, resulting in numerous adaptations, remakes, and a lasting legacy in the horror genre."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Night_Of_The_Living_Dead_(1968)_-_trailer.webm): Public domain (PD US no notice)
- Commons [file](https://commons.wikimedia.org/wiki/File:Night_of_the_Living_Dead_(1968).webm): Public domain (PD US no notice, PD audiovisual 50)
- Internet Archive (uploader labels, not evidence of status): [Night.Of.The.Living.Dead_1080p](https://archive.org/details/Night.Of.The.Living.Dead_1080p) CC licenses/publicdomain
- **Risk:** Image Ten registered a 2017 restoration (PA0002026041): confirm PROtv copy is not the restoration
- **Recommended:** Keep; confirm source copy.

#### Plan 9 from Outer Space (1957) — `B2MDEH2b25NknMQMEhoM`

- **Basis:** Copyright not renewed (Wikidata, US and rule-of-shorter-term countries; Commons; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q257515](https://www.wikidata.org/wiki/Q257515): public domain [copyright not renewed] (countries which use the rule of the shorter term); public domain [copyright not renewed] (United States)
- Wikipedia [article](https://en.wikipedia.org/wiki/Plan_9_from_Outer_Space)
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:Plan_9_from_Outer_Space_(1959_film).webm): Public domain (PD-US missing SDC copyright status, PD US not renewed)
- **Copyright Office:** No renewal in the online Copyright Office records (renewal due 1985–87)
- **Risk:** Legend Films registered a colorized version (2007); use the black-and-white original
- **Recommended:** Keep.

#### The Amazing Mr. X (1948) — `evCYYCPlc23BKzpmt2ug`

- **Basis:** Copyright not renewed (Commons; Wikipedia: "The film is in the public domain"; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q2177681](https://www.wikidata.org/wiki/Q2177681): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Amazing_Mr._X): "The film is in the public domain."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Amazing_Mr._X_(1948)_by_Bernard_Vorhaus.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [TheAmazingMr.X1948Avi](https://archive.org/details/TheAmazingMr.X1948Avi) CC licenses/publicdomain; [the-amazing-mr-x-1948-remastered-edition-720p-hd](https://archive.org/details/the-amazing-mr-x-1948-remastered-edition-720p-hd) CC publicdomain/mark/1.0; [amazing_mr_x](https://archive.org/details/amazing_mr_x) CC licenses/publicdomain
- **Recommended:** Keep.

#### The Battle of Midway (1942) — `2OTfk1MA9SNAJcXQajCl`

- **Basis:** Work of the US government: filmed by the US Navy under Commander John Ford (Wikipedia); distributed by 20th Century Fox
- **Origin / audio:** United States; audio track
- Wikidata [Q1795389](https://www.wikidata.org/wiki/Q1795389) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Battle_of_Midway_(film))
- Internet Archive (uploader labels, not evidence of status): [the_battle_of_midway](https://archive.org/details/the_battle_of_midway) CC licenses/publicdomain; [Battle.of.Midway.1942](https://archive.org/details/Battle.of.Midway.1942) CC licenses/publicdomain; [BattleOfMidway](https://archive.org/details/BattleOfMidway) CC licenses/publicdomain
- **Risk:** Confirm Fox did not hold copyright in the released version (renewal window 1969–70 is not online)
- **Recommended:** Keep; National Archives catalog record recommended as evidence.

#### The Blood of Jesus (1941) — `PqGsChF8xtTQdaQFEWQI`

- **Basis:** Copyright not renewed (Commons "PD US not renewed"; Wikipedia links the PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q151913](https://www.wikidata.org/wiki/Q151913) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Blood_of_Jesus): "== See also == List of films in the public domain in the United States == Notes == == External links == The Blood of Jesus essay by Mark S."
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Blood_of_Jesus_(1941)_by_Spencer_Williams.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [blood_of_jesus](https://archive.org/details/blood_of_jesus) CC licenses/publicdomain
- **Risk:** Renewal window (1968–69) is not in the online records; not independently checked
- **Recommended:** Keep.

#### The Brain That Wouldn't Die (1962) — `RwDe3WkIWoHQ1EUzfWn9`

- **Basis:** Published without a valid notice (Wikipedia; Commons "PD US no notice"; Wikipedia PD list)
- **Origin / audio:** United States; audio track
- Wikidata [Q129074](https://www.wikidata.org/wiki/Q129074): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Brain_That_Wouldn't_Die): "The film was in the public domain in the United States from the day of its release due to a flawed copyright notice."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Brain_That_Wouldn't_Die_(1962)_by_Joseph_Green.webm): Public domain (PD US no notice)
- Internet Archive (uploader labels, not evidence of status): [TheBrainThatWouldntDieTheatricalVersion82Min.](https://archive.org/details/TheBrainThatWouldntDieTheatricalVersion82Min.) CC publicdomain/mark/1.0; [TheBrainThatWouldntDie-ExtendedVersion1962](https://archive.org/details/TheBrainThatWouldntDie-ExtendedVersion1962) CC licenses/publicdomain; [TheBrainThatWouldntDie_300](https://archive.org/details/TheBrainThatWouldntDie_300) CC licenses/publicdomain; [TheBrainThatWouldntDie_165](https://archive.org/details/TheBrainThatWouldntDie_165) CC publicdomain/mark/1.0
- **Risk:** Rex Carlton Productions registered the film in 1988 (PA0000399511); Synapse (2013) and Flagship (2021) registered new versions
- **Recommended:** Keep (US). Counsel to note the 1988 registration.

#### The Bronze Buckaroo (1939) — `goOpjlfjJF3YWw5dlHqe`

- **Basis:** Copyright not renewed (Commons "PD US not renewed")
- **Origin / audio:** United States; audio track
- Wikidata [Q7720310](https://www.wikidata.org/wiki/Q7720310) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Bronze_Buckaroo)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Bronze_Buckaroo_(1939)_by_Richard_C._Kahn.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [bronze_buckaroo](https://archive.org/details/bronze_buckaroo) CC licenses/publicdomain
- **Risk:** Single reviewed source; Viking Entertainment registered a 1990 video edition (PA0000548771)
- **Recommended:** Keep; CCE renewal check for 1966–67 recommended.

#### The Little Shop of Horrors (1960) — `3NAU6BldsmCNs9wjM08a`

- **Basis:** Published without notice (Commons "PD US no notice"; Wikipedia: Corman "did not bother to copyright it"); also listed as not renewed
- **Origin / audio:** United States; audio track
- Wikidata [Q500296](https://www.wikidata.org/wiki/Q500296): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Little_Shop_of_Horrors): "Because Corman did not believe that The Little Shop of Horrors had much financial prospect after its initial theatrical run, he did not bother to copyright it, resulting in the film entering the publi"
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Little_Shop_of_Horrors_(1960)_by_Roger_Corman.webm): Public domain (PD US no notice)
- Internet Archive (uploader labels, not evidence of status): [Little_ShopOf_Horrors.avi](https://archive.org/details/Little_ShopOf_Horrors.avi) no license; [y-2-mate.is-little-shop-of-horrors-1960-1xg-p-9n-lk-plg-1080p-1629598400266](https://archive.org/details/y-2-mate.is-little-shop-of-horrors-1960-1xg-p-9n-lk-plg-1080p-1629598400266) no license; [TheLittleShopOfHorrorscolor1960](https://archive.org/details/TheLittleShopOfHorrorscolor1960) no license; [TheLittleShopOfHorrors1960_765](https://archive.org/details/TheLittleShopOfHorrors1960_765) CC publicdomain/mark/1.0
- **Risk:** Santa Clara Productions registered the film in 1985 (PA0000301210); a later registration cannot restore a work published without notice, but it signals a claimant
- **Risk:** 2025 registration by Grandave Renew, LLC (PAu004285538) covers a new version only
- **Recommended:** Keep (US). Counsel to note the 1985 registration.

### Tier C — weak or single source

#### Big Timers (1945) — `dKxiQCeBcuT92BKv9dgJ`

- **Basis:** Internet Archive uploader labels only
- **Origin / audio:** United States; audio track
- Wikidata [Q18149096](https://www.wikidata.org/wiki/Q18149096) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Big_Timers)
- Internet Archive (uploader labels, not evidence of status): [Big_Timers](https://archive.org/details/Big_Timers) CC licenses/publicdomain
- **Risk:** No Wikipedia, Wikidata or Commons statement
- **Risk:** Renewal window (1972–73) is not online
- **Recommended:** Owner/counsel: CCE renewal check, or remove until verified.

#### Murder in Harlem (1935) — `6h3blkiA6LTeLv66jj1v`

- **Basis:** Internet Archive uploader labels only (Public Domain Mark; one item labelled CC BY-NC-ND)
- **Origin / audio:** United States; audio track
- Wikidata [Q6937747](https://www.wikidata.org/wiki/Q6937747) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Murder_in_Harlem)
- Internet Archive (uploader labels, not evidence of status): [Murder_in_Harlem](https://archive.org/details/Murder_in_Harlem) CC licenses/by-nc-nd/3.0
- **Risk:** No Wikipedia, Wikidata or Commons statement
- **Risk:** Renewal window (1962–63) is not online
- **Recommended:** Owner/counsel: CCE renewal check, or remove until verified.

#### One Step Beyond - The Storm — `5FHvg3BEwBlk9qqNdZT5`

- **Basis:** Wikipedia: most One Step Beyond episodes are public domain; remaining copyrights belong to CBS Television Distribution
- **Origin / audio:** not recorded; audio track
- **Copyright Office:** No renewal in the online Copyright Office records (aired 1960-06-21; renewal due 1987–88)
- **Risk:** "The storm (One step beyond)" is listed in a 1992 recorded assignment of a 25,606-title TV catalog (V2826P703)
- **Risk:** Which episodes CBS still holds is not established
- **Recommended:** Owner/counsel: confirm this episode is public domain, or remove.

#### The Duke Is Tops (1938) — `1l1uGB4v8CaUr9p4TTGv`

- **Basis:** Wikipedia: "in the public domain in the U.S."; Internet Archive public-domain labels
- **Origin / audio:** United States; audio track
- Wikidata [Q7731174](https://www.wikidata.org/wiki/Q7731174) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Duke_Is_Tops): "The film is in the public domain in the U."
- Internet Archive (uploader labels, not evidence of status): [TheDukeisTops](https://archive.org/details/TheDukeisTops) CC licenses/publicdomain
- **Risk:** Renewal window (1965–66) is not online; no primary record checked
- **Recommended:** Owner/counsel: check the 1965–66 Catalog of Copyright Entries renewals.

#### The Exile (1931) — `uzZVSNOg0sOZaTk4tlV6`

- **Basis:** Internet Archive uploader labels only
- **Origin / audio:** United States; audio track
- Wikidata [Q12118747](https://www.wikidata.org/wiki/Q12118747) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Exile_(1931_film))
- **Risk:** No Wikipedia, Wikidata or Commons statement
- **Risk:** Renewal window (1958–59) is not online
- **Recommended:** Owner/counsel: CCE renewal check, or remove until verified.

#### The Girl from Chicago (1932) — `Ts881xyfGAz4E4TZHIeg`

- **Basis:** Internet Archive uploader label only
- **Origin / audio:** United States; audio track
- Wikidata [Q7736556](https://www.wikidata.org/wiki/Q7736556) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Girl_from_Chicago)
- **Risk:** No Wikipedia, Wikidata or Commons statement
- **Risk:** Renewal window (1959–60) is not online
- **Recommended:** Owner/counsel: CCE renewal check, or remove until verified.

#### The Incredible Petrified World (1959) — `MZ6Q6DI2S62pP8laH9Ku`

- **Basis:** Internet Archive uploader labels; no renewal found online
- **Origin / audio:** United States; audio track
- Wikidata [Q7741760](https://www.wikidata.org/wiki/Q7741760) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Incredible_Petrified_World)
- Internet Archive (uploader labels, not evidence of status): [TheIncrediblePetrifiedWorld](https://archive.org/details/TheIncrediblePetrifiedWorld) CC licenses/publicdomain
- **Copyright Office:** No renewal in the online Copyright Office records (renewal due 1985–88)
- **Risk:** No Wikipedia, Wikidata or Commons statement
- **Recommended:** Keep with owner sign-off, or confirm notice/registration history.

### Tier D — contrary evidence or unresolved third-party rights

#### Beat the Devil (1953) — `UPq8eJixIfLiKXPIOXRm`

- **Basis:** Unresolved: US public domain by non-renewal, but foreign production
- **Origin / audio:** United Kingdom, Italy, United States; audio track
- Wikidata [Q1470370](https://www.wikidata.org/wiki/Q1470370): public domain [copyright not renewed] (United States)
- Wikipedia [article](https://en.wikipedia.org/wiki/Beat_the_Devil_(film)): "Beat the Devil has been in the public domain for many years, its copyright having never been renewed."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Internet Archive (uploader labels, not evidence of status): [BeatTheDevil1953](https://archive.org/details/BeatTheDevil1953) CC licenses/publicdomain
- **Copyright Office:** No renewal in the online Copyright Office records (renewal due 1981)
- **Risk:** Columbia Pictures registered the film in 2016 (PA0001394584), stating publication in the United Kingdom on 1953-11-26: consistent with URAA restoration of a foreign work
- **Risk:** Columbia declaration recorded 1992 (V2677P365)
- **Risk:** Source novel by James Helvick renewed RE0000028779 (1979); protected to 2046
- **Recommended:** RESTRICTED 2026-10-23. Restore only with a license or a counsel opinion.

#### Sita Sings the Blues (2008) — `vuvTzWOcVJJeg12CsTq9`

- **Basis:** Film dedicated CC0 by Nina Paley (2013); music has third-party rights
- **Origin / audio:** United States; audio track
- Wikidata [Q739285](https://www.wikidata.org/wiki/Q739285): copyrighted
- Wikipedia [article](https://en.wikipedia.org/wiki/Sita_Sings_the_Blues): "=== Copyright problems === The film uses a number of 1920s Annette Hanshaw recordings."
- Commons [file](https://commons.wikimedia.org/wiki/File:Sita_Sings_the_Blues.webm): CC0 (CC-Zero, Creative Commons-licensed films without audio, Files from external sources with reviewed licenses)
- Internet Archive (uploader labels, not evidence of status): [Sita1080pFLAC](https://archive.org/details/Sita1080pFLAC) CC licenses/by-sa/3.0/us; [Sita_Sings_the_Blues](https://archive.org/details/Sita_Sings_the_Blues) CC publicdomain/zero/1.0
- **Risk:** Official site: film CC0; "Some of the songs in Sita Sings the Blues are not free"; 11 songs licensed so they may be heard "in the context of the original film"; others may "show" and "broadcast" the film; payments apply per DVD sold
- **Risk:** The 1920s Hanshaw recordings remain federally protected until 2027-2030; whether streaming needs anything beyond the published terms is a question for counsel
- **Recommended:** Kept available (official terms permit showing the unaltered film). Counsel question only.

#### The Brain from Planet Arous (1957) — `vyjpYtuEpOlCWzyzlaxM`

- **Basis:** Contrary evidence: copyright RENEWED
- **Origin / audio:** United States; audio track
- Wikidata [Q7719816](https://www.wikidata.org/wiki/Q7719816) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Brain_from_Planet_Arous)
- Internet Archive (uploader labels, not evidence of status): [brain-from-planet-arous-colorized](https://archive.org/details/brain-from-planet-arous-colorized) no license; [brain-from-planet-arous-1957](https://archive.org/details/brain-from-planet-arous-1957) no license
- **Risk:** RE0000258469 (1985-09-03, Howco Productions, Inc., PWH) is the renewal of LP0000009453 (1957-11-27), the registration of this motion picture
- **Risk:** Assignment V15035D376 (2025-05-29) and exclusive license V15035D451 (2025-06-02) recorded: rights actively managed
- **Risk:** Protected in the US through 2052
- **Recommended:** RESTRICTED 2026-10-23 (rights verification required). Keep restricted unless a license is obtained.

#### The Bundy Chronicles — `sqKR6c5Cq7MD9lg1GDxG`

- **Basis:** Note says "PROtv exclusive"; no agreement, rights holder or license on record
- **Origin / audio:** not recorded; audio track
- **Risk:** No creator request, contract reference, creator ID or agreement exists in Firestore; uploaded directly on 2026-09-13 by the admin account that also confirms public-domain sources
- **Risk:** Labelled "PROtv exclusive" in AI Cinema: consistent with PROtv's own production, but authorship and tool terms are not recorded
- **Recommended:** Kept available. Owner: record the rights holder (and the AI tools' commercial-use terms) or provide the agreement.

#### The Last Man on Earth (1964) — `s0Eu00ADQQZnAoknUpxx`

- **Basis:** Unresolved: 1964 Italian–US film based on a protected novel
- **Origin / audio:** Italy, United States; audio track; based on I Am Legend by Richard Matheson (1954)
- Wikidata [Q1242772](https://www.wikidata.org/wiki/Q1242772): public domain
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Last_Man_on_Earth_(1964_film)): "In the 1980s, the film entered the public domain."
- Listed in Wikipedia's [List of films in the public domain in the United States](https://en.wikipedia.org/wiki/List_of_films_in_the_public_domain_in_the_United_States)
- Commons [file](https://commons.wikimedia.org/wiki/File:The_Last_Man_on_Earth_(1964)_by_Ubaldo_Ragona_and_Sidney_Salkow.webm): Public domain (PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [TheLastManOnEarth_72](https://archive.org/details/TheLastManOnEarth_72) CC publicdomain/zero/1.0; [lastmanonearth-1964](https://archive.org/details/lastmanonearth-1964) CC publicdomain/mark/1.0
- **Risk:** Adaptation of I Am Legend, renewed RE0000141686 (1982-11-04); literary rights assigned to Warner Bros. (V2782P253, 1992); protected to 2049
- **Risk:** 1964 works were renewed automatically, so "not renewed" is not a valid basis
- **Risk:** Italian co-production: possible URAA restoration
- **Recommended:** RESTRICTED 2026-10-23. Restore only with a counsel opinion.

#### The Plow That Broke the Plains (1936) — `APlVZLmiQPIczS9uEbEd`

- **Basis:** Film: US government work (Resettlement Administration); score: Virgil Thomson
- **Origin / audio:** United States; audio track
- Wikidata [Q2480639](https://www.wikidata.org/wiki/Q2480639) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/The_Plow_That_Broke_the_Plains)
- Internet Archive (uploader labels, not evidence of status): [plow_that_broke_the_plains](https://archive.org/details/plow_that_broke_the_plains) CC licenses/publicdomain
- **Risk:** Virgil Thomson score: music published 1942 (EP105394) and renewed R462214 (1969), cited in V2569P419; assignments recorded 1990-91
- **Risk:** Streaming the soundtrack performs the protected composition
- **Recommended:** RESTRICTED 2026-10-23. Options: license the music (G. Schirmer publishes Thomson) or a counsel opinion.

#### The River (1938) — `tsq6EVuAjU7hf95yuGl8`

- **Basis:** Film: US government work (Farm Security Administration); score: Virgil Thomson
- **Origin / audio:** United States; audio track
- Wikidata [Q2067313](https://www.wikidata.org/wiki/Q2067313): public domain [determined by GLAM institution and stated at its website]; public domain [work of the federal government of the United States]; copyrighted [determined by GLAM institution and stated at its website]
- Wikipedia [article](https://en.wikipedia.org/wiki/The_River_(1938_film))
- Internet Archive (uploader labels, not evidence of status): [RiverThe1937_2](https://archive.org/details/RiverThe1937_2) CC licenses/publicdomain; [RiverThe1937](https://archive.org/details/RiverThe1937) CC licenses/publicdomain
- **Risk:** Virgil Thomson music: "The River; instrumental" renewal R342616 (1964), cited in V2569P442; suite renewal RE0000293855 (1986)
- **Risk:** Streaming the soundtrack performs the protected composition
- **Recommended:** RESTRICTED 2026-10-23. Options: license the music or a counsel opinion.

#### Voyage to the Planet of Prehistoric Women (1968) — `SWSvCl89kxWp2qMXHT3w`

- **Basis:** Unresolved: 1968 work and foreign footage
- **Origin / audio:** United States; audio track
- Wikidata [Q5223530](https://www.wikidata.org/wiki/Q5223530) (no copyright statement)
- Wikipedia [article](https://en.wikipedia.org/wiki/Voyage_to_the_Planet_of_Prehistoric_Women)
- Commons [file](https://commons.wikimedia.org/wiki/File:VoyagetothePlanetofPrehistoricWomen.webm): Public domain (Files from external sources with reviewed licenses, PD US not renewed)
- Internet Archive (uploader labels, not evidence of status): [VoyageToThePlanetOfPrehistoricWomen-WeirdnessBadMovie](https://archive.org/details/VoyageToThePlanetOfPrehistoricWomen-WeirdnessBadMovie) CC licenses/by-nd/3.0; [VoyagetothePlanetofPrehistoricWomen](https://archive.org/details/VoyagetothePlanetofPrehistoricWomen) CC licenses/publicdomain
- **Risk:** Stated basis ("not renewed") does not apply to 1968 works (automatic renewal, 17 USC 304(a)); public domain only if published without notice, which is undocumented
- **Risk:** Most footage from the Soviet film Planeta Bur (1962), eligible for URAA restoration (17 USC 104A)
- **Risk:** A 2020 bulk assignment (V9973D833) lists the title; the same document lists public-domain titles, so it is weak evidence on its own
- **Recommended:** RESTRICTED 2026-10-23. Restore only with evidence of publication without notice and clearance of the Planeta Bur footage.
