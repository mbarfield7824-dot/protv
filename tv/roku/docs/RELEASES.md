# Roku release checkpoints

## roku-v0.5.5-working (2026-10-23)

Owner-verified on a physical Roku TV: account linking, saved sign-in and
PROtv playback controls (OK, Play/Pause, Left/Right, Back) work.

| Item | Value |
| --- | --- |
| Git tag | `roku-v0.5.5-working` (annotated, local) |
| Commit | `c86eea1fc8d3f6cb70ec0b78b9bceb916f126ca9` |
| Branch | `feature/issue-7-roku-phase-1` (not pushed, not merged) |
| Manifest | 0.5.5 |
| Sideload ZIP | `dist/releases/protv-roku-v0.5.5-working.zip` (read-only) |
| SHA-256 | `8e5cb5fba0548a103658f84ca9f79dd6ca3a205f98eee321eb233c633db61331` |

This build still contains the temporary sign-in diagnostics (console
`PROtv AUTH` lines and the "diagnostic" label on the Account screen). They log
shapes and lengths only, never token values.

`dist/` is not in Git. If the ZIP copy is lost, rebuild it from the tag (the
packager injects the public Firebase web key from `frontend/.env`):

```
git checkout roku-v0.5.5-working
cd tv/roku
npm ci
npm run build
```

The rebuilt ZIP should match the SHA-256 above, given the same `frontend/.env`
key. If it does not, compare the key first.

### Roll back the TV

1. Open `http://<Roku IP>` on a computer on the same network and sign in as
   `rokudev`.
2. Upload `dist/releases/protv-roku-v0.5.5-working.zip` and choose Replace or
   Install.
3. Check that the Account screen footer reads `PROtv Roku 0.5.5`.

A saved sign-in and guest progress live in the app's registry section and
survive a reinstall of the same developer app.

### Roll back the code

- Inspect: `git checkout roku-v0.5.5-working` (detached), then
  `git switch -` to return.
- Discard later local Roku commits on the branch:
  `git reset --hard roku-v0.5.5-working`. This deletes those commits from the
  branch, so tag or branch anything worth keeping first.
- Undo one later commit but keep history: `git revert <commit>`.
