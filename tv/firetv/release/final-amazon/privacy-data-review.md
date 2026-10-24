# Fire TV privacy and account-deletion review

**Internal technical findings only; not legal advice or approved policy text.**

## Observed in the Fire TV project

- Firebase Authentication is used for viewer identity. The app receives Firebase client configuration from protected/local build configuration and stores Firebase session state through the SDK. The Android app has no separate PROtv password database.
- The app calls the PROtv API for favorites and watch progress. Backend routes store `favoriteVideoIds` and `watchProgress` on `users/{uid}` in Firestore. The profile document can also hold creator-link fields; creator records live in a separate service and are not represented by those two viewer fields alone.
- The TV client stores watch-progress recovery data in private app preferences, keyed by a SHA-256 digest of the Firebase UID. Signing out does not itself erase server or local historical data.
- The Android Fire TV dependencies include Firebase Auth, Compose, Retrofit, Coil, and Media3. No Firebase Analytics, Crashlytics, or Mux analytics SDK is declared in the Android module. This dependency-level observation is not proof that upstream providers or service infrastructure collect no telemetry.
- Fire TV authentication may be initiated by email/password against Firebase Identity Toolkit and exchanged for Firebase custom tokens. TV activation records are stored in Firestore `deviceSessions` and `deviceActivationCodes`; `approvedByUid` links a session to the approving account. `deviceRateLimits` and `tvAuthRateLimits` contain hashed/rate-limit data rather than account profile content. The Fire TV client holds Firebase tokens in SDK state; no separate server-maintained playback-history collection was found in the inspected app code.
- Firebase refresh tokens and external provider logs are outside the Firestore profile document. Revoking Firebase refresh tokens is needed to invalidate sessions across devices. The app's local preference checkpoint is only removable by the client or app-data lifecycle; deleting a server account cannot directly erase an offline device.
- The web app includes Vercel Analytics; it is not an Android Fire TV dependency and must be separately considered if disclosures cover the website.
- The currently published Privacy page discusses email/display name, My List, service providers and support, but does not explicitly explain TV watch progress or provide the new dedicated deletion-request flow. This branch adds a link to the request page; neither that link nor the page is deployed.
- Backend user routes currently expose favorites and per-title watch-progress operations only. No account-deletion endpoint was found.

## Broader account-associated data inventory

| Store / system | Confirmed account-related fields | Deletion implications |
|---|---|---|
| Firebase Authentication | UID, email, display name, provider identities, refresh-token sessions | Revoke refresh tokens and delete the Auth identity only after the approved data workflow is safely recorded. |
| Firestore `users/{uid}` | Viewer profile, `favoriteVideoIds`, `watchProgress`; may contain creator-link fields | Delete or selectively handle fields according to the approved creator/retention policy. |
| Firestore `deviceSessions` | `approvedByUid`, provider, status, expiry and issuance metadata | Find sessions by UID, including consumed rows; invalidate/delete as approved. The existing TTL policy is not active for this collection. |
| Firestore `deviceActivationCodes` | Activation code → session ID and expiry | Remove codes for any deleted session; no UID is stored directly. TTL is not active. |
| Firestore `deviceRateLimits` / `tvAuthRateLimits` | Hashed counters and expiry | No raw account credential; retain only as required for abuse prevention and ensure expiration TTL is active. |
| Firestore `safetyReports` | Report text, optional contact email and moderation state | Inspect the exact schema before changing identity fields. Anonymization/deletion must respect open safety investigations and retention policy; no account UID index was established by the reviewed store. |
| Creator Agent (external) | Creator profile/projects, signed agreements and possibly payout/tax records | Separate owner/counsel decision and process; cannot be safely removed through the viewer-profile API. |
| Published creator catalog records | Creator/project linkage and licensed media | Do not delete titles or licenses as a side effect of deleting a viewer account. |
| Playback / advertising | Website Mux quality metrics; backend ad event/aggregate records | The inspected Fire TV app does not include an analytics SDK. Confirm server-side identifiers and retention with service owners before making disclosure or deletion claims. |
| Admin/security records | Admin actions and operational audit logs | Not ordinary viewer data; retention and access must be governed separately. |
| Fire TV local state | Firebase SDK session and UID-keyed progress recovery checkpoint | Server-side deletion cannot guarantee immediate removal while a TV is offline. On next auth refresh, a deleted/revoked account should fail; a local deletion UX would be needed to clear cached state reliably. |

This inventory is source-code based, not a production database export. It does not prove that no other processor, infrastructure log, backup, support mailbox, or external creator system retains account-linked information.

## Deletion status: administrator review implemented locally; fulfillment remains blocked

The account is shared between web and TV. A correct deletion workflow must address Firebase Auth and all associated records, not just the known Firestore user document. The existing Roku account-deletion runbook is manual and does not establish an account UID index for `safetyReports`; do not treat it as proof that every report can be found.

Local code provides `/delete-account` on the website and an account-screen link in the Fire TV app. The API exposes authenticated request/status routes at `/users/me/deletion-request`. Submission requires an interactive password/Google sign-in and a non-revoked Firebase token whose authentication time is within five minutes. An idempotent Firestore transaction records the authenticated UID, `pending_review` status, request/update timestamps, and a submission audit event in `accountDeletionRequests`; responses are non-cacheable. The user can view only their own request status and any additional-information message. Legacy `received` requests are displayed as `pending_review`.

The canonical `/admin` dashboard now has an **ACCOUNT DELETION REQUESTS** section. Its API is protected by the existing backend Firebase `verifyAdmin` claim check; it displays account email, account type only when present as an allowed Firebase custom claim, request history, and a review plan. No UID-to-Creator Portal project/content/contract mapping is available in this codebase, so those links are explicitly shown as **Verification required**. Admin status changes require a reason and append actor UID, timestamps, decision, and prior/new statuses to request history. Users cannot query another UID's request.

The supported review statuses are Pending Review, Additional Information Required, Approved for Processing, On Hold, and Completed. Approval does **not** invoke deletion. The completion transition is blocked unless an authorized fulfillment verifier is configured and confirms fulfillment evidence; no such production verifier is configured. The fulfillment plan flags known personal-data review, retention/legal basis, creator dependencies, session/token revocation, provider systems, statutory deadline review, and completion evidence. It does not infer a statutory deadline or retention exception.

This remains a **non-deployed request and review workflow**: no account, profile, session, progress, favorite, report, creator record, or provider data is removed; no notification is sent; and no statutory deadline/completion target is claimed. The account-deletion URL and admin queue must be deployed, tested, and monitored before they can serve as a live Amazon deletion facility. `support@watchprotv.com` is not verified as a monitored fulfillment channel.

No destructive fulfillment endpoint is exposed because the Creator Portal and payment/tax records are separate, the `safetyReports` UID association is unknown, and provider logs/backups and retention exceptions are unverified. Deleting Firebase Auth and Firestore independently could also leave a partially deleted account. Actual fulfillment therefore remains blocked pending the decisions below.

## Owner/legal decisions and engineering prerequisites

1. Confirm applicable deletion timeline and lawful retention exceptions (including transaction, creator agreement, safety, and legal records).
2. Approve whether accounts with creator projects/content are deleted, transferred, or require separate handling.
3. Identify every user-linked store across Firebase, Firestore, Creator Portal, hosting logs, streaming provider, and third-party processors; obtain current retention/deletion behavior from each.
4. Confirm a monitored support/deletion request address and who fulfills and audits requests.
5. Confirm the request-only/manual-review approach or approve a fully automated workflow after the data inventory is verified.
6. Decide whether viewer data can be deleted while retaining creator contracts, payout/tax records, and active content licenses; specify safety-report handling and any legal holds.
7. Ask owner/counsel to identify applicable statutory deadlines and decide any operational target or cancellation/grace period. The existing legal draft's 30-day aim is not approved and is not implemented as a deadline.
8. Before fulfillment, implement an authorized, idempotent multi-service process with partial-failure recovery, session/token revocation, external-system verification, user-facing status, and synthetic-account tests.
9. Update the website Privacy page and Amazon privacy/deletion labels only after the process and statements are approved.

## Existing legal draft

The Roku release work contains a full owner/counsel review draft at `D:\protv\tv\roku\store\legal\privacy-policy-draft.md` and a fact/review table in `REVIEW.md`. Those are not published legal approvals and need a Fire TV addendum for Fire TV token/local progress behavior above. The current website policy remains unchanged until the owner/counsel approves a final version.

## Disclosure draft notes

Before filing labels, confirm exact fields and processing purposes with service owners. The observed app uses account identity, My List, watch progress, and playback/catalog requests. Firebase, API hosting, streaming-provider practices, IP/device logs, retention, transfers, and server-side telemetry require authoritative confirmation. Do not infer that no analytics or telemetry exists solely because no analytics SDK appears in the TV Gradle dependencies.
