# Android catalog rights: proposal (2026-11-21, NOT DEPLOYED)

**Finding.** The live Android app (Google Play, com.protv.mobile 1.0.0, United States only) sends no platform header, so
the server treats it as the website and returns the full 64-title website catalog. No app-specific rights rule applies.

**Proposed fix (branch `feature/android-rights-policy`, server only, no app update).** The server recognises the Android
app by its React Native User-Agent (`PROtv/<version>`; browsers never send it) and applies the reviewed, fail-closed
Roku rule: titles whose rights evidence covers PROtv's device apps, plus signed creator titles whose Schedule names TV or
PROtv apps (so new signed series such as Ironborn appear on Android automatically). `androidHold` withdraws a title from
Android only. Website, Roku, Fire TV, Samsung and iOS responses are unchanged.

**Effect on Android today:** 64 → 40 titles (the same 40 Roku carries). Android Coming Soon becomes the device version
(automatic listings that pass the rule, no website promotions), which is empty until a cleared show is scheduled.

Basis: the iOS app-rights audit of 2026-11-13 (docs/ios-rights-audit-2026-11-13.csv on mobile/ios-release-prep), adjusted
for Android's US-only distribution. Territory note: Play distribution is US-only, but playback is not geofenced (the same
position Roku is in today).


## Stays: cleared for device apps (worldwide signed or CC BY) (8)

- The Lost Camp — `SIGNED_CREATOR_LICENSE_WORLDWIDE` (`creator_20752565-9909-4c2b-9f53-c9719ca26769`)
- It’s a Double Date a Classic — `SIGNED_CREATOR_LICENSE_WORLDWIDE` (`creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8`)
- A Long Time Coming — `SIGNED_CREATOR_LICENSE_WORLDWIDE` (`creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9`)
- CAESAR III JUDGEMENT — `SIGNED_CREATOR_LICENSE_WORLDWIDE` (`creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f`)
- Curtain Call — `SIGNED_CREATOR_LICENSE_WORLDWIDE` (`creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d`)
- Tears of Steel (2012) — `OPEN_LICENSE_CC_BY_3.0` (`gbcxmtl6mAHQeBxx8Dgs`)
- Big Buck Bunny (2008) — `OPEN_LICENSE_CC_BY_3.0` (`hKPU3JNJ4faWLgWE6ZSq`)
- Sintel (2010) — `OPEN_LICENSE_CC_BY_3.0` (`sCWQqVE5WIoNNN5wAGQ2`)

## Stays: U.S. rights basis (withheld from iOS only for territory) (23)

- The Duke Is Tops (1938) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`1l1uGB4v8CaUr9p4TTGv`)
- The Battle of Midway (1942) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`2OTfk1MA9SNAJcXQajCl`)
- The Little Shop of Horrors (1960) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`3NAU6BldsmCNs9wjM08a`)
- Murder in Harlem (1935) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`6h3blkiA6LTeLv66jj1v`)
- Jungle Book 1942 — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`aFRblRPxcp3LEm1lf4ye`)
- Angel and the Badman (1947) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`aIZ4FeTCPjuTlycMgxiK`)
- Plan 9 from Outer Space (1957) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`B2MDEH2b25NknMQMEhoM`)
- Captain Kidd (1945) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`CmN3oev0txAoerdvsjCb`)
- The Thirst — `SIGNED_CREATOR_LICENSE_US_ONLY` (`creator_613e215e-709f-48ee-91bb-b225d8da4a33`)
- UNITED NATIONS — `SIGNED_CREATOR_LICENSE_US_ONLY` (`creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6`)
- Big Timers (1945) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`dKxiQCeBcuT92BKv9dgJ`)
- The Amazing Mr. X (1948) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`evCYYCPlc23BKzpmt2ug`)
- The Bronze Buckaroo (1939) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`goOpjlfjJF3YWw5dlHqe`)
- Angel on My Shoulder (1946) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`KS5fwSoYxy8h3FkrTWW3`)
- His Girl Friday (1940) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`LiMNMZWXBxJj3LoP73kU`)
- The Incredible Petrified World (1959) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`MZ6Q6DI2S62pP8laH9Ku`)
- The Blood of Jesus (1941) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`PqGsChF8xtTQdaQFEWQI`)
- The Brain That Wouldn't Die (1962) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`RwDe3WkIWoHQ1EUzfWn9`)
- The Girl from Chicago (1932) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`Ts881xyfGAz4E4TZHIeg`)
- A Day in the Life of a Coal Miner (1910) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`u3dXF1OlGIXiRPAHz3hE`)
- Africa Screams (1949) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`uvRcBLWVKxLyHsswVZOo`)
- D.O.A. (1950) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`WMmLodEvI2gpEVW9v6yL`)
- Attack of the Giant Leeches (1959) — `PUBLIC_DOMAIN_US_RIGHTS_BASIS` (`ZIWIKF2lyh7hJCcRkPLr`)

## Stays: signed creator titles after the audit, Roku-cleared (5)

- You Did Me Dirty, You Reap What You Sow — `SIGNED_CREATOR_TITLE_AFTER_AUDIT_ROKU_CLEARED` (`creator_08283e5a-f35c-402e-9639-50e1711a5d67`)
- Three Thirty — `SIGNED_CREATOR_TITLE_AFTER_AUDIT_ROKU_CLEARED` (`creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47`)
- 2212 — `SIGNED_CREATOR_TITLE_AFTER_AUDIT_ROKU_CLEARED` (`creator_dd7efaaf-d87b-44df-93ab-5561936b6a52`)
- Concrete — `SIGNED_CREATOR_TITLE_AFTER_AUDIT_ROKU_CLEARED` (`creator_episode_ac1c153a-2cd4-4c1e-a1ba-813fcbdacd90`)
- Death Before Dishonor — `SIGNED_CREATOR_TITLE_AFTER_AUDIT_ROKU_CLEARED` (`creator_episode_dfad5c66-a17d-41d3-9ebf-6da60fada4fa`)

## Removed from Android: never cleared for any device app (24)

- One Step Beyond - The Storm — `COPYRIGHTED_TELEVISION_EPISODE_UNRESOLVED`
- Do Women Want A Simp or An Alpha Male — `PODCAST_EPISODE_RIGHTS_UNVERIFIED`
- Woman on the Run (1950) — `PUBLIC_DOMAIN_CANDIDATE_WITH_RENEWED_SCORE`
- Parker Solar Probe — `US_GOVERNMENT_WORK_WITH_THIRD_PARTY_ELEMENTS`
- Body and Soul (1925) — `PUBLIC_DOMAIN_FILM_COPY_AND_SCORE_HELD`
- "Does Voting Cause Division?" — `PODCAST_EPISODE_RIGHTS_UNVERIFIED`
- Cavalcade of Stars — `UNPUBLISHED_TELEVISION_BROADCAST_RIGHTS_UNRESOLVED`
- KIPHO — `PUBLIC_DOMAIN_US_COPY_WITH_UNIDENTIFIED_SCORE`
- Detour (1945) — `PUBLIC_DOMAIN_FILM_REPLACEMENT_NOT_APPLIED`
- Fleischer Studios' Superman — `PUBLIC_DOMAIN_CARTOON_DERIVATIVE_RIGHTS_HELD`
- Looney Tunes Classics: Collection — `PUBLIC_DOMAIN_CANDIDATE_COLLECTION_NOT_CLEARED`
- Black History They Don't Teach In School — `PODCAST_EPISODE_RIGHTS_UNVERIFIED`
- Superman cartoons — `PUBLIC_DOMAIN_CARTOON_DERIVATIVE_RIGHTS_HELD`
- House on Haunted Hill (1959) — `COPYRIGHTED_FILM_AND_SONG`
- The Bundy Chronicles — `CREATOR_OR_AI_ORIGIN_RIGHTS_UNVERIFIED`
- Gulliver’s Travels (1939) — `PUBLIC_DOMAIN_FILM_WITH_RENEWED_SONGS`
- The Scar of Shame (1927) — `PUBLIC_DOMAIN_FILM_COPY_WITH_MODERN_SCORE`
- Merri Melodies shorts — `PUBLIC_DOMAIN_CLAIM_COLLECTION_WITH_RENEWED_SONG`
- NASA's Documentary Film - Hubble25 — `US_GOVERNMENT_WORK_WITH_THIRD_PARTY_ELEMENTS`
- Sita Sings the Blues (2008) — `CC_BY_SA_FILM_WITH_SEPARATELY_LICENSED_SONGS`
- The Phantom of the Opera (1925) — `PUBLIC_DOMAIN_FILM_REPLACEMENT_NOT_APPLIED`
- Carnival of Souls (1962) — `PUBLIC_DOMAIN_FILM_REPLACEMENT_NOT_APPLIED`
- Within Our Gates (1920) — `PUBLIC_DOMAIN_FILM_RESTORATION_AND_SCORE_HELD`
- Night of the Living Dead (1968) — `PUBLIC_DOMAIN_FILM_REPLACEMENT_NOT_APPLIED`

## Owner/counsel decision: on Roku and Fire TV today, but the app audit disputes them (4)

These stay on Android under the proposed rule (they pass the Roku rule). Each can be withdrawn from Android with `androidHold`, and from Roku with `rokuHold`; The Exile and Dead Air are also on the Fire TV code list.

- Elephants Dream (2006) — `OPEN_LICENSE_VERSION_CONFLICT`
- ARÍỌRÍ (REINCARNATION)- ITAN — `SIGNED_CREATOR_LICENSE_THIRD_PARTY_RIGHTS_PENDING`
- Dead Air — `SIGNED_CREATOR_LICENSE_AUTHORITY_UNVERIFIED`
- The Exile (1931) — `PUBLIC_DOMAIN_US_NOT_YET_EFFECTIVE`
- The Exile (1931): the audit says its U.S. term runs through 2026-12-31 (U.S. public domain 2027-01-01).
- Dead Air: the signed record requires confirming the licensor's signing authority; that confirmation was not found.
- Elephants Dream: CC BY 2.5 vs 3.0 conflict in the evidence (both attribution licenses).
- ARÍỌRÍ (REINCARNATION) - ITAN: third-party rights pending under the signed license.

## To deploy (after approval)
Merge `feature/android-rights-policy` into the release branch, run the suites, deploy, then verify with
`curl -A "PROtv/1.0.0" https://watchprotv.com/api/v1/catalog?view=all` (expect 40) and unchanged web/Roku/Fire TV/Samsung counts.
Rollback: promote the previous Vercel deployment.

