# Roku view reporting (prepared, not released)

Branch `feature/roku-view-reporting`, based on the frozen RC9 commit. The released Roku app does not report views. This build must go through a new release candidate, signing with the existing key and Roku's review before any viewer has it. The backend already accepts these events, so no further backend deploy is needed.

- **How it reports:** `POST /api/playback/events` with `platform: "roku"`, the same public route the website uses. The package contains no server secret and needs no reporting token.
- **What counts:** 30 seconds of forward playback at normal speed. Paused, buffering and seeking time adds nothing. The server separately requires 30 seconds between the recorded start and the view.
- **Duplicates:** one view per TV per title in any 24 hours, using a random ID in the app's registry. Sessions are single-use.
- **Separate counts:** Roku counts go to `rokuViews` and `rokuPlayStarts`, and never deduplicate against the website. Add them to the Creator Portal only once this build is live, and change its "Not counted yet" label at the same time.
- **Before release:** the privacy policy's "Watch progress saved while browsing as a guest stays on that TV" stays true, but add that the app sends a random device ID and play events. Roku certification and on-device testing are still required.
