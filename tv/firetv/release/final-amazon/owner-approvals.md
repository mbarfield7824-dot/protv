# Owner actions still needed (2026-10-25)

Only these items need the owner. Details are in `AMAZON-LAUNCH-CATALOG.md` and `RELEASE-CHECKLIST.md`.

## Decisions

1. **Launch catalog.** Recommended: the 28 group A titles, served to Fire TV through a server-side allowlist (backend deploy + app code 6 sending `X-PROtv-Platform: firetv`; Roku, the website and Firebase data unchanged). Alternatives: hold titles for every client, or launch all 49 (not recommended).
2. **Creative Commons attribution.** The Fire TV app shows no credit or licence for the 4 Blender films. Approve a small code-6 fix (credit shown in the player and More Info), or leave those 4 out.
3. **Three poster replacements** (His Girl Friday, The Duke Is Tops, The Incredible Petrified World) with the original PROtv designs staged on the Roku RC9 branch. Production change.

## Facts only the owner can confirm

4. **Creator contracts.** The signed schedules for The Lost Camp and Dead Air cover Amazon / Fire TV distribution in the US, and the creator posters.
5. **Artwork.** Who made the "owner-supplied PROtv posters", and whether the image tool used for the "generated legacy set" allows commercial use.
6. **Dead Air content.** What its TV-MA rating covers: violence, gore, sex/nudity, language.

## Hands-on

7. **Sign-in tests on the Firestick** (`physical-test-checklist.md` #13–#20). Needs a phone and a PROtv account.
8. **Reviewer account.** A normal (non-admin) watchprotv.com account, typed directly into the console.
9. **Console access.** No browser tool in this session. Enable Claude in Chrome, or enter `amazon-console-answers.md` (§0 gives the order) yourself.
10. **Password manager.** `Backup-ProtvFireTvKey.ps1 -CheckPasswordEntry` reports MATCH.
11. **Final approval** to submit.

No credentials, personal data or legal conclusions are stored in this repository.
