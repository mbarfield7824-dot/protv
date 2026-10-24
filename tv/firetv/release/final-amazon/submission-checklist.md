# Submission checklist

## Binary and app configuration

- [x] Package ID inspected: `com.protv.firetv`.
- [x] Current RC version inspected: `0.2.0-rc1`, code `2`.
- [x] Launcher declares `android.software.leanback`; touchscreen is optional.
- [x] Landscape orientation declared.
- [x] Permission review: manifest declares `INTERNET` only.
- [x] Backend release URL guard requires HTTPS for a release build.
- [ ] Select intended Fire OS devices in Developer Console and confirm compatibility. `minSdk 23` excludes API-22 devices.
- [ ] Confirm current target API/SDK requirements in the Developer Console at upload; public docs reviewed here describe manifest-based device filtering but did not establish a current numeric target threshold.
- [ ] Approve final public version name and increment version code above 2 as needed.
- [ ] Configure a production release signature securely; no key/config found.
- [ ] Rebuild from the approved source, verify package/version, signature, certificate, and alignment.
- [ ] Complete final signed-build test and physical installation only after comparing with the intended package signing identity.

## Testing and policy

- [x] Unit tests: 104/104 passed.
- [x] Release lint: 0 errors, 10 warnings.
- [x] Release assembly: succeeded unsigned.
- [ ] Review and resolve/accept each lint warning before release.
- [ ] Complete Amazon content rating questionnaire with owner-approved answers.
- [ ] Approve exact live-catalog allowlist, soundtrack/source-copy/version and territory. Keep seven restricted titles restricted.
- [ ] Review captions/subtitles and applicable accessibility policy.
- [ ] Complete privacy labels based on Firebase, backend/hosting, streaming and other processor confirmations.
- [ ] Implement and verify a real account-deletion request and fulfillment route; obtain policy/retention approval.
- [ ] Verify remote navigation and playback on the signed candidate. Existing 9/9 tests are owner-reported for RC1, not a signed release.
- [ ] Provide a tested non-admin reviewer account via Developer Console only; never include credentials in Git.

## Store metadata and assets

- [x] Listing copy draft in `store-listing.md`.
- [x] Original branded 1280x720 icon and 1920x1080 background concepts prepared in `artwork/`.
- [x] Four authentic 1920x1080 Firestick screenshot captures staged in `artwork/`.
- [ ] Owner approves icon, background, screenshot selection, and any displayed third-party/catalog artwork rights.
- [ ] Select 3–10 accurate, distinct screenshots; required Fire TV dimensions: 1920x1080 landscape, JPG or 24-bit PNG, no transparency.
- [ ] Review listing copy, category, keywords, support contact, territories, price, rating, and release notes.
- [ ] Confirm account deletion URL and privacy URL in Developer Console.

## Amazon console

- [ ] Confirm existing listing for `com.protv.firetv`; do not create a duplicate.
- [ ] Review app-specific signing/update constraints and use the matching private key.
- [ ] Complete privacy, account/data deletion, rating, device selection, listing, and asset fields.
- [ ] Upload only the final signed, verified release binary.
- [ ] Owner explicitly authorizes submission for publication.

Official sources: [presubmission checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html), [device filtering](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html), [listing details and images](https://developer.amazon.com/docs/app-submission/appstore-details.html), [privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html), [account/data deletion](https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html), and [test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html).
