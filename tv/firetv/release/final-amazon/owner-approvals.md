# Owner actions still needed (2026-10-25)

Only these items need the owner. Everything else is done or in `RELEASE-CHECKLIST.md`.

1. **Signing-key backup (C: original, D: encrypted backup).** Run `D:\protv-firetv-artifacts\tools\Backup-ProtvFireTvKey.ps1 -CopyPasswordsToClipboard`, then `-Destination D:\PROtv-signing\firetv-amazon-upload`. Confirm when it reports "BACKUP VERIFIED".
2. **Replace the Firestick app.** Explicit approval to uninstall the debug RC (`com.protv.firetv`, code 2) and install the signed code-4 APK, plus ADB access: Fire TV Settings > My Fire TV > Developer options > ADB debugging on, and the Firestick's IP address (Settings > My Fire TV > About > Network).
3. **Physical tests.** Work through `physical-test-checklist.md` with the remote; report PASS/FAIL.
4. **Catalog and territory.** Confirm the 49 live titles are approved for the Amazon **US-only** launch, as for Roku.
5. **Content rating facts.** What Dead Air's TV-MA rating covers (violence, gore, sex/nudity, language), and the content of The Bundy Chronicles and Sita Sings the Blues. See `amazon-console-answers.md` §4.
6. **Reviewer account.** Create a normal (non-admin) viewer account on watchprotv.com and enter its credentials directly in the console.
7. **Console access.** This Claude session has no browser control. Either enable a browser tool (Claude in Chrome) signed in to the Amazon Developer Console, or enter `amazon-console-answers.md` and `store-listing.md` yourself.
8. **Final approval** to submit for review.

No credentials, personal data or legal conclusions are stored in this repository.
