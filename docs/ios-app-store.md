# PROtv iOS 1.0: App Store submission record

For the PROtv owner filling in App Store Connect. Items marked **Owner** need a decision or
account access. Check every answer against App Store Connect's current forms when entering it.

## App record

| Field | Value |
| --- | --- |
| Name | PROtv |
| Bundle ID | `com.protv.mobile` (check it is free when registering) |
| SKU | `protv-ios` |
| Version / build | 1.0.0 / managed remotely by EAS, auto-incremented |
| Primary category | Entertainment |
| Price | Free, no in-app purchases |
| Export compliance | No non-exempt encryption (`usesNonExemptEncryption: false`) |
| Privacy Policy URL | https://watchprotv.com/privacy |
| Account deletion URL | https://watchprotv.com/delete-account |
| Support URL | **Owner**: a public page with contact details is required |

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
> Filmmakers can reach the PROtv Creator Portal from the app to share their work.

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
**Owner:** confirm this against the backend and the Creator Portal (which receives UID, email,
and name when opened), and whether Mux Data or server logs add anything to declare.

## App Review notes

- Provide a dedicated demo account with a verified email (**Owner**: create it; do not use a real viewer).
- Viewing needs no account. An account adds My List and synced progress.
- Sign in with Apple does not apply: the only sign-in is PROtv's own email and password, with no third-party login in the app.
- Account deletion: My PROtv › Account & privacy › Account deletion. It starts in the app, requires the password, then goes to PROtv's reviewed queue.
- No purchases, ads, or subscriptions. Adding paid digital content later requires an Apple in-app purchase review first.

## Age rating

**Owner:** complete the questionnaire. The catalog has horror titles and most `maturityRating` values are blank, so it should reflect the most mature title.

## Remaining blockers

1. **Expo account:** `eas login` and `scripts/setup-eas-ios.ps1`. No cloud build has run yet.
2. **Apple Developer Program:** membership and credentials for any device or TestFlight build.
3. **iOS acceptance is entirely unverified:** nothing has run on a simulator or iPhone. Run the checklist below.
4. **Deletion test:** submit one request from a dedicated test account and process it per the runbook. The queue records `channel: 'web'` for app requests, and deletion waits on manual review; confirm the in-app wording and retention text with counsel.
5. **Backend catalog field:** the public catalog omits `creatorProjectId` and any added date, so "From PROtv Creators" and "New Releases" stay hidden. The app shows them automatically if the API adds them. No titles currently match Originals, Independent, or Music and Podcasts.
6. **Owner items:** Support URL, listing copy, age rating, screenshots, demo account, privacy answers.
7. **App Review risk:** creator-submitted films may be treated as user-generated content (guideline 1.2), which expects reporting and blocking. The website has Report Safety; the app does not link to it yet.

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
- [ ] Creator Portal opens for a verified account and refuses an unverified one
- [ ] Deletion request submits with a test account and shows its status
- [ ] VoiceOver and largest Dynamic Type on Home, title details, sign-in
- [ ] Notch and Dynamic Island iPhones, plus a small iPhone
