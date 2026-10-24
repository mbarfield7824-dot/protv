# Roku certification status (1.0.0 release candidate)

Checked against Roku's published certification criteria (sections 1–6) and the
authentication, deep-linking, ChannelStore and publishing guides, 2026-10-24.
**Not submitted and not certified.** Evidence: **TV** = owner-verified on a
physical Roku; **auto** = automated tests; **live** = read-only production
check; **owner** = needs the owner.

## Mandatory

| Req. | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1.1 | Video ads follow Roku ad rules | Not applicable | The Roku app shows no ads |
| 2.1 / 2.5 | Transactions use Roku Pay | Not applicable | Free; nothing is sold |
| 2.2 | Sign-up and sign-in entirely on the device | **Met** | v0.6: Roku email request, voice keyboards, backend-issued session (TV, auto) |
| 2.4 / 5.3 | No nested apps, browsers, links out to other apps or purchases | Met | The creator invite tile only names a website (review risk: low) |
| 3.1 | Stable, responsive, no frequent crashes | Partly verified | TV sessions v0.5.6–v0.6.1; 2-hour soak still to run (TV) |
| 3.2 | Home screen within 15 s; launch beacon | Beacon met; time unmeasured | \`AppLaunchComplete\` once (auto); catalog 100 KB in ~0.2 s (live); TV |
| 3.3 | Screen transitions within 3 s | Unmeasured | No network wait between screens except playback (TV) |
| 3.4 | Loading indicator over 3 s; respond within 10 s | **Met in 1.0.0** | Spinner for catalog, playback authorization, buffering, sign-in; 15 s request timeouts with a message (auto) |
| 3.5 | Key response within 250 ms | Unmeasured | TV |
| 3.6 | Playback within 8 s; video start beacons | Beacons automatic (Roku Video node) | Authorization ~0.15 s, manifest ~0.1 s (live); TV |
| 3.7 | Package 4 MB or less | Met | 1.0.0 ZIP 0.68 MB |
| 4.1 | Updates keep sign-in and data | Met if the same signing key is reused | RELEASE-PREP.md section 5 |
| 4.3 | Roku Event Dispatcher for apps that require sign-in | Not applicable | Sign-in optional; everything plays as a guest |
| 4.4 | Options (*) reserved during playback | Met | Not used |
| 4.5 | Screensaver untouched | Met | |
| 4.6 | Back returns to the previous screen; Back on Home exits | Met | TV, auto |
| 4.7 | Trick-play thumbnails, VOD over 15 min (42 titles) | Implemented; unverified on TV | Mux previews while seeking (auto); TV |
| 4.8 | Captions/audio description where required by law | **Open: legal decision** | No caption or alternate-audio tracks in any of 56 manifests (live) |
| 4.9 | Instant Replay 10–25 s | Met | 10 s (auto) |
| 4.10 | Bookmarks, VOD over 15 min, 30+ days | Met | Continue Watching and resume after restart (TV, v0.6.1 + backend fix b123f03) |
| 4.12 | Roku voice keyboards for email and password | Met | StandardKeyboardDialog (DynamicKeyboard), email/password domains (TV) |
| 4.2, 4.11, 4.13, 4.14, 2.3 | AAL, voice, Continue Watching tile, Instant Resume, Instant Signup | Not applicable at launch | Viewing-hour thresholds |
| 5.1 | Deep linking; invalid links go Home | Implemented; unverified on TV | movie and episode (auto); TV-TESTS.md test 3 |
| 5.2 | Direct to Play for voice playback | Deep links play directly | Voice discovery needs Roku Search content; confirm at submission |
| 6.1 | Non-zero version, incremented per submission | Met | 1.0.0 |
| 6.2 | Kids & Family rules | Not applicable | |
| 6.3 | No pornographic content; listing suitable for all ages | Met (owner confirms listing text) | |
| 6.4 | FHD + HD splash; no transparent artwork | Met | 1920x1080 / 1280x720 splash; opaque 540x405 poster |

## Dashboard (owner)

Privacy and terms URLs (the privacy policy needs the TV additions first),
support phone and contacts, sign-in reviewer account, age rating (one TV-MA,
one PG, 54 unrated), countries (rights), screenshots, signed .pkg. Values and
drafts are in store/listing.md.

## Recommended

- Website account deletion (docs/account-deletion-plan.md).
- Catalog metadata fixes (docs/catalog-corrections-proposal.md).
- Rights documentation on file for every title before choosing countries.
