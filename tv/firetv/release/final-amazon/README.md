# PROtv Fire TV Amazon Appstore submission package

**Status: incomplete Amazon draft; not ready to submit.** An owner-authorized app entry was created in the signed-in Developer Console account. No app binary was uploaded, and no listing was published or submitted.

## Contents

- `store-listing.md` — proposed listing copy, metadata, and reviewer notes.
- `privacy-data-review.md` — observed Fire TV data flows and deletion/privacy blockers.
- `rights-launch-review.md` — reuse of the Roku rights review, restricted-title list, and approval queue.
- `rights-launch-matrix.md` — title-level owner/counsel triage with exact catalog IDs; no catalog edits.
- `test-results.md` — latest automated and owner-reported physical test evidence.
- `submission-checklist.md` — technical and console checklist.
- `owner-approvals.md` — concise unresolved decisions and credentials needed.
- `rollback.md` — frozen source, tag, APK identity, and recovery constraints.
- `artwork/` — original PROtv-branded artwork and selected real Firestick screenshots.

The unsigned `app-release-unsigned.apk` is **not** copied into this package as a submission binary. Do not upload it. Current backend, frontend, Android, and dependency-audit results are recorded in `test-results.md`. A production-signed build, tested deletion path, approved rights scope, and final owner authorization are still required.

## Frozen release reference

- Branch: `feature/firetv-final-rc-20261024`
- Verified app source: `d2a6965250a9cc928c38c99f175332dbaa04c788`
- Rollback tag: `firetv-rc1-rollback-20261024`
- Documentation/package commit: see the current branch HEAD.
- Package: `com.protv.firetv`, version `0.2.0-rc1` (code 2).
- Owner-approved first public release target: version `1.0.0` (code 3); the candidate must still be rebuilt and signed after the owner provisions the production keystore locally.

## Amazon Developer Console checkpoint (2026-10-24)

- The signed-in account's App List showed 0 apps before this task; no existing PROtv listing was found in that account.
- With owner approval, created an incomplete draft app titled **PROtv**, category **Movies & TV > On-Demand Movie Streaming**. Amazon app ID: `amzn1.devportal.mobileapp.61f50bb711ba4d768754cb2462dd8b19`. Draft release ID: `amzn1.devportal.apprelease.ca213de1703a4a5183eb85986b936e7e`.
- The form's account-default support contact was selected at the owner's direction; Amazon states this contact is accessible to customers. Review or replace it with an owner-approved monitored public support channel before publication.
- The Console is at **Step 1: Upload your app file**. No file has been uploaded. The available local release APK is unsigned and must not be uploaded.
- The **Appstore Certificate Hashes** request returned HTTP 500. The dialog explained that Amazon removes the developer signature during ingestion and applies an account-specific Amazon signature. The unavailable hashes are Amazon's distribution certificate hashes; they are not the developer upload-key fingerprints and are not a substitute for a developer-signed APK.
- This account has no prior app entry or release history, so no prior app-specific upload certificate was found in Console. The historical signed 0.1.0 APK at `D:\protv` is not the current release; its certificate fingerprint is recorded in `test-results.md`, but its private key was not found. Do not use the debug keystore or assume the historical certificate can be reproduced.
- A release signing configuration now accepts the four `PROTV_RELEASE_*` environment variables and rejects partial configuration or a keystore inside the repository. No keystore was created or configured because the production signing identity still needs explicit owner authorization.
- No target devices, marketplace, pricing, ratings, privacy answers, deletion URL, or listing screenshots were selected. The draft remains incomplete and not published.

All Firestick captures in `artwork/` are authentic AFTMM device screenshots at 1920x1080. Screenshots containing catalog art are for internal owner review only until rights clearance for those displayed titles/artwork is confirmed.

## Official Amazon references

- [Presubmission checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html)
- [Fire OS device filtering and compatibility](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html)
- [Appstore details and Fire TV image requirements](https://developer.amazon.com/docs/app-submission/appstore-details.html)
- [Privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html)
- [User account and data deletion](https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html)
- [Test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html)
- [Submission workflow](https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html)
