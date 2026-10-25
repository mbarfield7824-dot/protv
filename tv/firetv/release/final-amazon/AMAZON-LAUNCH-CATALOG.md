# Amazon Fire TV launch catalog: rights and artwork review

For the owner and counsel, 2026-10-25. **Not a legal opinion.** Nothing in production was changed.

Sources, all read-only:
- The live catalog API (`/api/v1/catalog?view=all`), fetched 2026-10-25: **49 titles**.
- The Roku launch review on `release/roku-1.0-rc9` (`tv/roku/store/ROKU-LAUNCH-CATALOG.md` and `roku-launch-catalog.json`, 2026-10-24). It searched primary renewal records, checked PROtv's own stream copies frame by frame, and searched the music renewals. Its groups match today's 49 live IDs exactly.
- The PROtv Creator Agent code (contract handling only; no contract records were opened).

**Roku does not establish Amazon rights.** The Roku app is under review, and Roku's own allowlist backend (`58d0f28`, branch `feature/roku-launch-eligibility`) is **not deployed**. Today the API serves all 49 titles to every device, Roku and Fire TV alike.

**Correction:** the earlier Fire TV triage (`rights-launch-matrix.md`) listed 8 "cleared" titles from the 2026-10-23 report. The later Roku review supersedes it. *Gulliver's Travels* is on that list, but its songs were renewed in 1966 and are protected through 2034. Use this file instead.

## Summary

| Status | Titles | What it means |
|---|---:|---|
| **A. Evidence on record** | 28 | The film, the copy PROtv streams, and the music each have a documented basis. 3 posters must be replaced first. |
| **B. Fixable by swapping the source** | 6 | The film is clear, but PROtv's current copy carries a protected restoration or score. A verified replacement file is staged (production change). |
| **C. Hold** | 15 | 6 have a documented protected element, 5 are open legal questions, 3 lack records, 1 clears on a date. |
| Restricted since 2026-10-23 | 7 | Not live anywhere; unchanged. |

**Smallest defensible US launch catalog: the 28 titles in group A**, once 3 posters are replaced and the owner confirms the artwork and creator-contract items below. A stricter fallback of **7 titles** has a licence or contract on record rather than a public-domain search: the 4 Blender films, The Lost Camp, Dead Air, and A Day in the Life of a Coal Miner (1910).

## Missing documentation vs actual restrictions

| Kind | Titles |
|---|---|
| **Protected element documented** (do not launch as-is) | House on Haunted Hill (film renewal RE0000318809, title-song renewal RE0000309723); Gulliver's Travels (songs renewed 1966, protected to 2034); Woman on the Run (score renewal RE0000909148, 2005); Merri Melodies shorts (title song renewed 1959; clears 2028-01-01); Body and Soul (every available copy has the Criterion-commissioned modern score); Within Our Gates (current copy has a modern score; a silent copy exists) |
| **Legal question for counsel** (not paperwork) | Fleischer Studios' Superman and Superman cartoons (underlying DC Superman works are renewed; derivative-work question); Cavalcade of Stars (1951 live broadcast, possibly never "published"); One Step Beyond – The Storm (in a 1992 recorded CBS catalog assignment; series renewals exist); Sita Sings the Blues (whether the filmmaker's song licences cover streaming) |
| **Missing documentation** | The Bundy Chronicles (no rights holder, agreement, authorship or AI-tool terms recorded); NASA's Hubble25 and Parker Solar Probe (government films, but the music and archival footage are unidentified) |
| **Clears on a date** | Looney Tunes Classics: Collection ("Dumb Patrol", 1931; no renewal found; every 1931 work is public domain from 2027-01-01) |
| **Source copy, not the film** (group B) | Carnival of Souls, Detour, KIPHO, Night of the Living Dead, The Phantom of the Opera, The Scar of Shame |
| **Weaker points inside group A** (evidence, not proof) | "Not found" in OCR'd renewal volumes is strong evidence, not proof. Music renewals were only half-searched (Jan–Jun 1973–77) for Angel on My Shoulder, Angel and the Badman, The Amazing Mr. X, Africa Screams and D.O.A. Later registrations or recordations are noted for counsel on Plan 9 from Outer Space (1981, 2025), The Brain That Wouldn't Die (1988) and Attack of the Giant Leeches (1982) |

## Creator contracts

The Lost Camp (Creator Schedule B) and Dead Air (replacement Creator Schedule) were published only after the Creator Agent recorded a **signed** contract (`creatorContractReference`, `commercialUseStatus: verified-contract`). The schedule wording (platforms, territory, term) is set by the administrator and stored with each signed contract. It is not in code, and the contract records were not opened.

**OWNER:** confirm both signed schedules grant distribution on third-party platforms (Amazon Appstore / Fire TV) in the US, for the current term, and cover the creator-supplied posters.

## Artwork rights

| Artwork | Titles | Status |
|---|---|---|
| Store icon and background (`artwork/`) | — | Plain PROtv brand graphics (logo, play mark, lines); no third-party material |
| Creator-supplied posters | The Lost Camp, Dead Air | Depends on the creator contract (above) |
| "Owner-supplied PROtv poster" | Most group A titles | **OWNER:** confirm who made them and that PROtv may use them commercially |
| "PROtv generated artwork (legacy set)" | The Battle of Midway, The Little Shop of Horrors, Murder in Harlem, Plan 9 from Outer Space, Angel and the Badman, Jungle Book 1942 | AI-generated. **OWNER:** confirm the image tool's terms allow commercial use |
| **Must be replaced** | His Girl Friday (depicts Cary Grant and Rosalind Russell), The Duke Is Tops (realistic performer face), The Incredible Petrified World (Google Images thumbnail) | Original PROtv replacements are staged on the Roku RC9 branch (`remediation/posters/`). Applying them is a production change |
| Origin not recorded | The Phantom of the Opera (group B) | Confirm or replace |
| Sita Sings the Blues poster | (group C) | Nina Paley, CC BY-SA 3.0; attribution is in `credits` |
| Third-party thumbnails | Little Shop of Horrors, Murder in Harlem, Woman on the Run, Jungle Book 1942, Angel and the Badman, Incredible Petrified World | `thumbnailUrl` points at Google image-search caches (`encrypted-tbn*.gstatic.com`, `google.com/imgres`). The Fire TV app shows `posterUrl` first, so only The Incredible Petrified World (no poster) displays one on the TV. The API still serves these URLs to every client |

## Attribution gap in the Fire TV app (Creative Commons titles)

Big Buck Bunny, Sintel and Tears of Steel (CC BY 3.0) and Elephants Dream (CC BY 2.5) require attribution. The catalog carries it only in the description ("Credit: Blender Foundation…"). The Fire TV app removes every "Rights:" and "Credit:" sentence from descriptions (`FeaturedTitle.kt`, `sanitizeDescription`), and shows a description only for the featured hero. **So the Fire TV app currently shows no attribution for these four films.** The films' own end credits may carry notices, but the licence link is not shown in the app.

Options: (a) a small app fix, shown in the player and on the More Info panel (code 6), or (b) leave these four out of the Fire TV launch catalog.

## How the Fire TV catalog could be limited (each needs owner authorization)

1. **Fire TV allowlist on the server** (recommended). Extend the undeployed `platformEligibility.js` with a `firetv` list (group A, minus anything the owner drops), and have Fire TV code 6 send `X-PROtv-Platform: firetv`. Roku, the website and Firebase data are unchanged. Needs a backend deploy and an app rebuild.
2. **Hold titles in production for every client** with the existing reversible "Request rights verification" workflow. No app change, but it also removes the titles from the website and Roku.
3. **Launch with all 49.** Not recommended: 6 titles have documented protected elements, and Amazon may ask for proof of rights.

## Store screenshots and the catalog decision

The five screenshots meet Amazon's format rules (1920×1080, 24-bit PNG, 5 of 3–10, no account data). Some show titles outside group A:
- `01-home-featured`: Body and Soul (C) and The Scar of Shame (B) in the Black Cinema row.
- `02-search-results`: House on Haunted Hill (C), Night of the Living Dead (B), and The Duke Is Tops with its to-be-replaced poster.
- `03-playback`: a Night of the Living Dead (B) frame.

Screenshots must reflect the app as shipped. **Retake them after the catalog is limited.** That is about 10 minutes on the Firestick.
