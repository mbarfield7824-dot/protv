# Approved legacy poster implementation (2026-10-21)

## Scope and approval

The owner approved the local revised set and explicitly requested implementation after viewing the comparison.
This supersedes the original ZIP's quality-review hold, not the copyright status of the underlying films.
Only the exact ten IDs in [the asset manifest](../public/assets/legacy-posters/20261021/manifest.json) are eligible.
No creator-submitted artwork is eligible. Eight legacy records retain `copyrightStatus: unknown`; this task does not
change rights fields or certify film distribution rights.

Assets are ten JPEGs at 900 x 1350, quality 95, 4:4:4, under
`public/assets/legacy-posters/20261021/`. The editable original `50-classic-cartoons.svg` accompanies its raster.
Cartoons was completely rebuilt with original vector graphics. The other nine are owner-supplied montage derivatives
with cleaned borders, proportional reduction, restrained sharpening and matching dark frames. They are not represented
as native-resolution restorations. The manifest records exact SHA-256 hashes and provenance.

## Backward compatibility and controlled hosting

The existing viewer API and installed TV implementation already prefer `posterUrl`.
There is no supported `tvPosterUrl` field. Change **only `videos/{id}.posterUrl`**.
Leave `thumbnailUrl`, `heroImageUrl`, rights metadata, playback IDs, watch progress and account records untouched.

Public JPEG objects use this immutable, content-addressed path:

```text
https://storage.googleapis.com/protv-2f48e.firebasestorage.app/legacy-posters/20261021/{sha256}/{filename}
```

Only these approved asset objects receive public-read ACLs; no bucket-wide permission or creator object changes.
No external hotlinks, signed URLs, expiring credentials, web deployment or application deployment are needed.
Repository copies remain the versioned source. The public folder's presence in Git does not imply a deployed website.

## Guarded rollout tool

[legacyPosterRollout.js](../backend/scripts/legacyPosterRollout.js) is an explicit one-shot tool, not a server startup task.
It never imports the application's local-storage fallback. It requires the expected Firebase project and fixed manifest.

From PowerShell, with existing dependencies in the original checkout:

```powershell
$env:NODE_PATH = 'D:\protv\backend\node_modules'
$env:PROTV_POSTER_CREDENTIALS = 'D:\protv\backend\serviceAccountKey.json'
node .\backend\scripts\legacyPosterRollout.js dry-run 'C:\absolute\private\new-dry-run.json'
# Only with owner implementation approval:
node .\backend\scripts\legacyPosterRollout.js apply 'C:\absolute\private\new-rollback-checkpoint.json'
```

Use a fresh absolute checkpoint path outside the repository. Credentials, rollback snapshots and raw embedded
legacy images must not be committed. The tool opens checkpoints exclusively and syncs them to disk before uploads or writes.

The dry run validates all ten local files, exact film-title matching, MOVIE content type and lack of creator provenance.
The apply step:

1. Revalidates everything; refuses already-applied mappings.
2. Saves exact old `posterUrl` value **and field presence**, plus all-document verification hashes, locally.
3. Creates only missing immutable objects (no overwrites), verifies stored bytes and public HTTP round trips.
4. Atomically updates all ten `posterUrl` fields after full-document concurrency and provenance checks.
5. Reads the catalog again and checks all non-poster fields and all other documents are unchanged.
6. Writes a local `.result.json` verification record.

If upload/public ACL verification fails, no catalog update occurs; already-staged objects can remain harmlessly unreferenced.
If a concurrency or verification check fails, stop and inspect the checkpoint; there is no silent fallback or automatic overwrite.
No source, account or playback-data migration accompanies this update.

## Rollback

```powershell
node .\backend\scripts\legacyPosterRollout.js rollback 'C:\absolute\private\new-rollback-checkpoint.json'
```

The original manifest must match the checkpoint. Rollback checks the exact IDs, creator guards, current new URLs and unchanged
non-poster fields, then restores all ten original values/presence atomically (including deleting originally absent fields).
It refuses subsequent edits rather than clobbering them. Assets remain in controlled storage for recovery and cache stability.

## Validation

```powershell
$env:NODE_PATH = 'D:\protv\backend\node_modules'
node --test .\backend\test\legacyPosterRollout.test.js
```

Tests cover exact IDs, creator/identity/type guards, absence/null/empty URL preservation, concurrent-edit-safe rollback,
stable hashes and exact JPEG bytes/decode/dimensions.
After rollout, independently verify all ten public catalog URLs, 900 x 1350 dimensions and bytes against the manifest.
Browse the existing installed Fire TV app without playback; capture actual homepage/movie rails and focused cards,
check drawer navigation and retained login, and compare the watch-progress preference hash before/after.
No APK rebuild/install is necessary for a data-only artwork update. Never alter the signed release APK.
