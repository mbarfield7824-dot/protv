# PROtv iOS catalog rights audit

This audit reconciles the 59-title matrix with the current published catalog and the signed Creator Portal records available on 2026-11-13. All 59 catalog IDs matched the matrix. Nine title agreements and one signed amendment were inspected; the signed masters below matched the published project records. No contracts were changed, and no contract PDFs or signature data are included here.

## Result

| Decision | Count |
| --- | ---: |
| CLEARED FOR IOS | 8 |
| REQUIRES CLARIFICATION | 25 |
| NOT CLEARED | 26 |
| Total | 59 |

Five cleared titles rely on signed creator agreements; three additional titles are supported by worldwide CC BY 3.0 licenses for the documented official copies. This is a factual summary of the evidence reviewed, not a legal opinion. Roku/Fire TV eligibility alone does not establish rights for a mobile-delivered copy or worldwide availability.

## Reconciliation of earlier rights investigations (2026-11-14)

No new external rights research was performed. I reviewed the existing Roku rights summary, the detailed launch catalog and title-copy matrix from commit [`a101f2c`](https://github.com/mbarfield7824-dot/protv/blob/a101f2c/tv/roku/store/ROKU-LAUNCH-CATALOG.md), the matrix it supersedes ([`TITLE-RIGHTS-MATRIX.md`](https://github.com/mbarfield7824-dot/protv/blob/a101f2c/tv/roku/store/TITLE-RIGHTS-MATRIX.md)), the prior public-domain candidate records, and the catalog snapshots already in the repository. The detailed Roku report records Copyright Office/Catalog of Copyright Entries searches and identifies the copies and music reviewed; the 2026-11-02 Roku summary alone does not establish worldwide or mobile rights.

The Roku findings support three further iOS entries under open licenses, not creator agreements:

| Title | Existing evidence | iOS scope |
| --- | --- | --- |
| Big Buck Bunny (2008) | CC BY 3.0; official 480p release and soundtrack; attribution recorded in the catalog description. | Worldwide, commercial streaming permitted with attribution. |
| Sintel (2010) | CC BY 3.0; official film copy, including its soundtrack; attribution recorded in the catalog description. | Worldwide, commercial streaming permitted with attribution. |
| Tears of Steel (2012) | CC BY 3.0; official Commons release; attribution recorded in the catalog description. | Worldwide, commercial streaming permitted with attribution. Prepared subtitles are not included in this clearance. |

The archived public-catalog snapshot carries the three CC BY 3.0 attribution lines, and the prior catalog reconciliation matched the title IDs. The live catalog does not expose a source-copy identifier, so confirm the Mux masters still match the documented official releases before a production release; no live catalog record was changed here.

Other results:

- The Roku report identifies U.S. public-domain or non-renewal grounds for 21 currently old-enough Group A films. Those records do not establish worldwide public-domain status, and this backend has no playback-level territory enforcement. They remain `REQUIRES CLARIFICATION`; none was added to the iOS allowlist. Several also have copy- or music-specific caveats recorded in the Roku report. Public-domain works do not require creator signatures, but a U.S.-only finding cannot be exposed globally without enforceable territorial controls.
- The Exile (1931) is `NOT CLEARED` as of this audit. Its U.S. copyright term runs through 2026-12-31; the report says it enters the U.S. public domain on 2027-01-01. That future date does not establish worldwide rights or remove the iOS territory-control requirement.
- Elephants Dream remains `REQUIRES CLARIFICATION`: the Roku report identifies CC BY 2.5, while the published catalog description says CC BY 3.0. Both are attribution licenses, but the evidence conflicts on the applicable version, so it was not added.
- The public-domain candidate store contains discovery leads, mostly still pending. For example, the Woman on the Run and KIPHO candidates do not override the Roku report's renewed-score or unidentified-current-score findings. The confirmed Internet Archive Public Domain Mark for “All public domain Looney Tunes and Merrie Melodies shorts” is a collection-level record, not proof for every embedded work or PROtv version. The Roku report identifies a renewed song in the 1932 Merrie Melodies short, unknown songs/versions in the Looney Tunes collection, and later colorized material; both entries remain blocked.
- The six Roku “replacement staged” titles remain `NOT CLEARED` for iOS until the approved replacement is actually the published stream. The other Roku rights holds remain blocked for their documented music, derivative-work, episode, source-copy, or authorship issues. Creator agreements with territorial, authority, or AI-commercial-use conditions remain withheld as detailed in the matrix.

The CSV now records a reconciled rights category and title-specific evidence/limit for every row. The three CC BY clearances are additions to the existing five signed clearances; the five signed clearances and all playback safeguards remain unchanged.

In the CSV, `PUBLIC_DOMAIN_US_RIGHTS_BASIS` records U.S.-specific work/copy research, not worldwide clearance. Categories marked `CANDIDATE` or `CLAIM` are unverified leads; `COPY_HELD`, `REPLACEMENT_NOT_APPLIED`, and similar categories mean that public-domain status of the underlying work does not clear the current streamed version.

## Additional clearances

| Title | License and master | Territory and term | Attribution / conditions |
| --- | --- | --- | --- |
| Big Buck Bunny (2008) | CC BY 3.0; official 480p release and soundtrack. | Worldwide; no fixed calendar expiry. | Commercial use permitted; Blender Foundation credit remains in the description. |
| Sintel (2010) | CC BY 3.0; official 888-second film release and soundtrack. | Worldwide; no fixed calendar expiry. | Commercial use permitted; Blender Foundation credit remains in the description. |
| Tears of Steel (2012) | CC BY 3.0; official 734.06-second Commons release. | Worldwide; no fixed calendar expiry. | Commercial use permitted; Blender Foundation credit remains in the description. The separately prepared subtitles remain outside this clearance. |

## Cleared titles

| Title | Signed evidence and mobile scope | Territory and term | Covered published master |
| --- | --- | --- | --- |
| A Long Time Coming | STD6040-v1 revision 4, document `3e9c05e3-55d4-463a-9d60-8da0622adab9`; §2.1 and Schedule 2 cover PROtv Services, the watchprotv.com site, and PROtv apps including future mobile apps. §§2.2 and 5.1 require an unaltered film and permit ads at natural breaks. Non-exclusive. | Worldwide; 24 months from the last signature on 2026-11-11. The backend cutoff is 2028-11-09 UTC, conservatively before the exact expiration timestamp. | Media asset `5d4e6fb4-0f08-4c9a-9c38-8d4bbd8c0bcb` |
| It’s a Double Date a Classic | Agreement `1a959a6f-7def-4d8b-91a5-3d38b6923682` and signed Amendment No. 1, amendment ID `d2ae69bb-36bd-42f4-bed0-14836d01d09b`. The amendment supplies the missing signed Schedule A with this single title and exact master; the agreement grants non-exclusive website/app/mobile streaming and ad-supported monetization. | Worldwide; 24 months from the original execution on 2026-11-07. The amendment changes compensation and identifies the Schedule A title; it does not extend the license. Backend cutoff: 2028-11-06 UTC. | Media asset `b814444c-526d-494b-90c7-14acccdba07a`; filename `It's a double date B&W.mp4` |
| CAESAR III JUDGEMENT | Signed Schedule B, document `59a9f315-7de5-4959-a5d3-91935e8a70fc`; grants distribution through the PROtv website, Roku, Fire TV, mobile apps, and other PROtv-controlled platforms. Non-exclusive; attributable advertising receipts are contemplated. | Worldwide; initial term two years from execution on 2026-11-04. Backend cutoff: 2028-11-03 UTC. | Media asset `a9f79b29-9e53-48a3-ad88-07191fdee60a` |
| Curtain Call | Signed Schedule B, document `d2bf0097-5ee7-48a7-ad24-bec96e0d9d0f`; grants distribution through the PROtv website, Roku, Fire TV, mobile apps, and other PROtv-controlled platforms. Non-exclusive; attributable advertising receipts are contemplated. | Worldwide; initial term two years from execution on 2026-11-04. Backend cutoff: 2028-11-03 UTC. | Media asset `e8fc7b21-be7d-4a14-a7cd-f5c259138016` |
| The Lost Camp | Signed Schedule B, document `ee474291-9c29-417d-9f6f-a330fe8c7f22`; grants a non-exclusive worldwide license through the PROtv platform and associated applications, including ad-supported streaming. The schedule requires disclosure of territory restrictions; none were declared. | While the title remains available through PROtv; removal may be requested by written notice. No fixed calendar expiry. | Media asset `c853903e-84bf-4f89-810f-96976c8504d1` |

The date-only backend cutoffs are inclusive UTC calendar dates chosen so access cannot extend past the signed term's exact timestamp. The Lost Camp has no fixed end date; its agreement term is tied to availability and remains subject to removal notice.

## Withheld creator titles

| Title | Signed evidence | Current decision and blocker |
| --- | --- | --- |
| The Thirst | Replacement agreement `f2068214-d3f4-4171-b09b-9bcdefd4f527`; mobile/app distribution and ad-supported streaming are included. Covered master: `38afe310-70aa-4639-a43b-dae36f426626`. | **REQUIRES CLARIFICATION.** The grant is United States only and lasts 12 months from execution on 2026-10-26 (conservative last full UTC date: 2027-10-25). No title-specific playback geofence has been verified. A country check on the catalog/API request would not by itself constrain playback from Mux. |
| UNITED NATIONS | Schedule B, document `f587ce8e-957b-46aa-b948-d46bcc08003f`; explicitly includes mobile applications and advertising. Covered master: `a5f64b93-58ff-4750-b6ea-894346f734b2`. | **REQUIRES CLARIFICATION.** Territory is the United States, including its territories and possessions. The term is 12 months from first public availability; that start date was not verified. No title-specific playback geofence has been verified. |
| ARÍỌRÍ (REINCARNATION)- ITAN | Schedule D, document `ee0b672e-5f00-422d-87c9-d5b5c84dfc7a`; expressly includes mobile and connected-TV apps. Covered master: `31a38f6a-d552-446a-867f-fb096455610c`. | **REQUIRES CLARIFICATION.** Schedule A says commercial-use evidence for Grok, Seedance, Kling, and Suno is pending and must be supplied before release. Territory is worldwide only where rights are cleared; initial term is 24 months from the last signature. Do not add until the required evidence is received and reviewed. |
| Dead Air | Replacement agreement, document `0b5c3a27-ed44-4c1c-bb0d-102e8ad52c31`; covered master: `3d8c8ed8-4041-405c-819c-c5c47bb3c899`. | **NOT CLEARED.** The signed record says the licensor's signing capacity and authority must be confirmed before issuance, and the grant covers only territories the licensor owns or controls. That confirmation was not present in the records reviewed. |

For the two US-only grants, the current Mux playback signer in [`backend/src/mux.js`](../backend/src/mux.js) sets token type and expiry but does not bind playback to a country. The short-lived token is therefore not treated as territorial enforcement. Keep both titles out of the iOS allowlist until playback-level territory controls are verified.

## Backend and release state

- The iOS allowlist contains the five signed titles and three worldwide CC BY 3.0 titles. The three open-license entries use `null` expiry because the licenses have no fixed calendar end date; The Lost Camp's term remains tied to publication and removal notice.
- Existing iOS request behavior remains: `X-PROtv-Platform: ios` selects the iOS catalog and `X-PROtv-Platform-Policy: ios-rights-v1` identifies the policy. Browse, search, details, playback, favorites, and viewing progress use the same allowlist.
- No production deployment, catalog publication, agreement change, APK/build, or store submission occurred. The backend changes are on `mobile/ios-release-prep` only.
- The other 51 titles remain excluded from the iOS catalog: 25 require clarification and 26 are not cleared. Current-copy holds remain blocked, and platform-specific Roku/Fire TV eligibility is not treated as iOS authorization.
