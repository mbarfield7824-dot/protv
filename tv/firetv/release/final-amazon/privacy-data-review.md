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
- The current published Privacy page discusses email/display name, My List, service providers and support, but does not explicitly explain TV watch progress or provide a dedicated deletion-request procedure.
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

## Deletion status: blocked; no destructive code staged

The account is shared between web and TV. A correct deletion workflow must address Firebase Auth and all associated records, not just the known Firestore user document. The existing Roku account-deletion runbook is manual and the self-service plan remains unimplemented. The runbook does not establish an account UID index for `safetyReports`; do not treat it as proof that every report can be found.

No authenticated recent-reauthentication flow for deletion, durable deletion queue, verified end-to-end data inventory, email delivery/verification service, or approved retention schedule was identified. Deleting the Auth identity and Firestore data independently can partially fail. For that reason, this package does not add a destructive endpoint or claim account deletion is available.

Amazon's current guidance says apps allowing account creation must provide a web page where users can request account deletion, and accurately answer the Developer Console deletion questions. The existing support email is not yet documented as a verified, monitored deletion workflow. A working request URL and actual fulfillment process must be established before submission.

## Owner/legal decisions and engineering prerequisites

1. Confirm applicable deletion timeline and lawful retention exceptions (including transaction, creator agreement, safety, and legal records).
2. Approve whether accounts with creator projects/content are deleted, transferred, or require separate handling.
3. Identify every user-linked store across Firebase, Firestore, Creator Portal, hosting logs, streaming provider, and third-party processors; obtain current retention/deletion behavior from each.
4. Confirm a monitored support/deletion request address and who fulfills and audits requests.
5. Approve whether to implement verified web request plus request tracking followed by reviewed fulfillment, or a fully automated workflow.
6. Decide whether viewer data can be deleted while retaining creator contracts, payout/tax records, and active content licenses; specify safety-report handling and any legal holds.
7. Approve a completion target (the existing legal draft proposes an aim of 30 days) and whether a cancellation/grace period is required.
8. If automated, implement recent-authentication/identity verification, idempotent multi-service cleanup, partial-failure recovery, session/token revocation, user-facing status, and automated tests before deploying.
9. Update the website Privacy page and Amazon privacy/deletion labels only after the process and statements are approved.

## Existing legal draft

The Roku release work contains a full owner/counsel review draft at `D:\protv\tv\roku\store\legal\privacy-policy-draft.md` and a fact/review table in `REVIEW.md`. Those are not published legal approvals and need a Fire TV addendum for Fire TV token/local progress behavior above. The current website policy remains unchanged until the owner/counsel approves a final version.

## Disclosure draft notes

Before filing labels, confirm exact fields and processing purposes with service owners. The observed app uses account identity, My List, watch progress, and playback/catalog requests. Firebase, API hosting, streaming-provider practices, IP/device logs, retention, transfers, and server-side telemetry require authoritative confirmation. Do not infer that no analytics or telemetry exists solely because no analytics SDK appears in the TV Gradle dependencies.
