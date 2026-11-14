# Samsung backend change: production impact review (read-only, 2026-11-14)

Change under review: `d1f6043..6fb7a68` on `feature/samsung-tizen`. It touches two files,
`backend/src/catalog/platformEligibility.js` and `backend/src/catalog/router.js`, and adds one test file.
Nothing was deployed. Production was only read with GET requests.

## Production today (GET /api/v1/catalog?view=all)

| Request | Titles | platformPolicy |
| --- | --- | --- |
| Website (no header) | 59 | none |
| Roku | 35 | none |
| Fire TV | 28 | none |
| Android | 59 | none |
| iOS | 59 | none |
| Samsung | **59** (unfiltered: `samsung` falls through to the default) | none |

All 8 Samsung-allowlisted IDs exist in production today (8 of 8).

## What changes after deploy

| Client | Effect |
| --- | --- |
| Samsung | 59 -> 8 titles. `platformPolicy: "samsung-rights-v1"` is added to the browse and playback responses. Playback of any other ID returns 404 |
| Website | None. `websiteRequest()` is false only for listed device platforms; `samsung` was added to that list, and no other value changed |
| Roku | None. Same `rokuEligible` path. `withPolicy` returns the body unchanged when the platform has no policy |
| Fire TV | None. Same `FIRETV_LAUNCH_TITLE_IDS` / `clearedEpisode` path |
| Android / iOS | None. Still the unfiltered default path |
| PROtv LIVE, Creator Portal, sitemap, contracts | None. They don't call `eligibleForPlatform` with a request, and the sitemap path passes no request |

How this was established:
- The diff shows the only new branches are keyed on `platform === 'samsung'`.
- `eligibleForPlatform` gained an optional third parameter, `now`. Existing callers pass two arguments.
- Backend tests: 469 of 471 pass. The 2 failures need a built `frontend/dist` and fail identically on untouched production code. The eligibility tests (Samsung, Fire TV, Roku) pass 15 of 15.
- An isolated loopback test backend (branch code, seeded records, no production credentials) gave:
  - Samsung: the policy plus the 8 titles.
  - A non-cleared control record: hidden, and its playback returns 404.
  - Fire TV: no policy field.

## Merge and deploy risks

- **Production line:** a trial merge into `feature/protv-live` (`d1d62b6`, the production line) is **clean**. The production line differs from the base only in `backend/docs/linear-channel.md`.
- **iOS conflict:** a trial merge with `mobile/ios-release-prep` **conflicts** in `platformEligibility.js`. Both branches add platform rules to the same function. Resolve by hand, keeping both branches. Re-run the eligibility tests after resolving.
- **Rollback:** promote the previous Vercel deployment. The change is stateless (no data migration).
- **Caching:** responses already `Vary: X-PROtv-Platform` and are `no-store`, so the Samsung and other responses cannot be served to each other from a cache.

## Rights notes

- The allowlist covers 4 signed creator titles with 2028 cutoffs, The Lost Camp, and 3 CC BY 3.0 films. All are worldwide and cover PROtv apps generally. See `docs/samsung-rights-2026-11-14.md`.
- Counsel should confirm that "app" in the Double Date agreement includes smart-TV apps.
- U.S.-only and U.S. public-domain titles remain excluded until territory controls exist.
