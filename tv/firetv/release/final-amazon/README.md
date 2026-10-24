# PROtv Fire TV Amazon Appstore submission package

**Status: owner review package; not ready to submit.** No Amazon Developer Console changes or production deployment were made.

## Contents

- `store-listing.md` — proposed listing copy, metadata, and reviewer notes.
- `privacy-data-review.md` — observed Fire TV data flows and deletion/privacy blockers.
- `rights-launch-review.md` — reuse of the Roku rights review, restricted-title list, and approval queue.
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

All Firestick captures in `artwork/` are authentic AFTMM device screenshots at 1920x1080. Screenshots containing catalog art are for internal owner review only until rights clearance for those displayed titles/artwork is confirmed.

## Official Amazon references

- [Presubmission checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html)
- [Fire OS device filtering and compatibility](https://developer.amazon.com/docs/app-submission/device-filtering-and-compatibility.html)
- [Appstore details and Fire TV image requirements](https://developer.amazon.com/docs/app-submission/appstore-details.html)
- [Privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html)
- [User account and data deletion](https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html)
- [Test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html)
- [Submission workflow](https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html)
