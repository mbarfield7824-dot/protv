# PROtv iOS 1.0: App Store submission record

For the PROtv owner filling in App Store Connect. Items marked **Owner** need a decision or
account access. Check every answer against App Store Connect's current forms when entering it.

## App record

| Field | Value |
| --- | --- |
| Name | PROtv |
| Bundle ID | `com.protv.mobile` (registration and App Store Connect record still unverified) |
| SKU | `protv-ios` |
| Version / build | 1.0.0 / managed remotely by EAS, auto-incremented |
| Primary category | Entertainment |
| Price | Free, no in-app purchases |
| Export compliance | No non-exempt encryption (`usesNonExemptEncryption: false`) |
| Privacy Policy URL | https://watchprotv.com/privacy |
| Account deletion URL | https://watchprotv.com/delete-account |
| Support URL | https://watchprotv.com/contact |

## Listing copy (draft, **Owner** to approve)

**Subtitle (30 characters max):** Independent film and more

**Promotional text:** Stream independent films, classic cinema, series, and documentaries. Free to watch.

**Description:**

> PROtv is a free streaming home for stories with their own point of view.
>
> Watch independent films, classic cinema, Black cinema, documentaries, cartoons, and series, with new titles added to the collection over time.
>
> Create a free account to save titles to My List and pick up where you left off on your other PROtv devices.
>
> PROtv is free to watch. No subscriptions, in-app purchases, or advertisements.

**Keywords (100 characters max):** movies,films,streaming,independent,classic,cinema,documentary,series,free,black cinema

## Screenshots

`supportsTablet` is on, so Apple asks for iPad screenshots as well as iPhone ones.

| Device class | Portrait size |
| --- | --- |
| iPhone 6.9-inch | 1320 × 2868 (or 1290 × 2796) |
| iPad 13-inch | 2064 × 2752 |

Capture from the real app on a simulator or device: Home, title details, series episodes,
player in landscape, Search, and My PROtv. Up to 10 per device class, using only titles PROtv
has the rights to show.

## App Privacy answers

Based on what this codebase does. The app bundles the Firebase client (Auth only), and no
analytics, advertising, crash-reporting, or tracking SDK.

**Tracking: No.** No App Tracking Transparency prompt is needed.

| Data type | Collected | Linked to identity | Purpose |
| --- | --- | --- | --- |
| Email address | Yes, with an account | Yes | App functionality |
| Name (display name) | Yes, with an account | Yes | App functionality |
| User ID (Firebase UID) | Yes, with an account | Yes | App functionality |
| Product interaction (watch progress, My List, history) | Yes, with an account | Yes | App functionality |

Passwords go to Firebase Authentication and are not stored by the app.
**Owner:** confirm this against backend behavior and whether Mux Data or server logs add
anything to declare. Creator Portal access is not exposed in the iOS viewer app.

## App Review notes

- Provide a dedicated demo account with a verified email (**Owner**: create it; do not use a real viewer).
- Viewing needs no account. An account adds My List and synced progress.
- Sign in with Apple does not apply: the only sign-in is PROtv's own email and password, with no third-party login in the app.
- Account deletion: My PROtv › Account & privacy › Account deletion. It starts in the app, requires the password, then goes to PROtv's reviewed queue.
- The iOS app is viewer-only. It does not expose Creator Portal, content upload, comments, or messaging. The title screen links to the existing safety report form.
- No purchases, ads, or subscriptions. Adding paid digital content later requires an Apple in-app purchase review first.

## Age rating

**Owner:** complete the questionnaire. The catalog has horror titles and most `maturityRating` values are blank, so it should reflect the most mature title.

## Remaining blockers

1. **Expo account:** `eas login` and `scripts/setup-eas-ios.ps1`. No cloud build has run yet.
2. **Apple Developer Program:** organization enrollment is pending; membership, App Store Connect access, signing and distribution permissions are not verified.
3. **iOS rights are not cleared:** the new server-side iOS allowlist is empty. The iOS app declares its platform so catalog, direct-title and playback requests remain unavailable until each title's mobile rights are verified, approved and deployed. Roku/Fire TV rights are not evidence of iOS rights. Do not distribute a production build until the backend gate is deployed; the client also rejects catalog responses without the `ios-rights-v1` policy marker.
4. **iOS acceptance is entirely unverified:** nothing has run on a simulator or iPhone. Run the checklist below after signing and rights are ready.
5. **Deletion test and service timing:** the app uses the existing manual review queue. Test with a dedicated account in a safe environment; no completion deadline is approved. The queue records `channel: 'web'` for app requests, and the website runbook needs owner/legal confirmation of the user-facing timing and retention text.
6. **Backend catalog field:** the public catalog omits `creatorProjectId` and any added date, so "From PROtv Creators" and "New Releases" stay hidden. The app shows them automatically if the API adds them. No titles currently match Originals, Independent, or Music and Podcasts.
7. **Owner items:** approve listing copy, age rating, rights-cleared screenshots, demo account, privacy answers and review contact instructions.
8. **App Review risk:** the app has a per-title link to the existing safety report form and no creator submission, comments or messaging features. Apple may still view creator-submitted catalog content under guideline 1.2; confirm whether a block-user feature and a defined response timeframe are required for this curated viewer app before submission. The app does not claim either feature.

## iOS acceptance checklist

On a simulator (`ios-simulator` profile) or iPhone:

- [ ] Launch, icon, splash, no crash
- [ ] Live catalog, artwork, rails, Search, Categories, title details
- [ ] Episodes, season picker, Next Episode
- [ ] Mux playback, seek, resume, rotate to landscape and back, close
- [ ] Control Center or a call does not stop video unexpectedly; backgrounding pauses
- [ ] AirPlay button and route (physical device only)
- [ ] Register, verify email, sign in, restart stays signed in, sign out, password reset
- [ ] Reinstall does not restore the old session
- [ ] My List and Continue Watching sync with another PROtv device
- [ ] iOS title report opens the existing form with the correct title ID, URL and description
- [ ] Verify rights-cleared titles only appear after the backend iOS allowlist is deployed
- [ ] Deletion request submits with a test account and shows its status
- [ ] VoiceOver and largest Dynamic Type on Home, title details, sign-in
- [ ] Notch and Dynamic Island iPhones, plus a small iPhone
