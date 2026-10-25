# Owner actions still needed (2026-10-25)

Only these items need the owner. Everything else is done or in `RELEASE-CHECKLIST.md`.

1. **Sign-in tests on the Firestick** (`physical-test-checklist.md` #13–#20). PROtv code 5 is installed. Sign in with a phone, then check My List, resume, the two QR screens, a phone scan of the deletion QR, an unplug/replug, and sign out/in.
2. **Catalog and territory.** Confirm the 49 live titles are approved for the Amazon **US-only** launch, as for Roku. Also confirm that the posters and film frames in `screenshots/` may appear in the store listing.
3. **Content-rating facts.** What Dead Air's TV-MA rating covers (violence, gore, sex/nudity, language), and the content of The Bundy Chronicles and Sita Sings the Blues. See `amazon-console-answers.md` §4.
4. **Reviewer account.** Create a normal (non-admin) viewer account on watchprotv.com and type its credentials directly into the console.
5. **Console access.** This Claude session has no browser control. Either enable a browser tool (Claude in Chrome) signed in to the Amazon Developer Console, or enter `amazon-console-answers.md` (§0 gives the order) and `store-listing.md` yourself.
6. **Password manager.** Run `Backup-ProtvFireTvKey.ps1 -CheckPasswordEntry` once and confirm MATCH.
7. **Final approval** to submit for review.

No credentials, personal data or legal conclusions are stored in this repository.
