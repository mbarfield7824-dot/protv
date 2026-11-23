# Samsung: U.S.-only titles and territory controls (legal review package, 2026-11-23)

For counsel. **Not a legal opinion.** Prepared from PROtv's own records. Nothing in this package is live: the code
is on branch `feature/samsung-us-territory` (D:\protv-samsung-release), NOT deployed, and its U.S.-only title list is
empty.

## The question for counsel
Can PROtv's Samsung TV app (store distribution: **United States only**, per Seller Office) stream titles whose rights
or public-domain status are established **for the United States only**, given the controls below? If yes, which of
the titles listed below qualify, and what further evidence is required for each?

## Controls built (development)
1. **Country from the network edge.** Each Samsung catalog, playback and PROtv LIVE request is geolocated by
   Vercel's edge (`x-vercel-ip-country`; clients cannot set it). Only "US" unlocks a U.S.-only title.
2. **Deny by default.** These cases never unlock a U.S.-only title:
   - no country, or a malformed one;
   - the anonymizer / unknown codes (XX, ZZ, T1, A1, A2, AP, EU, O1);
   - a TV whose own reported region differs from its network location (a VPN or proxy sign; needs a later app update to send it);
   - an expired cutoff;
   - a `samsungHold`;
   - a title that is not listed.
3. **Signed streams only.** A U.S.-only title reaches Samsung only through a *signed* Mux playback ID. The public
   playback ID never appears in Samsung responses, so each stream needs a token PROtv issues per request. A title
   without a signed playback ID cannot play.
4. **LIVE.** Outside the United States (or when the location is unknown), a U.S.-only program airs on Samsung as the
   branded "not available" card, with no title, ID or playback.
5. **No caching.** Every affected response is `no-store`, so a U.S. answer cannot be cached and served elsewhere.
6. **Store level.** The Samsung listing is already limited to the United States. Samsung's own Geo IP Block is
   currently **off**; turning it on is proposed with the next Samsung release, not during the current 1.0.1 review.

Tests: 5 new and 552 backend tests in total, all passing. They cover U.S./other/unknown/VPN-mismatch, expiry, the
missing signed ID, no public-ID leak, and LIVE in and outside the U.S.

## Residual risks
- IP geolocation is not perfect, and a VPN that exits in the United States is not detectable server-side.
- A signed token is valid for the title's runtime plus 15 minutes (at least 1 hour). Mux cannot bind a token to an
  IP address, so a token copied abroad could work within that window.
- Vercel provides no VPN or proxy flag. Proxy detection beyond the codes above would need a paid IP-intelligence
  service.

## Candidates (21-day share of LIVE program time)
None is cleared by this package. The "Music" and "Source copy" columns are the open items the owner asked to be
verified. They are **not verified** in PROtv's records for any public-domain title.

| Title | Share | Basis on record | Music / soundtrack | Source copy (the version PROtv streams) | Mux playback IDs |
| --- | --- | --- | --- | --- | --- |
| The Incredible Petrified World (1959) | 5.5% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| Angel on My Shoulder (1946) | 4.2% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Angel and the Badman (1947) | 4.1% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Africa Screams (1949) | 4% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| His Girl Friday (1940) | 3.8% | Public Domain Mark (Internet Archive); no PROtv evidence record yet | Not reviewed | Unconfirmed | public only |
| D.O.A. (1950) | 3.4% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Plan 9 from Outer Space (1957) | 3.2% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Amazing Mr. X (1948) | 3.2% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Jungle Book 1942 | 3.2% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Duke Is Tops (1938) | 3.1% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| The Girl from Chicago (1932) | 2.9% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| Murder in Harlem (1935) | 2.9% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| Captain Kidd (1945) | 2.7% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Attack of the Giant Leeches (1959) | 2.6% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Brain That Wouldn't Die (1962) | 2.5% | Public domain (US: no notice) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Exile (1931) | 2.4% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| The Bronze Buckaroo (1939) | 2.3% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Little Shop of Horrors (1960) | 2.2% | Public domain (US: no notice) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| The Blood of Jesus (1941) | 1.7% | Public domain (US: not renewed) (evidence tier B) | Not reviewed | Unconfirmed | public only |
| Big Timers (1945) | 1.5% | **Unresolved (evidence tier C): Internet Archive labels only** | Not reviewed | Unconfirmed | public only |
| The Thirst | 1.2% | Signed agreement f2068214: United States only, 12 months (to about 2027-10-26) | Licensor warranty | Not checked against the covered master | public only |
| A Day in the Life of a Coal Miner (1910) | 0.7% | Public domain (pre-1931 publication) (evidence tier A) | Not reviewed | Unconfirmed | public only |
| The Battle of Midway (1942) | 0.5% | Public domain (US government work) (evidence tier B) | Not reviewed | Unconfirmed | public only |

**Not included:**
- UNITED NATIONS: LIVE denied.
- Elephants Dream: CC BY version conflict.
- You Did Me Dirty: rights are worldwide; it is held only because it is rated TV-MA, above Samsung's 16+ app rating.
- Detour, Phantom of the Opera, Scar of Shame, Carnival of Souls, Night of the Living Dead, KIPHO: Roku-held for
  soundtrack or copy issues.

## What each title needs before it could be added
1. **Film:** a confirmed U.S. public-domain basis. Tier C titles need Copyright Office renewal searches first.
2. **Music and other elements:** a separate check that no underlying score, song or added element in the copy
   PROtv streams is still protected (for example, separately renewed scores or modern replacement soundtracks).
3. **Source copy:** an identified source for PROtv's copy, and confirmation that it is the original release
   version, with no later protected additions.
4. **Counsel's sign-off** on the title.
5. **Operations (owner-approved writes):**
   - a signed Mux playback ID added to the title;
   - its ID recorded as `muxSignedPlaybackId`;
   - an entry in `SAMSUNG_US_ONLY_TITLE_EXPIRY`;
   - a production deploy.

## Coverage if titles are later cleared (production schedule, next 21 days)
| Samsung allowlist | LIVE program time playable |
| --- | --- |
| Deployed today (8 worldwide titles) | 12.1% |
| With the 4 verified agreement titles (approved, awaiting deploy) | 19.9% |
| Plus every tier A/B title, His Girl Friday and The Thirst, all cleared | 65.6% |
| Earlier estimate (included unresolved tier C films) | 86.0%: **not achievable on current evidence** |
