# Account deletion runbook (manual process until self-service exists)

For the person who answers support@watchprotv.com. This is how a deletion
request can actually be fulfilled today. PROtv has **no deletion endpoint**
(no `deleteUser` route in `backend/src`); every step uses the Firebase console
as the project owner. Checked against production Firestore on 2026-10-23;
coverage re-audited 2026-10-24 (section 5).

## 1. Verify the request

A "From" address can be forged, so a request is never verified by its sender
alone.

1. Firebase console > Authentication > Users: search the email named in the
   request. If no account exists, reply that no account was found. Note the
   **User UID** and the providers (Password and/or Google).
2. Send a **new** email (not a reply) **to the account's address**: "We
   received a request to delete the PROtv account for this address. To
   confirm, reply to this message with DELETE MY ACCOUNT. If you did not ask
   for this, ignore this email; nothing will change."
3. Act only on a reply to that message that contains the confirmation. If no
   confirmation arrives within 14 days, close the request.
4. Do not act on requests about someone else's account, and never on an
   admin or owner account (hand those to the owner).

## 2. Delete the data (this order)

| # | Where | What | How |
| --- | --- | --- | --- |
| 1 | Firestore `users/{UID}` | My List (`favoriteVideoIds`), watch progress and history (`watchProgress`, including any literal `watchProgress.<id>` fields) | Delete the document |
| 2 | Firestore `deviceSessions` | TV sign-in links approved by this account | Filter `approvedByUid == UID`; delete each document |
| 3 | Firestore `safetyReports` | Reports sent from this email, only if the person asks and none is still under review | Filter `contactEmail == email` |
| 4 | Firebase Authentication | The sign-in account (email, display name, password, Google link) | Users > the account > Delete account. Signed-in TVs fail their next token refresh and fall back to guest mode |
| 5 | Creator records | Only if the person is also a creator: creator agreements are kept as contract records and handled separately. Do not delete agreements | Owner decision |

Not stored per account, so no action is needed:
- `tvAuthRateLimits`: hashed counters that expire within about an hour.
- `playbackViewEvents` / `playbackViewSessions`: hashed and expiring under an active TTL.
- Roku guest progress: kept on the TV only.

## 3. Record and reply

1. Add an entry to `adminAudit` with type `account_deleted`, the UID, the
   date, and **no** email address.
2. Reply to the person confirming deletion and the date.
3. Keep the support email thread only as long as the retention decision in
   REVIEW.md allows.

## Known gaps (technical)

- `deviceSessions`, `deviceActivationCodes`, `deviceRateLimits` and
  `safetyReportRateLimits` store `expiresAt`, but **no TTL policy is active**
  on them, so expired records are never removed (13 device sessions on
  2026-10-23). Enabling TTL on `expiresAt` for these four collections is a
  one-command owner change. Firestore TTL is a normal Firestore operation;
  it costs nothing extra beyond document deletes.
- Self-service deletion on the website is designed in
  docs/account-deletion-plan.md and not built.

## 5. Coverage audit (2026-10-24)

Read-only listing of every production Firestore collection, field names only
(no values read). Every person-linked field is covered:

| Collection | Person-linked fields | Covered by |
| --- | --- | --- |
| `users` | the document itself (My List, watch progress and history) | Step 2.1 |
| `deviceSessions` | `approvedByUid` | Step 2.2 |
| `safetyReports` | `contactEmail` | Step 2.3 |
| Firebase Authentication | email, display name, providers | Step 2.4 (also ends every TV and web session) |
| `videos` | `creator*`, `approvedBy` (creator titles and admin approvals) | Step 2.5: creator decision; admin fields are not viewer data |
| `playbackViewSessions` | `viewerKeys` | Not needed: HMAC-SHA256 with a server secret (`backend/src/playback/trackingService.js`), not reversible without the secret, and removed by the active TTL |
| `tvAuthRateLimits`, `playbackRateLimits` | none (hashed counters) | Removed by the active TTL |
| `deviceRateLimits`, `safetyReportRateLimits` | none (hashed counters) | No personal data, but no active TTL (known gap below) |
| All other collections | none | — |

**Not tested end to end:** no designated test account exists, and no
production account was touched. Test procedure (owner, about 10 minutes):

1. Create a throwaway account on watchprotv.com with a mailbox you control
   (never a customer's). Add one title to My List, play a title for 1 minute,
   and sign in on the Roku TV.
2. Send the deletion request from that mailbox and follow sections 1-3.
3. Check: the email no longer signs in on the website; the Roku TV falls back
   to Guest on its next launch; `users/<UID>` and its `deviceSessions` are
   gone; the adminAudit entry exists without an email address.

**Known gaps:** no self-service deletion (design in docs/account-deletion-plan.md,
blocked on 4 owner/legal decisions); the live privacy policy does not yet
describe deletion (LIVE-VS-DRAFT-CORRECTIONS.md P6); TTL is not active on
`deviceSessions`, `deviceActivationCodes`, `deviceRateLimits` and
`safetyReportRateLimits` (owner-approved production change).
