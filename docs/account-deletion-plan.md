# PROtv account deletion: data map and implementation plan

Status: **plan only, not implemented, nothing deployed** (2026-10-23).
PROtv is operated by Prophecy Entertainment LLC. No production data, rules or
endpoints were changed while preparing this plan.

## Why it is needed

There is no way to delete a PROtv account today: no website control, no
backend route, and no use of Firebase `deleteUser` or `revokeRefreshTokens`.
Google Play requires an in-app and web deletion path for apps that create
accounts, and Apple requires in-app deletion. US state privacy laws (for
example CCPA/CPRA) and the GDPR expect deletion on request. The Roku and Fire
TV apps should send viewers to the website for this.

## Where account data lives (from the backend source)

| Store | What it holds | Proposed handling |
| --- | --- | --- |
| Firebase Authentication user | email, display name, sign-in providers | Delete after the data below is handled |
| Firestore `users/{uid}` | profile, `favorites` (My List), `watchProgress` (Continue Watching and history) | Delete the document |
| Firestore `deviceSessions` | TV sign-in sessions with `approvedByUid` (10-minute codes, then consumed) | Delete any not yet consumed for this uid; consumed ones hold no tokens and expire |
| Firebase refresh tokens (TV and web sessions) | live sessions on Roku, Fire TV and web | `revokeRefreshTokens(uid)` first, so every device is signed out |
| Roku and Fire TV local storage | saved sign-in on each TV | Cleared by the next refresh failing, which signs the TV out |
| `users/{uid}` creator fields (`creatorProjectId`, `creatorSso`, `creatorPromotional`, `creatorEpisodes`) | links to the separate Creator Agent service | **Decision needed** (see below) |
| Creator Agent service (external, `CREATOR_AGENT_ORIGIN`) | creator projects, submissions, signed agreements, payout records | **Decision needed**; that system needs its own deletion and retention process |
| Published creator titles (`videos` with `creator_` IDs) | licensed content under signed agreements | Keep while the licence runs (contract), never removed as a side effect |
| `safetyReports` | reporter uid and an optional contact email | Keep the report and remove or anonymise the reporter's uid/email, unless a legal hold applies |
| `adminAudit`, `releaseAudit` | admin actions (admin uids only) | Keep (security record) |
| `playbackView*`, `adTelemetryEvents`, `adRevenueEvents` | aggregates keyed by a one-way hash of the uid | Keep; not reversible to a person. Confirm the hash is keyed (not a plain hash of the uid) |
| Sponsor portal data | sponsor contacts and campaigns | Out of scope for viewer accounts; review separately |

## Proposed flow (website)

1. **Profile > Delete account** opens a page explaining what is deleted, what
   is kept and why, with a link to the privacy policy.
2. **Recent sign-in required**: if the Firebase sign-in is older than 5
   minutes, reauthenticate (password or Google) before continuing.
3. **Typed confirmation**: the viewer types `DELETE` and checks "I understand
   this cannot be undone".
4. `POST /api/users/me/deletion` with the fresh ID token. The backend:
   - rejects tokens older than 5 minutes (`auth_time`), custom-token TV
     sessions, and admin or owner accounts (admins are handed off manually);
   - writes a `deletionRequests/{uid}` record (`status: pending`, timestamps,
     no personal data beyond the uid);
   - revokes refresh tokens, deletes pending device sessions, deletes
     `users/{uid}`, anonymises the reporter fields in `safetyReports`, then
     deletes the Auth user;
   - marks the request `completed`, or `needs_review` for creators (below).
     Every step is idempotent, so a retry finishes a partial run.
5. The site signs out and shows "Your account has been deleted", or "Your
   viewer data is deleted; creator records are being reviewed" for creators.
6. A completion email is optional and needs a mail provider decision.

## Owner and legal decisions (blockers)

1. **Creators**: what happens to agreements, payout and tax records and
   published titles when a creator deletes their viewer account. The likely
   answer is to keep contract and financial records for the legally required
   period and keep licensed titles under the agreement, which needs counsel.
2. **Safety reports**: anonymise reporter details, or keep them for a fixed
   period?
3. **Retention periods** for anything kept, and the wording added to the
   privacy policy.
4. **Grace period**: delete immediately, or schedule (for example 7 days, with
   cancel on sign-in)?
5. Approval to deploy a backend route that permanently deletes data.

## Testing before any deployment

- Unit tests with an in-memory Firestore and Auth fake: full deletion,
  partial failure then retry, stale token rejected, TV custom-token session
  rejected, admin rejected, creator marked `needs_review`, no other user's
  data touched.
- A Firebase emulator run with synthetic accounts only.
- A disabled-by-default feature flag until the owner approves going live.

Estimated effort once the decisions are made: backend 1 day, website 0.5 day,
tests and emulator run 0.5 day.
