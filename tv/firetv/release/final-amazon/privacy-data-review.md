# Fire TV privacy and account-deletion review

**Internal technical findings only; not legal advice or approved policy text.**

## Observed in the Fire TV project

- Firebase Authentication is used for viewer identity. The app receives Firebase configuration from protected local build configuration and stores Firebase session state through the SDK.
- The app calls the PROtv API for favorites and watch progress. Backend routes store the `favoriteVideoIds` and `watchProgress` fields on `users/{uid}` in Firestore.
- The TV client also stores watch-progress recovery data in private app preferences, keyed by a SHA-256 digest of the Firebase UID. Signing out does not itself erase server or local historical data.
- The Android Fire TV dependencies include Firebase Auth, Compose, Retrofit, Coil, and Media3. No Firebase Analytics, Crashlytics, or Mux analytics SDK is declared in the Android module. This is a dependency-level observation, not proof that upstream providers or service infrastructure collect no telemetry.
- The web app includes Vercel Analytics; it is not an Android Fire TV dependency and must be separately considered if disclosures cover the website.
- The current published Privacy page discusses email/display name, My List, service providers and support, but does not explicitly explain TV watch progress or provide a dedicated deletion-request procedure.
- Backend user routes currently expose favorites and per-title watch-progress operations only. No account-deletion endpoint was found.

## Deletion status: blocked, no destructive code staged

The account is shared between web and TV. A correct deletion workflow must address Firebase Auth and all associated records, not just the known Firestore user document. The inspected code also links creator projects and publishes content in separate integrations; their ownership, records, rights agreements, and retention implications are not captured by the TV user's `users/{uid}` document.

No authenticated recent-reauthentication flow, deletion queue, verified end-to-end data inventory, email delivery/verification service, or approved retention schedule was identified. Deleting the Auth identity and Firestore data independently can partially fail. For that reason, this package does not add a destructive endpoint or claim account deletion is available.

Amazon's current guidance says apps allowing account creation must provide a web page where users can request account deletion, and accurately answer the Developer Console deletion questions. The existing support email is not yet documented as a verified, monitored deletion workflow. A working request URL and actual fulfillment process must be established before submission.

## Owner/legal decisions and engineering prerequisites

1. Confirm applicable deletion timeline and lawful retention exceptions (including transaction, creator agreement, safety, and legal records).
2. Approve whether accounts with creator projects/content are deleted, transferred, or require separate handling.
3. Identify every user-linked store across Firebase, Firestore, Creator Portal, hosting logs, streaming provider, and third-party processors; obtain current retention/deletion behavior from each.
4. Confirm a monitored support/deletion request address and who fulfills and audits requests.
5. Approve whether to implement verified web request + request tracking followed by reviewed fulfillment, or a fully automated workflow.
6. If automated, implement recent-authentication/identity verification, idempotent multi-service cleanup, partial-failure recovery, session/token revocation, user-facing status, and automated tests before deploying.
7. Update the website Privacy page and Amazon privacy/deletion labels only after the process and statements are approved.

## Disclosure draft notes

Before filing labels, confirm the exact fields and processing purposes with service owners. The observed app uses account identity, My List, watch progress, and playback/catalog requests. Firebase, API hosting, and streaming provider practices, IP/device logs, retention, transfers, and any server-side telemetry require authoritative confirmation. Do not infer that no analytics or telemetry exists solely because no analytics SDK is in the TV Gradle dependencies.
