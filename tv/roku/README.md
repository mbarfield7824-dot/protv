# PROtv native Roku - Phase 2 / Issue #8

Isolated SceneGraph XML + BrightScript development preview. **Not device verified,
not certified, not published.** Fire TV is paused. Production website, backend,
Firestore, Mux services and artwork are not changed.

Start with the [read-only architecture audit](docs/ARCHITECTURE.md), then the
[validation report](docs/VALIDATION.md) and
[certification/device checklist](docs/DEVICE-CHECKLIST.md).

## Implemented, pending device validation

- PROtv dark premium home, typographic featured hero, explicit editorial titles.
- Black Cinema, all movies and category rails from existing public metadata.
- Uniform **144 x 216 (2:3)** movie artwork, **256 x 144 (16:9)** episode frames.
  Images are contained, never cropped/stretched/re-encoded. Full title cards
  remain behind missing/failed art. Both held replacement IDs always use those
  branded panels. Existing creator art stays intact.
- Roku StandardKeyboardDialog search; title/category/genre matching, separate
  movie/episode result rows, no-results state.
- Title springboard, Play/Back, asynchronous playback authorization and native
  Video HLS wiring, including signed-token validation.
- Native Video controls are enabled for transport/subtitles where HLS provides
  them. Physical-device support is **not yet proven**.
- RowList scrolling/focus routing; Back from player to details, details to the
  existing rail position, home to navigation, then app exit.
- Cold/warm movie/episode deep-link routing with explicit unavailable/unsupported
  handling. Reauthorizes playback rather than trusting launch URLs.
- Explicit catalog/request/playback errors; Home retries failed initial loads,
  Play retries playback. No generated offline catalog.
- Account linking uses the existing `/auth/device-sessions` website approval and
  Firebase custom-token flow. Roku displays the backend-issued URL and code,
  polls at its supplied interval, validates expiry, and retries transient
  failures with bounded backoff. No credentials are entered on the TV.
- Firebase ID/refresh tokens are held in memory only, refreshed through Firebase
  Auth REST, and cleared on Sign Out. No passwords or tokens are written to the
  Roku registry or logs. Restarting the app requires linking again.
- Continue Watching reads the signed-in viewer's existing
  `/users/me/progress` map, joins exact IDs to the current catalog, sorts by
  recent progress, and renders the existing artwork cards with a progress bar.
  The 95% completion cutoff matches Fire TV. Playback resumes at a valid saved
  position.
- Signed-in playback saves progress after at least 20 seconds of advancement,
  and flushes on pause, Back/exit from the player, and finish. Writes update the
  existing per-title map entry. Guest playback remains available and makes no
  progress requests or writes.
- Continue Watching requires the existing Firebase **public web client API
  key** at packaging time. It is client configuration, not a privileged key;
  never use a Firebase Admin/service-account key here.
- My List, persistent Roku sign-in, series smart bookmarks and favorites are
  not implemented.

## Reproducible local build (Windows PowerShell)

Use Node.js 24 LTS / npm 11 (tested: Node 24.19.0, npm 11.17.0).

```powershell
Set-Location D:\protv\tv\roku
npm ci --ignore-scripts --no-audit --no-fund
$env:ROKU_FIREBASE_API_KEY = '<existing Firebase public web client API key>'
npm run build
Remove-Item Env:\ROKU_FIREBASE_API_KEY
```

The checked-in lockfile pins the isolated development dependencies. Do not
install packages at the repository root or run production servers.
Use the public web client key already used by the PROtv website. The build
injects it only into the runtime ZIP; it is not committed into Roku source.
Without it, the ZIP still supports guest browsing/playback and displays an
explicit account-link configuration error.

Output: `dist\protv-roku.zip` and `dist\protv-roku.zip.sha256`. ZIP root contains
`manifest`, `source` and `components`, **not** a wrapping `roku` folder.
Only the ten runtime files are packaged; no privileged keys, `.env`, account
tokens/data, website/backend code, Node dependencies or test fixtures. The
Firebase web API key is public client configuration.
Source file timestamps do not affect ZIP bytes: entry timestamps and ordering
are fixed. Tests compare two complete ZIPs byte-for-byte.

```powershell
npm run check # BrightScript/SceneGraph project compiler
npm test      # real BrightScript model execution plus XML/package tests
npm run smoke # opt-in public, read-only production contract checks
```

The smoke check makes bounded public GETs only, including **one HLS master
playlist**, never video segments. It verifies the 32 approved rollout URLs,
both artwork holds, public search/detail/playback, and executes the shipped
BrightScript model against the full live catalog. It intentionally fails if
that approval count changes; review new owner approvals instead of weakening
the check. A sanitized receipt is written to `out\live-contract-report.json`.
No authentication/device-session/progress endpoints are called; account writes
are covered by offline contract/simulation tests only.

## Account and progress limits

- The backend has no TV-session cancellation/revocation route. Sign Out clears
  this app's in-memory tokens and user data; an already issued Firebase ID token
  can remain valid until its normal expiry. No global Firebase token revocation
  is attempted because that could sign out the viewer on other devices.
- The backend does not expose an activation rejection state or a TV-specific
  session registry/revoker. An activation code the viewer no longer wants must
  expire (10 minutes); the Roku shows only states the current service returns.
- Roku's app runtime has no secure credential store used here. Tokens are
  deliberately not persisted, so Continue Watching is fetched again after a
  new activation. Progress is not cached for offline account access.
- The backend stores progress without a server TTL/completion marker. The
  client keeps completed entries in server history and hides entries at 95%
  from Continue Watching, matching the existing Fire TV rule. Catalog IDs no
  longer present are ignored, not deleted.
- A hard process kill may prevent the final progress flush. Pause and player
  Back/finish trigger a best-effort asynchronous save; this needs Roku-device
  testing.

## Sideload on a physical Roku

1. Use a Roku linked to a developer-enabled Roku account and a display. Put the
   Roku and this computer on the same trusted LAN.
2. Enable Developer Settings using the Roku remote:
   **Home x3, Up x2, Right, Left, Right, Left, Right**.
   Follow the on-device agreement/restart prompts. Record the displayed local
   IP and set a developer installer password **on the device**.
3. In a local browser open `http://<ROKU-IP>`. Sign in as `rokudev` using that
   developer password. Do not paste the password into chat or source control.
4. In Development Application Installer choose Upload, select
   `D:\protv\tv\roku\dist\protv-roku.zip`, then Install/Replace.
   Roku permits one sideloaded app; replacing it removes the previous
   development app, so confirm this is safe first.
5. The app should launch. Follow the [device checklist](docs/DEVICE-CHECKLIST.md);
   successful ZIP creation alone does not mean it runs on Roku.
6. Capture debugger output locally on TCP **8085** using a terminal such as PuTTY
   in raw/telnet mode. Do not publish stream tokens or account secrets.
   This app does not intentionally log playback URLs or authorization tokens.

The app needs outbound HTTPS to `watchprotv.com`, returned approved storage /
creator artwork hosts, and Mux stream/CDN hosts. ECP tests use local port 8060;
allow Roku network/mobile-app control in device settings where required.
No IP, network access or installer credentials have been assumed.

## Needed for physical-device testing

- Roku model and Roku OS version; target resolution/display.
- Developer mode enabled, local IP reachable from this computer, installer
  access entered locally; confirmation it is safe to replace its sideloaded app.
- A visible TV/remote or owner assistance to verify focus, artwork and playback.
- A non-admin test viewer for website activation and cross-device progress.
  Use an account authorized for Roku testing, not an admin account.

## Scope and sources

All implementation changes stay under this directory, on
`feature/issue-7-roku-phase-1`. Nothing is pushed, deployed or submitted.
Public base is `https://watchprotv.com/api` in `source/model.brs`.
No account passwords, privileged API keys, Firebase Admin credentials, signing
keys or Roku IP are embedded. The public Firebase key is injected only at build
time into the ZIP and is not a credential.

Official references:
[developer setup/sideload](https://developer.roku.com/dev/docs/developer-setup),
[RowList](https://developer.roku.com/dev/docs/rowlist),
[Video](https://developer.roku.com/dev/docs/video),
[StandardKeyboardDialog](https://developer.roku.com/dev/docs/standard-keyboard-dialog),
[deep links](https://developer.roku.com/dev/docs/implementing-deep-linking),
[certification](https://developer.roku.com/dev/docs/certification).
