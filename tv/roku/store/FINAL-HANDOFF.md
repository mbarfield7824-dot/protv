# PROtv for Roku — final handoff (production frozen)

Prophecy Entertainment LLC, 2026-10-24. **Nothing has been deployed, merged,
replaced, restricted, published or submitted.** RC5 is unchanged:
`protv-roku-v1.0.0-rc5-candidate.zip`, SHA-256
`94fc56ce2ef411fa4c24c2439b55b7c49f4c6ced80b9838d62bb093eeb8812c7`
(12/12 automated test files pass; the owner reports it works on a Roku TV).
Full evidence: ROKU-LAUNCH-CATALOG.md. Change details:
remediation/CHANGE-MANIFEST.md.

## 1. The 28 cleared titles

"CCE" means the Catalog of Copyright Entries renewal volumes (1958–1977,
searched in full text and calibrated against known renewals). "USCO" means
the Copyright Office public records (1978 onward). "No music renewal" means
the music renewal volumes for the film's window were searched; for Africa
Screams, Angel and the Badman, Angel on My Shoulder, D.O.A. and The Amazing
Mr. X only January–June 1973–77 was available.

| # | Title | Rights evidence | Copy PROtv streams |
| --- | --- | --- | --- |
| 1 | A Day in the Life of a Coal Miner (1910) | Published 1910: US term expired | Archive digitization, silent, no audio (archive.org silent-a-day-in-the-life-of-a-coal-miner) |
| 2 | Africa Screams (1949) | No renewal in CCE film renewals, window 1976-77 | Black-and-white Nassour print (colorized versions not used) |
| 3 | Angel and the Badman (1947) | No renewal in CCE film renewals, window 1974-75 | Black-and-white Republic print (1991 colorized version not used) |
| 4 | Angel on My Shoulder (1946) | No renewal in CCE film renewals, window 1973-74 | archive.org angel_on_my_shoulder; no restoration marks |
| 5 | Attack of the Giant Leeches (1959) | No USCO renewal (window 1986-87); 1982 recordation references LP20359 | AIP print |
| 6 | Big Buck Bunny (2008) | CC BY 3.0 (Blender Foundation) | Official 480p release (archive.org BBB-480p) |
| 7 | Big Timers (1945) | No renewal in CCE film renewals, window 1972-73 | Original print, "Copyright 1945 by All American News" |
| 8 | Captain Kidd (1945) | No renewal in CCE film renewals, window 1972-73 | Original United Artists print |
| 9 | D.O.A. (1950) | No renewal in CCE film renewals, window 1976-77; no USCO renewal (1978 onward) | English Questar video print (distributor card at the end; optional trim) |
| 10 | Dead Air | Signed creator agreement (Firestore creatorContractReference) | Creator-supplied file |
| 11 | Elephants Dream (2006) | CC BY 2.5 (Orange Open Movie) | Official release ("orange open movie project" titles) |
| 12 | His Girl Friday (1940) | No renewal in CCE film renewals, window 1967-68; Columbia renewed The Amazing Mr. Williams (1939) in 1967, so that studio's renewals are present in the searched volume. Source play The Front Page (1928) is public domain | Original Columbia print (archive.org HisGirlFriday1940_201711; no Criterion material) |
| 13 | Jungle Book 1942 | No renewal in CCE film renewals, window 1969-70; Kipling source public domain | Original Technicolor print (archive.org JungleBook1942_201701) |
| 14 | Murder in Harlem (1935) | No renewal in CCE film renewals, window 1962-63 | Black-and-white print |
| 15 | Plan 9 from Outer Space (1957) | No USCO renewal (window 1986-87); 1981 registration PA0000102338 and bulk 2025 recordations (trailer) noted for counsel | Black-and-white DCA print (2007 colorized version not used) |
| 16 | Sintel (2010) | CC BY 3.0 (Blender Foundation) | Official film (archive.org tweakers001907, 888 s) |
| 17 | Tears of Steel (2012) | CC BY 3.0 (Blender Foundation, mango.blender.org/sharing) | Official release (Commons file, 734.06 s) |
| 18 | The Amazing Mr. X (1948) | No renewal in CCE film renewals, window 1975-76; also searched "The Spiritualist" | archive.org 1948-the-amazing-mr-x (VOSE upload); 8 frames incl. dialogue show no burned-in subtitles |
| 19 | The Battle of Midway (1942) | No renewal in CCE film renewals, window 1969-70; made by US Navy personnel | US Navy release ("Official United States Navy") |
| 20 | The Blood of Jesus (1941) | No renewal in CCE film renewals, window 1968-69 | Sack Amusement print |
| 21 | The Brain That Wouldn't Die (1962) | No USCO renewal (window 1989-90); 1988 registration PA0000399511 and later new versions noted for counsel | Old TV print (not the 2013 Synapse restoration) |
| 22 | The Bronze Buckaroo (1939) | No renewal in CCE film renewals, window 1966-67 | Original Hollywood Productions print (not the 1990 Viking edition) |
| 23 | The Duke Is Tops (1938) | No renewal in CCE film renewals, window 1965-66 | Original Million Dollar Productions print |
| 24 | The Exile (1931) | No renewal in CCE film renewals, window 1958-59; every 1931 work is public domain from 2027-01-01 | Library of Congress digitization |
| 25 | The Girl from Chicago (1932) | No renewal in CCE film renewals, window 1959-60 | Library of Congress digitization (federal) |
| 26 | The Incredible Petrified World (1959) | No USCO registration or renewal for the film (window 1986-88) | archive.org the-incredible-petrified-world-1959 |
| 27 | The Little Shop of Horrors (1960) | No USCO renewal (window 1987-88); later registrations are other works (1985 musical, 2008 colorized, 2025 new version) | Standard old print |
| 28 | The Lost Camp | Signed creator agreement (Firestore creatorContractReference) | Creator-supplied file |

Two of these need their poster replaced (section 3): His Girl Friday depicts
real performers, and The Duke Is Tops shows a realistic face that appears to. The Incredible Petrified World's
hotlinked poster is already withheld by the Roku app.

## 2. The four proposed restrictions (website and Fire TV)

Roku already excludes them once item A below is deployed. They remain live on
the website and Fire TV.

| Title | Specific rights concern |
| --- | --- |
| Gulliver's Travels (1939) | The film was not renewed, but its songs were renewed in 1966 by Famous Music Corp. and Sammy Timberg ("Faithful Forever", "Bluebirds in the Moonlight", "All's Well", "I Hear a Dream", "It's a Hap-Hap-Happy Day" and others; e.g. R397319, R397320). Protected through 2034. Streaming the film performs them |
| House on Haunted Hill (1959) | Copyright Office renewal RE0000318809 (1986-01-12, Revival Pictures) for the film, and RE0000309723 for its title song |
| Woman on the Run (1950) | Score renewal RE0000909148 (Bruin Music Company, for composer John Carl Parker). Every copy carries the score |
| "Merri Melodies shorts" = "You're Too Careless with Your Kisses!" (1932) | Title song (Mort Dixon & Harry Woods, EP29967) renewed 6–7 May 1959 (R236180, R236532). Protected through 2027; eligible 2028-01-01 |

## 3. Six media replacements and three poster updates

| Title | Problem in the current copy | Verified replacement |
| --- | --- | --- |
| Detour (1945) | 2018 Academy Film Archive restoration, from a Blu-ray rip | Original PRC print, archive.org `Detour/Detour.MPEG` (2007), SHA-1 `6ab29d86…36ed` |
| Carnival of Souls (1962) | Criterion/Janus release (Blu-ray rip) | Herts-Lion theatrical print, archive.org `CarnivalOfSouls720p1962` (2012), SHA-1 `814775ff…12afd6` |
| Night of the Living Dead (1968) | HD transfer that may derive from the 2017 restoration | Original video master, archive.org `Night_Of_The_Living_Dead_raw_HD_WS` (2013), SHA-1 `ab7a006c…3470fc06` |
| The Scar of Shame (1927) | Modern score by Makia Matsumura | Same Library of Congress presentation without audio, SHA-1 `5e4c4da4…a2690` |
| The Phantom of the Opera (1925) | Unidentified score, unknown source | Silent Universal print, archive.org `ThePhantomOfTheOpera_201612`, SHA-1 `521bb6c1…28a28` |
| KIPHO (1925) | Unidentified music | Same Commons file with the audio removed (video unchanged), SHA-256 `b076e60d…106f` |
| His Girl Friday (poster) | Painting of Cary Grant and Rosalind Russell | Original PROtv illustration, 900x1350, no people |
| The Duke Is Tops (poster) | Realistic performer portrait | Original PROtv illustration, 900x1350 |
| The Incredible Petrified World (poster) | Google Images thumbnail | Original PROtv illustration, 900x1350 |

All are staged with checksums; `apply-remediation.cjs check` passed (read
only). Old Mux assets and posters would be kept; `rollback` restores the prior
values exactly.

## 4. Mandatory for Roku submission and certification

| # | Item | Why |
| --- | --- | --- |
| A | **Deploy the Roku launch catalog** (`feature/roku-launch-eligibility`, `58d0f28`) | At submission you certify distribution rights. Without it, Roku would also serve the 15 rights-hold titles, including four with renewal records |
| B | **Publish an accurate privacy policy** (and terms) at watchprotv.com | The dashboard requires the URL; the live policy omits Google sign-in, AdSense, Mux Data, TV sign-in and deletion. Drafts are ready; counsel approves; you supply the postal address |
| C | **Sign RC5** on your developer Roku (`genkey`, Packager) and back up the Dev ID, password and .pkg | Only a signed .pkg can be submitted |
| D | **Six screenshots, reviewer account, sign-in/sign-out .rasp scripts, support phone, admin/technical contacts** | Required dashboard fields and App Behavior Analysis |
| E | **Pass Static Analysis and App Behavior Analysis** in the dashboard | Roku blocks certification on errors |

## 5. Optional improvements (not required to submit)

- **The six media replacements:** they add six titles to Roku (28 → 34).
  The current copies are already excluded from Roku by item A.
- **The His Girl Friday and The Duke Is Tops posters:** strongly
  recommended, because both titles are in the Roku launch and their current
  posters depict real people (a likeness question for counsel). Not a Roku
  rule.
- **The Incredible Petrified World poster:** the Roku app already withholds
  that image, so it only matters for the website and Fire TV.
- **The four restrictions:** they reduce website and Fire TV risk; no effect
  on Roku after item A.
- **Captions:** Tears of Steel captions are prepared but need human review.
  Mandatory only if counsel decides 47 CFR 79.4 applies to a launch title.
- **The 2-hour soak test** (never run): recommended for stability
  (certification 3.1), but not a submitted artifact.
- **Account deletion self-service:** not a Roku requirement; the manual
  process and the Roku Account screen notice exist.

## 6. Effect on the Fire TV and website catalogs

| Change | Website / Fire TV |
| --- | --- |
| A. Roku launch catalog | **No effect** (tested: non-Roku clients get the unchanged catalog) |
| Six media replacements | **Yes**: the shared records change, so the website and Fire TV play the new copies too |
| Three posters | **Yes**: the new posters appear everywhere |
| Four restrictions | **Yes**: the titles leave the website and Fire TV (reversible in Admin) |
| Captions | **Yes** if attached: the track appears on every platform |
| Privacy policy / terms | Website pages |

## 7. Owner approvals needed before submission

1. Approve deploying item A (Roku launch catalog).
2. Counsel approval of the privacy policy and terms; your postal address;
   then approval to publish them.
3. Your signing (genkey and Packager on the developer Roku).
4. Your final authorization to submit, after items B–E are done.

Optional approvals, whenever you choose: the media and poster swaps (one
batch), the four restrictions, the caption attachment, and counsel's
determinations listed in OWNER-APPROVALS.md.
