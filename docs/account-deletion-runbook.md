# Account deletion runbook

For the PROtv administrator who handles deletion requests. One PROtv account
covers the website and every TV app (Roku, Fire TV, future Android apps), so
every request is handled the same way, whatever device the person uses.

Deletion is done by hand in the Firebase console. The admin queue tracks each
request and checks the result; it never deletes anything itself.

## Where requests come from

| Channel | How it arrives | Identity check |
| --- | --- | --- |
| Website | `watchprotv.com/delete-account` | Password or Google sign-in within the last 5 minutes, token checked for revocation. TV sign-in sessions cannot submit. |
| Email | `support@watchprotv.com` (the Roku Account screen and the website both point here) | The email must come from the account's own address. If not, reply asking them to write from that address. |

Requests are stored in Firestore `accountDeletionRequests/{uid}` with the UID,
channel, status, dates and a `decisionHistory` subcollection. No email address
is stored in the request.

## 1. Log and review

1. Open **Admin › Account Privacy › Account Deletion Requests**.
2. For an email request: find the UID in Firebase console › Authentication by
   searching the sender's address, then use **Record a request received by
   email** and note how the sender was verified.
3. Move the request to **Approved for Processing**. Use **Additional
   Information Required** (the message is shown to the requester) or
   **On Hold** (for example, an open safety review or a creator agreement
   question) when needed.

## 2. Delete the data (this order)

Copy the account email into the support thread first. The queue cannot show it
after step 3.

| # | Where | What | How |
| --- | --- | --- | --- |
| 1 | Firestore `safetyReports` | Reports sent from this email | Only if the person asks and none is still under review. Filter `contactEmail == email` |
| 2 | Creator Agent (external) | Creator profile and projects. Opening the Creator Portal sends the UID, email and name, so anyone who opened it has a record, not only active creators | Search by UID or email. Keep signed agreements; get an owner decision on the profile, projects and licensed titles |
| 3 | Firebase Authentication | The sign-in account | Users › the account › Delete account |
| 4 | — | Wait at least one hour | The backend's `verifyToken` does not check revocation, so ID tokens already issued to TVs and browsers keep working until they expire (up to an hour). A TV still playing could re-create watch progress if step 5 runs sooner |
| 5 | Firestore `users/{UID}` | My List, watch progress and history | Delete the document |
| 6 | Firestore `deviceSessions` | TV sign-in links approved by this account | Filter `approvedByUid == UID`; delete each document |

Signed-in TVs stop working with the account when their token expires and the
refresh fails. The queue shows a live tick for steps 3, 5 and 6 and the
number of matching safety reports.

## 3. Confirm and close

1. Email the person from `support@watchprotv.com` confirming the deletion.
2. Mark the request **Completed**. The server re-checks that the Auth account,
   the `users` document and all `deviceSessions` are gone, and refuses
   otherwise. It stores that check as the completion evidence.

## Not deleted with the account

These are not keyed by the account and are left in place:

- `tvAuthRateLimits` (`signin_email_` / `reset_email_` keys are a SHA-256 of
  the email; others of the network address), `deviceRateLimits`,
  `safetyReportRateLimits` (hashed network address).
- `adTelemetryEvents` / `adRevenueEvents` / `adTitleMetrics`: random session
  IDs and title IDs only.
- `deviceActivationCodes`: removed automatically when a TV is approved; they
  hold no UID.
- `videos.createdBy` / `approvedBy` and `safetyReports.reviewedBy`: admin
  UIDs only, not viewer data.

## Known gaps

- `deviceSessions`, `deviceActivationCodes`, `deviceRateLimits` and
  `safetyReportRateLimits` have `expiresAt` fields but no active Firestore TTL
  policy, so expired records are never removed.
- No deadline for completing a request has been approved. The website does
  not promise one.
- A deleted account cannot sign in to see the Completed status; the
  confirmation email is the person's record.
