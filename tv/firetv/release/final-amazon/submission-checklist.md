# Submission checklist

## Binary and app configuration

- [x] Package ID inspected: `com.protv.firetv`.
- [x] RC rollback version: `0.2.0-rc1`, code `2`; public candidate: `1.0.0`, code `3`.
- [x] Launcher declares `android.software.leanback`; touchscreen is optional.
- [x] Landscape orientation declared.
- [x] Source manifest declares `INTERNET`; merged release APK also declares `ACCESS_NETWORK_STATE`, `READ_GSERVICES`, `WAKE_LOCK`, and the app-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` contributed by dependencies. Confirm these merged permissions against the final binary before upload.
- [x] Backend release URL guard requires HTTPS for a release build.
- [ ] Select intended Fire OS devices in Developer Console and confirm compatibility. `minSdk 23` excludes API-22 devices.
- [x] Signed candidate target SDK is 35. Amazon's Fire OS 16 guidance states Fire OS 16 is API 36 and identifies targetSdk below 24 as potentially blocked and 24–27 as warning-prone; this candidate is above that documented floor. Check the Developer Console's package-specific compatibility result after upload before selecting devices; no binary has been uploaded.
- [x] Owner approved first public version `1.0.0`, version code `3` (above RC code 2).
- [x] Owner authorized generation of a new production upload signing identity; no previous private key was found.
- [x] Gradle accepts local `PROTV_RELEASE_*` environment variables for signing, rejects partial configuration, and requires the keystore outside the repository.
- [x] Generated RSA-3072 production upload key stored outside Git; DPAPI-protected credential backup. See `rollback.md`.
- [x] Signed 1.0.0/code 3 APK built, verified, and aligned. See `test-results.md`.
- [ ] Create an independent encrypted offline key backup and perform a restore test.
- [ ] Complete final signed-build test and physical installation only after comparing with the intended package signing identity.

## Testing and policy

- [x] Unit tests: 104/104 passed.
- [x] Release lint: 0 errors, 10 warnings.
- [x] Release assembly: signed 1.0.0 APK verifies with the recorded upload signer.
- [ ] Review and resolve/accept each lint warning before release.
- [ ] Complete Amazon content rating questionnaire with owner-approved answers.
- [ ] Approve exact live-catalog allowlist, soundtrack/source-copy/version and territory. Keep seven restricted titles restricted.
- [ ] Review captions/subtitles and applicable accessibility policy.
- [ ] Complete privacy labels based on Firebase, backend/hosting, streaming and other processor confirmations.
- [x] Implement authenticated recent-sign-in request intake, user status, and an admin-only non-destructive review queue; not deployed and no deletion occurs.
- [ ] Resolve retention/fulfillment decisions; implement, test, and deploy verified multi-service fulfillment. Admin approval alone does not delete an account, and the Completed transition is blocked without a verified fulfillment integration.
- [ ] Verify remote navigation and playback on the signed candidate. Existing 9/9 tests are owner-reported for RC1, not a signed release.
- [ ] Provide a tested non-admin reviewer account via Developer Console only; never include credentials in Git.

## Store metadata and assets

- [x] Listing copy draft in `store-listing.md`.
- [x] Original branded 1280x720 icon and 1920x1080 background concepts prepared in `artwork/`.
- [x] Four authentic 1920x1080 Firestick screenshot captures staged in `artwork/`.
- [x] Fire TV-specific asset dimensions/encoding validated against Amazon's current guidance: app icon 1280x720 PNG, background 1920x1080 PNG, and four authentic screenshots at 1920x1080; all are 8-bit RGB without transparency.
- [ ] Owner approves icon, background, screenshot selection, and any displayed third-party/catalog artwork rights.
- [ ] Select 3–10 accurate, distinct screenshots; required Fire TV dimensions: 1920x1080 landscape, JPG or 24-bit PNG, no transparency.
- [ ] Review listing copy, category, keywords, support contact, territories, price, rating, and release notes.
- [ ] Deploy and verify the account deletion request URL and its monitored fulfillment process, then enter it with the privacy URL in Developer Console.

## Amazon console

- [x] Check signed-in account for an existing listing; App List was empty. Owner approved creating an incomplete PROtv draft (Amazon app ID and release ID are in `README.md`).
- [ ] Confirm this is the correct Amazon account and verify the intended package/signing identity before uploading any binary.
- [ ] Review app-specific signing/update constraints and use the matching private key.
- [ ] Retry Amazon certificate hashes after the Console HTTP 500 is fixed if needed for platform integrations; the dialog identifies these as Amazon's post-ingestion distribution certificate, not the developer upload certificate.
- [ ] Complete privacy, account/data deletion, rating, device selection, listing, and asset fields.
- [ ] Upload only the final signed, verified release binary.
- [ ] Owner explicitly authorizes submission for publication.

Official sources: [presubmission checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html), [device filtering](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html), [listing details and images](https://developer.amazon.com/docs/app-submission/appstore-details.html), [privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html), [account/data deletion](https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html), and [test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html).
