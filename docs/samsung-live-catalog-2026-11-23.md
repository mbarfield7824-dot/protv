# Samsung PROtv LIVE: playable catalog (2026-11-23)

Owner and counsel reference. **Not a legal opinion.** This extends `docs/samsung-rights-2026-11-14.md`
and does not change its rule: a title reaches Samsung only with evidence that is worldwide and covers PROtv's own
apps generally.

## Coverage of the LIVE schedule on Samsung

Share of approved program time over the next 21 days (production schedule, read 2026-11-23):

| Samsung allowlist | Program time playable | Whole channel incl. PROtv breaks |
| --- | --- | --- |
| Today (8 titles) | 12.1% | 15.0% |
| With the 5 titles below | 21.6% | 24.2% |
| Plus the U.S.-only titles Roku already clears (needs the decision below) | 86.0% | 86.5% |

Everything else airs on Samsung as the branded "not available on Samsung TVs" card, with no title or playback.

## Proposed additions (executed agreements read 2026-11-23)

Branch `feature/samsung-live-catalog`. Not deployed.

| Title | Agreement | Territory | Services | Cutoff (UTC, inclusive) |
| --- | --- | --- | --- | --- |
| Three Thirty | STD6040-v1, SignWell e1f7a31c, signed 2026-11-18 | Worldwide | Website, Android, Roku, Fire TV and any later PROtv app, "including future connected-TV and mobile apps" | 2028-11-17 |
| 2212 (film) | CUSTOM-v1, fa57d968, 2026-11-18 | Worldwide, limited to countries where Licensor holds the rights | Same as Three Thirty | 2028-11-17 |
| You Did Me Dirty, You Reap What You Sow | CUSTOM-v1, ab9730ab, 2026-11-18 | Same as 2212 | Same as Three Thirty | 2028-11-17 |
| 2212 S1 "Concrete" | Season Agreement f936d40d, 2026-11-19 | Same as 2212 | Names "the PROtv apps for Roku, Amazon Fire TV and Samsung smart TVs" | 2028-11-18 |
| 2212 S1 "Death Before Dishonor" | Season Agreement f936d40d | Same | Same | 2028-11-18 |

All terms are 24 months from the Effective Date, which is the signing date. Later 2212 episodes follow automatically
only after delivery, approval and an allowlist entry.

**Counsel to confirm:**
- "Worldwide, limited to the countries in which Licensor holds the rights": nothing in the record narrows it, and it
  already applies to the website.
- Keith Powell's authority for Lakean Entertainment, which is already on the counsel checklist.

## Still excluded

- **The Thirst, UNITED NATIONS:** U.S.-only grants.
- **The 21 U.S. public-domain classics:** U.S. renewal findings, not worldwide findings. These are most of the
  schedule.
- **ITAN, Dead Air, Elephants Dream, Aunt Tut (LIVE denied), Ironborn:** unchanged holds. Ironborn is not yet
  delivered and its agreement was signed by the licensor only.

## The decision that moves Samsung LIVE from about 22% to 86%

The 2026-11-14 decision kept U.S.-only titles off Samsung "until playback-level territory controls exist", with
U.S.-only Seller Office distribution as an owner decision. Seller Office (read 2026-11-23) shows the 1.0.1
submission **already limited to the United States of America** (Service Country: 1 selected; locked while Samsung
is testing), with **Geo IP Block: Unuse**. What remains:

1. **Owner:** in the next Samsung release (1.1.0), set Geo IP Block to "Use", so Samsung blocks the app outside
   the service country. This is a change to the store submission, made with the 1.1.0 upload.
2. **Code:** a server-side territory check for Samsung. Samsung catalog, playback and LIVE requests from outside the
   United States (Vercel `x-vercel-ip-country`) get only the worldwide titles. Short-lived signed playback should be
   used for the U.S.-only titles, so a stream URL cannot be reused abroad.
3. **Counsel:** confirm that U.S.-only distribution plus those controls is sufficient for the tier-A/B U.S.
   public-domain findings and the two U.S.-only grants.

Until all three are in place, Samsung LIVE should not be published.
