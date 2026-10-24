# Account deletion runbook (manual process until self-service exists)

For the person who answers support@watchprotv.com. This is how a deletion
request can actually be fulfilled today. PROtv has **no deletion endpoint**
(no `deleteUser` route in `backend/src`); every step uses the Firebase console
as the project owner. Checked against production Firestore on 2026-10-23.

## 1. Verify the request

1. The request must come from the account's email address. If it doesn't,
   reply asking the person to write from that address.
2. Firebase console > Authentication > Users: search the email. Note the
   **User UID** and the providers (Password and/or Google).
3. Do not act on requests about someone else's account.

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
