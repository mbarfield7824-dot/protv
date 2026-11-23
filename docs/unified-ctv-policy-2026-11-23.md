# Unified connected-TV rights policy (development, 2026-11-23)

Branch `feature/unified-ctv-policy` (D:\protv-samsung-release), built on the U.S. territory work (87f1123).
**Not wired into production and not deployed.**

## Files
- `backend/src/catalog/ctvPolicy.js`: a single `evaluate(video, platform, {now, territory, standard})` used by every
  connected-TV app. It returns `deny` reasons (not offered) and `review` items (offered, with an open item).
- `backend/src/catalog/ctvRightsRegistry.json`: one rights record per title (40). It was generated from facts verified
  on 2026-11-23 against the executed agreements, PROtv's rights-evidence records and Mux.
- Platform profiles:
  - Roku: U.S. store, 18+.
  - Samsung: U.S. store, 16+.
  - Apple TV and Fire TV: U.S. store; store rating not set yet, so rated content is denied until one is chosen.

## What it checks (each check denies when it cannot be established)
| Area | Rule |
| --- | --- |
| Executed rights | A rights record must exist; the signer's authority must be confirmed (counsel-check: review; unconfirmed: deny) |
| Platforms | The grant must cover PROtv's apps generally (or be under counsel check) |
| Dates | Today must fall inside the contract term |
| Territory | U.S.-limited titles need all of: a U.S.-only store, a viewer confirmed in the U.S. (unknown or VPN sign denied), and a signed playback ID. They are served only by signed ID |
| Maturity | The rating must fit the platform's store classification; an unrated title is flagged for review |
| Masters | A master not traced from Mux to the agreement is flagged for review |
| Public domain | Film status `public-domain-us` required. Under the owner's element-review standard, soundtrack reviewed and source copy confirmed are also required. A conflicting licence label denies |
| Open licences | The licence version of the copy must be verified |
| Exclusions | Rights holds, device-app holds and per-platform holds always deny |

Defense in depth for territory-limited titles:
1. U.S.-only store listings.
2. Server-side country from Vercel's edge, deny by default.
3. Device region mismatch treated as a VPN or proxy sign.
4. Signed, expiring stream tokens only, with the public stream ID never served.
5. No-store responses.
6. Recommended next: remove the public Mux playback ID from those titles, so no unsigned stream exists anywhere.

## Tests
- 8 policy tests, plus 5 territory tests.
- Full backend suite 560/560.

## Shadow run on the production catalog (U.S. viewer)
```
titles evaluated 40
today: Roku 40, Samsung 12
unified policy, as data stands (no signed IDs): Roku 14, Samsung 13
unified policy if U.S.-only titles get signed IDs: Roku 16, Samsung 15
... plus film-only standard for public domain (not the owner standard): Samsung 30
RS -> RS  2212 | deny: - | review: rating-unconfirmed
RS -> RS  A Long Time Coming | deny: - | review: rating-unconfirmed,signer-authority-counsel-check
R- -> RS  Aunt Tut | deny: - | review: rating-unconfirmed
RS -> RS  Big Buck Bunny (2008) | deny: - | review: rating-unconfirmed,source-copy-unconfirmed
RS -> RS  CAESAR III JUDGEMENT | deny: - | review: rating-unconfirmed,master-not-traced
RS -> RS  Concrete | deny: - | review: rating-unconfirmed
RS -> RS  Curtain Call | deny: - | review: rating-unconfirmed,master-not-traced
RS -> RS  Death Before Dishonor | deny: - | review: rating-unconfirmed
RS -> RS  It’s a Double Date a Classic | deny: - | review: rating-unconfirmed,platform-scope-counsel-check
RS -> RS  Sintel (2010) | deny: - | review: rating-unconfirmed,source-copy-unconfirmed
RS -> RS  Tears of Steel (2012) | deny: - | review: rating-unconfirmed,source-copy-unconfirmed
RS -> RS  The Lost Camp | deny: - | review: rating-unconfirmed,master-not-traced
R- -> RS  The Thirst | deny: - | review: rating-unconfirmed,master-not-traced
RS -> RS  Three Thirty | deny: - | review: rating-unconfirmed,signer-authority-counsel-check
R- -> RS  UNITED NATIONS | deny: - | review: rating-unconfirmed,master-not-traced
R- -> R-  You Did Me Dirty, You Reap What You Sow | deny: rating-exceeds-platform | review: -
R- -> --  A Day in the Life of a Coal Miner (1910) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Africa Screams (1949) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Angel and the Badman (1947) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Angel on My Shoulder (1946) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Attack of the Giant Leeches (1959) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Big Timers (1945) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Captain Kidd (1945) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  D.O.A. (1950) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Dead Air | deny: signer-authority-unconfirmed,rating-exceeds-platform | review: master-not-traced
R- -> --  Elephants Dream (2006) | deny: licence-version-unverified | review: rating-unconfirmed,source-copy-unconfirmed
R- -> --  His Girl Friday (1940) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Jungle Book 1942 | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Murder in Harlem (1935) | deny: copyright-unresolved,conflicting-licence-label,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  Plan 9 from Outer Space (1957) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Amazing Mr. X (1948) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Battle of Midway (1942) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Blood of Jesus (1941) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Brain That Wouldn't Die (1962) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Bronze Buckaroo (1939) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Duke Is Tops (1938) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Exile (1931) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Girl from Chicago (1932) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Incredible Petrified World (1959) | deny: copyright-unresolved,soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
R- -> --  The Little Shop of Horrors (1960) | deny: soundtrack-not-reviewed,source-copy-unconfirmed | review: rating-unconfirmed
```
Reading it:
- Under the owner's evidence standard, **both apps converge on the same catalog**. The only difference is that
  TV-MA titles stay off Samsung.
- **Roku would lose the public-domain titles** until their soundtrack and source-copy reviews are done. That is the
  real gap the old Roku rule hid.
- With a film-only standard, Samsung would reach 30 titles. That standard is not the one the owner set.
