# Owner actions still needed (2026-10-25)

Everything else is done or in `RELEASE-CHECKLIST.md`. Prior rights decisions, creator approvals and the Roku review are treated as established.

## Production authorizations (each reversible)

1. **Apply Roku remediation Batch 2** (`tv/roku/store/remediation/CHANGE-MANIFEST.md` on `release/roku-1.0-rc9`): the 6 replacement streams (new Mux assets; old ones kept) and the 3 approved PROtv posters. Every source and file was re-verified on 2026-10-25 against the documented checksums.
2. **Deploy `feature/firetv-launch-eligibility`** (`a2be711`): Fire TV code 6 gets the 28 launch-cleared titles; the website is unchanged. It contains the Roku filter from `58d0f28`, so it also starts filtering Roku (Roku Batch 1). After Batch 2 is verified, add the 6 swapped titles to the list (one line each).

## Hands-on

3. **Firestick, about 5 minutes:** unplug for 10 s and reopen PROtv (#14); scan the deletion QR with your phone (#19); Sign out, then sign in again (#20).
4. **Reviewer account:** a normal (non-admin) watchprotv.com account, typed directly into the console.
5. **Console access:** enable Claude in Chrome on the Amazon Developer Console, or enter `amazon-console-answers.md` (§0 gives the order) yourself.
6. **Dead Air content facts** for the rating questionnaire (violence, gore, sex/nudity, language behind its TV-MA).
7. **Final approval** to submit.
