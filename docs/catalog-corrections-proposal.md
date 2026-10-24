# Live catalog: metadata corrections (final proposal for owner approval)

Reviewed 2026-10-23 against the live catalog (56 titles), Firestore, Wikidata,
Wikipedia, the BFI and US Copyright Office records. Exact before/after values
for every change below are in `docs/catalog-corrections.json` (45 field
changes in 5 groups). **Groups 1–5 were APPLIED on 2026-10-23** (owner-approved): 52 field
writes on 18 titles, each verified after writing, with one `adminAudit`
entry per title (type `title_metadata_updated`, actor
`owner-approved-catalog-corrections-2026-10-23`, previous values in
`details.previous`). Category changes also set `genre` and `categories`, as
the admin edit route does. The Brain from Planet Arous was restricted with
the rights workflow instead (store/RIGHTS-REPORT.md). Creator-owned records
were not touched. Rollback: write `details.previous` back for the title.

## Already applied (2026-10-23, audited)

- `year` filled on 40 titles from the year in their title.
- His Girl Friday synopsis restored (was "na."), Rights note kept.
- Audit: `adminAudit` entries of type `title_metadata_updated`, actor
  `roku-launch-catalog-metadata-2026-10-23`, with previous values.
- Live check: 51 of 56 titles now have a year.

## Group 1 — Identity and factual errors (verified; recommended)

| Title | Change | Evidence |
| --- | --- | --- |
| The Phantom of the Opera | `imdbId` tt0293508 → **tt0016220**; clear the six stored IMDb fields; `year` → **1925** | The stored ID is the 2004 film; the website shows its **7.2** rating (136,113 votes). PROtv's copy is the 1925 film (106 min, 1925 artwork; Wikidata Q927919) |
| D.O.A. (1950) | `imdbId` tt0042378 → **tt0042369**; clear the six stored IMDb fields | The stored ID is *Darah dan Doa* (Indonesia, 1950); the website shows its **6.7** rating (46 votes) |
| Within Our Gates [1920] | `year` 1927 → **1920** | Wikidata Q2517806: released 1920-01-12 |
| One Step Beyond - The Storm | `year` → **1960** | Wikipedia episode list: S2 E39, first aired 1960-06-21 (matches stored season/episode) |
| A Day in the Life of a Coal Miner (1910) | Synopsis rewritten; Rights note kept | BFI Screenonline: a **British** Kineto film sponsored by the London & North Western Railway. The current text says it shows "America's working class" |

Proposed Coal Miner synopsis:

> An early British documentary from Charles Urban's Kineto company, sponsored
> by the London & North Western Railway. It follows a coal miner through a
> full working day, from his early-morning goodbyes to the journey home, and
> shows the women who worked at the pit. Some scenes were staged, because
> filming underground was not yet possible.

**Root cause and caution:** the admin IMDb-rating lookup
(`backend/src/omdb.js`) searches OMDb by **title and year**, not by IMDb ID.
That is how both mismatches happened: the Phantom had no year, and "D.O.A." +
1950 returns *Darah dan Doa*. Do **not** re-run the lookup for D.O.A.; leave
its rating empty, or later change the lookup to use the stored `imdbId` (a
backend change, not proposed here). For the Phantom, the lookup is only safe
after the year (1925) is set, and its result must be checked before saving.
The Roku app does not show IMDb ratings, so the Roku build is not affected;
the website is.

## Group 2 — Public rights notes (needs a decision)

| Title | Change | Why | Needs |
| --- | --- | --- | --- |
| Elephants Dream (2006) | Note "CC BY 3.0" → **"CC BY 2.5"** | Wikidata and Commons record CC BY 2.5, stated by the copyright holder | Nothing further |
| Sita Sings the Blues (2008) | Note "Public domain." → **"Film dedicated to the public domain (CC0) by Nina Paley."** | The film is CC0; its music has separate rights | The owner confirms the music license covers PROtv streaming; if not, request rights verification instead |
| The Brain from Planet Arous (1957) | **Admin > Request rights verification** (hides the title; approving it restores it) | Copyright renewal RE0000258469 (1985); likely protected until 2052 | Owner decision |

Other titles in tier D of `tv/roku/store/evidence/rights-evidence.md` (Voyage
to the Planet of Prehistoric Women, The Last Man on Earth, Beat the Devil, The
Plow That Broke the Plains, The River, The Bundy Chronicles) should use the
same action if counsel cannot clear them before launch.

## Group 3 — Title formatting

| Current | Proposed |
| --- | --- |
| House on Haunted Hill 1959 | House on Haunted Hill (1959) |
| Woman On The Run 1950 | Woman on the Run (1950) |
| The Phantom of the Opera | The Phantom of the Opera (1925) |
| Within Our Gates [1920] | Within Our Gates (1920) |

## Group 4 — Series names

Stored as single episodes (S1 E1) with an empty `seriesTitle`, so each shows
as its own one-episode series.

| Title | Proposed `seriesTitle` | Note |
| --- | --- | --- |
| Cavalcade of Stars | Cavalcade of Stars | |
| Fleischer Studios' Superman | Superman (Fleischer Studios) | |
| Looney Tunes Classics: Collection | Looney Tunes Classics | |
| Merri Melodies shorts | Merrie Melodies | The video is one 7-minute short from a 439-minute collection. The owner should identify which short it is, set its name as the title, and check it is not one of the unofficially redrawn colorized versions, which can carry their own copyright. The source collection warns that some shorts contain racial stereotypes |

Alternative: if these are compilations rather than episodes, store them as
movies in Cartoons (a content decision).

## Group 5 — Categories (`category`, and `genre` where it equals the category today)

| Title | Current | Proposed | Reason |
| --- | --- | --- | --- |
| Sita Sings the Blues (2008) | Action | Cartoons | Animated musical |
| Elephants Dream (2006) | Action | Sci-Fi | Animated science-fiction short |
| Gulliver's Travels (1939) | Action | Cartoons | Animated feature |
| The Amazing Mr. X (1948) | Action | Drama | Film noir |
| A Day in the Life of a Coal Miner (1910) | Comedy | Documentary | BFI: early documentary |
| Angel and the Badman (1947) | Comedy | Drama | Western |
| Captain Kidd (1945) | Comedy | Action | Pirate adventure |
| 50 Classic Cartoons (Silver Screen Video) | Documentary | Cartoons | A collection of 50 cartoons |

Creator titles (for information only; the creator or owner decides): Dead Air
("Supernatural horror") and The Lost Camp ("Horror/Thriller") would join the
Horror row and the Scary mood as "Horror".

## Not proposed (owner input needed)

- **Years:** Looney Tunes Classics: Collection (a compilation; leave blank or
  use the short's year once identified); Dead Air and The Lost Camp (creators
  supply). "Superman cartoons" says 1994, the year of the Wayzata CD-ROM
  compilation; the shorts are 1941–43. It may also duplicate "Fleischer
  Studios' Superman"; the owner should compare the two videos.
- **Maturity ratings:** none invented. Only Dead Air (TV-MA) and Jungle Book
  1942 (PG) are rated. Jungle Book predates MPAA ratings, so the PG source
  should be confirmed. Roku does not require per-title ratings.
- **Healthy:** all 56 titles authorize playback; all manifests load; no
  duplicate titles by name; every poster is 2:3.

## Captions

No title has caption, subtitle or alternate-audio tracks. See
`tv/roku/store/captions-investigation.md`.
