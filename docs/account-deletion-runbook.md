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
after step 4.

| # | Where | What | How |
| --- | --- | --- | --- |
| 1 | Firestore `safetyReports` | Reports sent from this email | Only if the person asks and none is still under review. Filter `contactEmail == email` |
| 2 | Creator Agent (external) | Creator profile and projects. Opening the Creator Portal sends the UID, email and name, so anyone who opened it has a record, not only active creators | Search by UID or email. Keep signed agreements; get an owner decision on the profile, projects and licensed titles |
| 3 | Firestore `deviceSessions` | TV sign-in links approved by this account | Filter `approvedByUid == UID`; delete each document. Do this before step 4: an approved link can still mint a sign-in token, and signing in with it would re-create the account |
| 4 | Firebase Authentication | The sign-in account | Users › the account › Delete account. Then record **Sign-in Account Deleted** in the queue |
| 5 | — | Wait | The queue shows when completion becomes available, 65 minutes after step 4 was recorded. The backend's `verifyToken` does not check revocation, so ID tokens already issued keep working for up to an hour and could re-create watch progress |
| 6 | Firestore `users/{UID}` | My List, watch progress and history | Delete the document. If it reappears during the wait, delete it again |

Signed-in TVs stop working with the account when their token expires and the
refresh fails. The queue shows a live tick for steps 3, 4 and 6 and the
number of matching safety reports.

## What the server enforces

- **Sign-in Account Deleted** is accepted only when the Auth account is gone
  and no `deviceSessions` remain. The server records when it saw this.
- **Completed** is accepted only from Sign-in Account Deleted, at least 65
  minutes after that time, with the Creator Portal review confirmed. It
  re-checks the Auth account, and reads `users/{UID}` and `deviceSessions`
  inside the same Firestore transaction that writes the status, so a
  concurrent write aborts it. The result is stored as completion evidence.
- Deletion routes run only on the Vercel Production deployment (or against
  the Firebase emulator). Preview deployments and local backends with real
  credentials return 503.

## 3. Confirm and close

1. Email the person from `support@watchprotv.com` confirming the deletion.
2. Mark the request **Completed** and confirm the Creator Portal review.

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
