# PROtv 3.0 Admin AI Upgrade - Handoff

## Git state
- Branch: `protv-3.0-admin-ai` (not pushed, not merged, not deployed)
- Feature commit: `4fdc7a9` feat: PROtv 3.0 admin AI acquisition foundation
- Base: `fcdbdc5` on `main`; rollback tag `pre-3.0-ai-upgrade-checkpoint`
- Untracked and intentionally NOT committed: `frontend/.env.example` (unrelated)

## Completed stages
1. **Catalog-wide duplicate detection** - `backend/src/acquisition/titleMatcher.js`, `duplicateDetector.js`. Checks ALL records (draft, errored, processing, hidden); handles articles, editions, "DVD quality", underscores, alternate titles; missing year = possible duplicate; source id/URL matches; rechecked in `/web-ingest` (409) and `webCatalogService.createDraft`. Never deletes.
2. **Public-domain rights classification** - `rightsClassifier.js`. Likely PD / Needs Review / Not Cleared; pre-1931 US rule; restoration/score markers and IA labels on newer films -> Needs Review; CC NC/ND -> Not Cleared. Needs-review ingest requires `rightsReviewed:true` + `rightsNote`. Evidence stored on drafts. Owner approval to publish and Mux ingestion unchanged.
3. **Intelligent film discovery** - `genres.js`, `filmAnalysis.js`, `filmDiscoveryService.js`; `internetArchiveService.js` (`searchFilms`, genre rotation, hardcoded searches removed); `omdb.js` `getTitleDetails`. Routes `GET /admin-bot/film-discovery`, `GET /admin-bot/duplicate-check`. Kind classification, alternate-upload clustering, explainable scoring, optional OMDb enrichment, `offset` for "more".
4. **Tool-assisted admin assistant** - `admin/assistantTools.js` (7 read-only tools), `admin/assistantAgent.js` (bounded loop: 5 rounds, 8 calls, 90s; deterministic fallback with explicit AI-unavailable notice), `adminAssistantResponseService.js` (`complete()`, canned discovery reply removed), `adminAssistantService.js`. Writes remain regex + confirmation. `query()` returns `research`.
5. **Multi-content intelligence** - `contentTypes.js`: movie / music / podcast-show / podcast-episode / original / episode. Write guards refuse movie metadata/category changes on music and podcast records.

## Tests
- `cd backend; node --test`: **227 pass, 0 fail** (baseline 51 before the upgrade).
- New: `backend/test/admin3Upgrade.test.js` (17 regression tests for stages 1-5).
- Intentionally changed older tests: two canned-discovery tests, pagination test, "ignore non-public records" test, CC-BY rights expectation.

## Verified end-to-end (read-only, local)
Real Express app with Firebase/Mux/AI/OMDb unset, local `.data` store (21 records), live Internet Archive metadata. "Find quality horror movies we don't own" returned 10 researched films, excluded owned titles (Carnival of Souls, Night of the Living Dead, Nosferatu variant); "give me 3 more" returned ranks 11-13.

## Known problems / unverified
- Model tool loop tested only with a mock; not run against the real AI provider (tool-call support unknown). Fallback path is verified.
- OMDb enrichment mock-tested only; no key locally, so no ratings (IA downloads used as labeled popularity proxy).
- Frontend does not send `rightsReviewed`, `rightsNote`, `confirmDuplicate`; needs-review films cannot be ingested from the UI yet. No duplicate/rights badges in UI.
- Music/podcast/original assistant paths covered by unit tests only (local catalog is all movies).
- Scores are heuristics; rights triage is not legal advice.
- Wikimedia/YouTube/PDM adapters lightly integrated; write actions still regex-driven; confirmations in-memory (lost on Vercel cold start).
- `getAllVideos` silently falls back to local storage on Firestore error; `getAllVideosAdmin` orderBy `submittedAt` drops docs lacking it.
- Health summary reports existing internal duplicate records in the local catalog (e.g. Nosferatu, Metropolis); not cleaned up.

## Production status
NOT deployed. Not pushed. Production Firestore, Mux and data untouched.

## Remaining pre-deployment tasks
1. Minimal frontend tweak: duplicate/rights badges and `rightsReviewed`/`rightsNote`/`confirmDuplicate` inputs in `AdminBotPanel.jsx` / `api.js`.
2. Test the tool loop on staging with the real AI provider; confirm `research.mode` = `ai-tools`.
3. Set `OMDB_API_KEY` if ratings are wanted; verify enrichment.
4. Verify against real Firestore on staging (all-status catalog read, duplicate exclusion).
5. Owner review of branch, then approve merge/deploy.

## Safety constraints for next session
- Do not push, merge, or deploy without explicit owner approval.
- Do not modify production Firestore, delete records, change Mux assets, import/publish movies, or download media.
- Demos: run with `FIREBASE_SERVICE_ACCOUNT_KEY` unset (local `backend/.env` may point at real Firestore). Never print secrets.
- No paid API calls in tests/demos; use mock providers.
- Do not give the AI unrestricted write access; keep confirmation flows and owner approval for publishing.
- Leave unrelated `frontend/.env.example` alone. Do not reset/stash/discard.
