# Fire TV backend compatibility release

Status: prepared and locally tested; **not deployed**. Do not deploy the current dirty
workspace. This release does not include Android, website, creator-agent, Firebase
configuration, credentials, dependency updates, data migrations, or release APKs.

## Exact scope

Only these three runtime files are required:

| File | Change |
| --- | --- |
| `src/catalog/readModel.js` | Add optional normalized ISO `publishedAt`, `approvedAt`, `createdAt`, `submittedAt` fields. Leave eligibility, existing fields, catalog ordering, and playback contracts unchanged. |
| `src/routes/users.js` | Read both stored progress shapes. Write nested per-title progress with recursive merge, remove that title's obsolete literal dotted field, and reject non-finite inputs. Explicit DELETE removes only that title in both shapes. |
| `src/watchProgress.js` | Read-only legacy recovery helper; choose the newer timestamp, prefer nested on ties, and retain undated legacy-only sessions. |

Release verification files:

- `test/catalogReadModel.test.js`
- `test/watchProgress.test.js`
- `test/usersWatchProgress.test.js`
- This document, `docs/firetv-backend-release-plan.md`

Paths in this document are relative to `backend` unless stated otherwise. Existing
`backend/README.md` changes are documentation only and not a runtime dependency;
exclude them from the isolated release to avoid unrelated documentation hunks.
The deployment diff must contain exactly the seven files listed above.

## Dependencies and compatibility

- No manifest, lockfile, environment, Firestore rule, index, or npm dependency change.
  Reuse the production Node runtime, Express, Firebase Admin SDK, middleware, and
  existing catalog modules (`music`, `releases`, `podcasts`).
- Preserve existing Firebase Admin credentials and project binding. Progress routes
  require working Firestore and verified viewer Firebase ID tokens, as before.
- Existing clients see the same catalog envelope and existing field types. Missing,
  invalid, zero, and out-of-range dates are omitted, not replaced with synthetic dates.
  Old published records without dates remain browseable and playable.
- The API still sorts catalog entries by ID. Featured ordering belongs to the TV app,
  not this backend deployment. The installed app uses publication, approval, creation,
  then submission date; recent Originals get priority. It never uses film release year.
  Catalog refresh picks up metadata without another APK.
- Verify real source dates on representative recent titles. Creation/submission are
  fallbacks, not proof of publication. Titles without any trustworthy dates retain
  the manual/fallback TV selection. Do not backfill dates with film years or deployment
  time; any editorial metadata correction is a separate approved change.
- GET progress does not mutate documents. PUT changes only the explicitly requested
  title and removes only its superseded legacy field; recursive merge preserves
  sibling titles and unrelated user data. Normal same-title updates can move backward
  after a seek. Concurrent cross-device saves remain last-write-wins, as before.
- Local TV checkpoints already preserve new sessions across restart without this
  deployment. Older server-only history recovery requires this release.

## Build an isolated candidate (no deployment commands executed here)

1. In the hosting dashboard for **watchprotv.com**, record the current production
   deployment ID/URL and its exact Git SHA. Confirm the project actually serving
   `/api/v1/catalog` and `/api/users/me/progress`. The repository routes these through
   root `api/index.js` and `vercel.json`; the shared Render **creator-agent** service
   is not evidence that it hosts these viewer routes. Do not deploy there by assumption.
2. Record current environment bindings and the previous immutable deployment for
   rollback, without exporting secrets into the repository. Confirm production
   Firestore recovery/backup coverage under the owner's normal process.
3. Use a new worktree based on that production SHA, not the local dirty HEAD.
   Local reviewed baseline is `e7db4b8299c5627194120ad3e7bf6efe3c0fcf54`;
   it has **not** been established as the deployed SHA. In PowerShell:

   ```powershell
   $productionSha = '<verified-production-Git-SHA>'
   $reviewedBase = 'e7db4b8299c5627194120ad3e7bf6efe3c0fcf54'
   Set-Location D:\protv
   git diff --exit-code $productionSha $reviewedBase -- backend/src/catalog/readModel.js backend/src/routes/users.js backend/test/catalogReadModel.test.js
   if ($LASTEXITCODE -ne 0) { throw 'Production differs: port reviewed hunks and re-review; do not copy whole files.' }
   git worktree add -b release/firetv-backend-compat D:\protv-firetv-backend-release $productionSha
   ```

   Before creating the candidate, verify the target path and branch do not already
   contain unrelated work. If either exists, choose a new explicit path/branch.
4. When the baseline comparison is clean, copy **only** these reviewed files:

   ```powershell
   $files = @(
     'src\catalog\readModel.js', 'src\routes\users.js', 'src\watchProgress.js',
     'test\catalogReadModel.test.js', 'test\watchProgress.test.js',
     'test\usersWatchProgress.test.js', 'docs\firetv-backend-release-plan.md'
   )
   foreach ($file in $files) {
     Copy-Item -LiteralPath (Join-Path 'D:\protv\backend' $file) `
       -Destination (Join-Path 'D:\protv-firetv-backend-release\backend' $file)
   }
   Set-Location D:\protv-firetv-backend-release
   git status --short
   git diff --check
   git diff -- backend/src/catalog/readModel.js backend/src/routes/users.js backend/test/catalogReadModel.test.js
   ```

   Review all new files too. Confirm no missing module imports relative to the
   production baseline. If dependencies differ, stop and rebase/review; do not add
   unrelated modules to make the candidate boot.
5. With explicit owner approval to prepare a commit, stage only the seven paths,
   confirm `git diff --cached --name-only` matches the allowlist, and commit them
   with a `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
   trailer. Do not stage with `git add .`.
6. Restore dependencies from the unchanged lockfiles only if missing in this clean
   worktree. For backend-only tests use `npm ci` in `backend`, then:

   ```powershell
   Set-Location D:\protv-firetv-backend-release\backend
   node --test test\catalogReadModel.test.js test\watchProgress.test.js test\usersWatchProgress.test.js
   ```

   Expected focused result: **16 passing tests**. Then run `npm test` for the
   release candidate's broader backend suite. A Firebase-not-configured warning in
   local fixture tests is not evidence of production Firestore validation.

## Preview/staging verification gates

Only after the isolated candidate and hosting target are approved, create a preview
using that clean branch and the existing project's build configuration. For Vercel,
the existing root build installs root/frontend lockfiles and builds the baseline
frontend even though this change is backend-only. Do not deploy from `D:\protv`;
do not change build settings or production domain aliases during preview validation.
Use a staging Firebase project or designated owner-approved test viewer; never replay
another viewer's token or bulk-edit production documents.

1. Compare before/after `GET /api/v1/catalog?view=all`: identical title IDs and count
   for a stable catalog, same existing fields, no newly visible draft/rejected/
   processing titles, only the four optional date fields added. Account for any
   legitimate concurrent publication changes rather than masking differences.
2. Check a recent approved playable movie, an older undated movie, and a dated
   classic. Confirm date values against source documents and unchanged title-detail
   and `/api/v1/catalog/titles/{id}/playback` behavior. Do not log playback tokens.
3. On an isolated staging viewer, seed nested title A and legacy literal title B,
   plus unrelated favorites/profile fields. GET must return both. Include newer/
   older conflicts, backward positions, ties, and missing `updatedAt`.
4. PUT B using the unchanged body `{positionSeconds, durationSeconds}`. Inspect the
   actual Firestore document: nested B exists, literal B is gone, A and unrelated
   fields are byte-for-byte unchanged. Test a title ID containing a dot to ensure
   it remains a single literal map key. Use the real SDK/emulator, not just mocks.
5. DELETE only the staging test B. Both shapes of B must disappear; A and unrelated
   fields remain. Invalid requests must return 400 without any document write.
   Missing/invalid auth must remain rejected. No production history deletion test.
6. Exercise the existing web client against preview and verify its tolerant catalog
   parsing, favorites, progress read/write, and playback still work.
7. With the TV pointed at an approved preview build if needed, verify catalog refresh,
   expected featured order from actual dates, legacy Continue Watching recovery,
   resume, pause/exit, and restart. Keep production TV data/login intact.

Local coverage: metadata normalization and missing-date availability/old field
compatibility; existing catalog router/playback behavior; nested progress write
shape, sibling preservation, invalid-input no-write, legacy restoration and explicit
delete; undated history and nonmutating merge; Android date-vs-release-year priority.
The progress route test uses a Firestore mock. Real SDK staging merge semantics,
production source-date availability, hosting identity, and old-client preview smoke
checks remain release gates, not locally verified claims.

## Production approval and rollback

After every preview gate passes, the owner explicitly approves promotion of the
recorded candidate deployment to the confirmed viewer API project. Monitor health,
catalog title count/IDs, playback errors, auth failures, progress PUT/GET errors and
representative stored documents immediately and after a restart/cross-device check.
Do not deploy the unrelated Render creator agent or change Firebase configuration.

Rollback must keep the **corrected progress reader/writer**. Reverting to the old
code reintroduces dotted writes and stops recovering legacy-only sessions; newer
dotted updates can also be hidden behind an older nested checkpoint.
If only metadata causes trouble, release a clean hotfix reverting only the
`readModel.js` timestamp projection while retaining progress fixes. The TV safely
falls back without dates.

For a service outage, restore the recorded immutable deployment temporarily through
the hosting dashboard, acknowledge that old progress behavior returns, and immediately
prepare a compatibility hotfix retaining the corrected reader/writer on that baseline.
Do not reverse-migrate documents, delete nested maps, restore an entire Firestore
backup over newer viewer activity, or clear TV app data. Retain both data shapes on
read; no bulk migration is required. Risks are mixed-version progress writers,
last-write-wins same-title saves, missing/inaccurate editorial timestamps, and a
wrong deployment target/base accidentally including unrelated work.

**Next owner action:** authorize preparation of the isolated candidate and identify
the production viewer-API project/deployment SHA. Approve preview validation before
any production promotion. No deployment is authorized by this document.
