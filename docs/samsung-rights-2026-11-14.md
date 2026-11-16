# PROtv Samsung Smart TV — catalog rights decision (2026-11-14)

Owner and counsel reference. **Not a legal opinion.** No new external rights research was done; this
reuses the existing investigations and decides only how they apply to a Samsung Tizen app.

## Sources reused

- Roku launch catalog and rights evidence: `tv/roku/store/ROKU-LAUNCH-CATALOG.md` (`release/roku-1.0-rc9`).
- Fire TV allowlist: `backend/src/catalog/platformEligibility.js` (production `d1f6043`).
- iOS signed-agreement reconciliation: `docs/ios-rights-audit-2026-11-13.md` (`mobile/ios-release-prep`),
  which read the nine signed title agreements and one amendment on 2026-11-13.

## Rule

Samsung is **fail-closed with its own allowlist** (`SAMSUNG_LAUNCH_TITLE_EXPIRY`). Roku, Fire TV or iOS
eligibility never implies Samsung eligibility. A title is included only when the reviewed evidence is
**worldwide** and its grant covers PROtv's own applications generally (not only a list of named
platforms). That way the Samsung app adds **no new geographic exposure**, whatever countries are picked
in Seller Office.

Enforcement is server-side on every Samsung request (`X-PROtv-Platform: samsung`): browse, search,
`/titles/:id` and `/titles/:id/playback` (playback level). Responses carry
`platformPolicy: "samsung-rights-v1"`; the release app refuses any catalog or playback authorization
without that marker, so it shows no titles against a backend that has not deployed the rule.
`samsungHold: true` on a record withdraws it immediately.

## Included (8)

| Title | Basis (from the reconciliation above) | Why it covers Samsung | Cutoff (UTC, inclusive) |
| --- | --- | --- | --- |
| A Long Time Coming | STD6040-v1 rev 4, §2.1 + Schedule 2 | "PROtv apps", worldwide | 2028-11-09 |
| It's a Double Date a Classic | Agreement + signed Amendment No. 1 | Website/**app** streaming, worldwide | 2028-11-06 |
| CAESAR III JUDGEMENT | Signed Schedule B | "other PROtv-controlled platforms", worldwide | 2028-11-03 |
| Curtain Call | Signed Schedule B | "other PROtv-controlled platforms", worldwide | 2028-11-03 |
| The Lost Camp | Signed Schedule B | "PROtv platform and associated applications", worldwide | none (removal on notice) |
| Big Buck Bunny (2008) | CC BY 3.0 | Worldwide open licence, attribution kept | none |
| Sintel (2010) | CC BY 3.0 | Worldwide open licence, attribution kept | none |
| Tears of Steel (2012) | CC BY 3.0 | Worldwide open licence, attribution kept | none |

**Counsel to confirm:** that "app" in the Double Date agreement includes a smart-TV app (the other four
grants are general to PROtv apps/platforms). CC BY titles: confirm the Mux masters are still the
documented official releases (the iOS audit raised the same point).

## Excluded and why

- **U.S.-only grants** — The Thirst, UNITED NATIONS (both on Roku): no verified playback-level territory
  control; Mux public/signed playback is not country-bound.
- **U.S. public-domain findings** — the 21 Roku Group A classic films: U.S. renewal research is not a
  worldwide finding. Re-evaluate only with enforceable territory controls **and** U.S.-only Seller Office
  distribution, as an owner decision.
- Elephants Dream (CC BY version conflict), ITAN (AI-tool evidence pending), Dead Air (licensor authority
  unconfirmed), staged replacements, and every other Roku hold: unchanged from the prior audits.

Adding a title is a reviewed code change to the allowlist plus a backend deployment.
