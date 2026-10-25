# PROtv Roku 1.0.0: certification handoff

Status as of 2026-10-25. Channel ID 888987. Test TV: Hisense 6-Series Roku TV,
192.168.1.100, 1080p, Roku OS 16.0.4, developer mode on.

## 1. Certification status

| Item | Status |
| --- | --- |
| Release candidate | **RC9, frozen.** `D:\protv\tv\roku\dist\releases\protv-roku-v1.0.0-rc9-candidate.zip`, SHA-256 `a3a23130bae680bf4d00da708ed10fc6ad033af6e86fa69456506e59b74c1097`, tag `roku-v1.0.0-rc9` |
| Signed package | **Done.** `D:\protv\tv\roku\dist\releases\signed\protv-roku-v1.0.0-rc9-signed.pkg`, 681,408 bytes, SHA-256 `cfc7268a95f08a8788d1ebb50ac3b9b9cf2d57b0c240c79e1aa2c3130bbe967b`, DevID `308915be08af6c787b87cdcd5846f5967dce46c4`. The owner reports it is uploaded to the Developer Dashboard |
| Signing key | `C:\Users\Owner\protv-roku-signing\signing-key.json`, readable only by Owner. Verified AES-256 backup at `D:\PROtv-signing-backup\protv-roku-signing-key-2026-10-24.7z`. **Never run genkey again.** If a TV loses the key, restore it with Utilities > Rekey |
| Automated tests | 12/12 test files pass |
| Static Analysis | 0 errors; 6 advisory warnings (dialog beacon reminder, 5 memory-monitor notes) |
| Deep linking | Implemented (`supports_input_launch=1`; launch and `roInputEvent`). Tested on the Hisense: movie `gbcxmtl6mAHQeBxx8Dgs` (Tears of Steel), `mediaType=movie`, plays directly; running-app input works; `series` is rejected |
| **Episode deep link** | **Decision needed.** All 5 catalog episodes are held (group C), so none are in the Roku launch catalog. Once the eligibility backend is live, an episode deep link shows "This title is unavailable". Either clear one episode for Roku or declare movie-only deep linking |
| Sign-out script | **Tested, passes** on the Hisense (section 3) |
| Sign-in script | **Draft, not fully tested.** Verified up to PROtv's email keyboard; the remaining key presses still need a run with a reviewer account (section 3) |
| Still open (owner) | Deploy the Roku launch-catalog eligibility backend; publish the legal pages; reviewer test credentials; App Behavior Analysis; store screenshots (4 of 6 captured); copy the key backup to a USB drive kept away from this PC; change the Hisense developer password (it was shared in chat); restore the TVs' network-control setting if wanted |

**Current TV state:** testing signed the Hisense out of PROtv and left the app
on the email keyboard. Press Back to cancel it, then sign in again if needed.

## 2. Reviewer account setup

Roku's App Behavior Analysis and its certification testers sign in with test
credentials entered in the Developer Dashboard. Use a dedicated account, not a
personal one.

1. Create a PROtv account with email and password, for example
   `roku-review@watchprotv.com`, through watchprotv.com or the TV's Account >
   Create account. It must be a password account, not Google sign-in: the TV
   accepts only email and password.
2. Use a strong password with no characters the Roku keyboard makes awkward:
   letters, digits, and `.` `-` `_` `@` type reliably.
3. Sign in once on the Hisense to confirm it works, and add 2 or 3 launch-catalog
   titles to My List so the synchronized features have something to show.
4. Developer Dashboard > PROtv (888987) > the test credentials section: enter the
   email and password. Store them in the password manager. Never put them in a
   script, the repository or chat.
5. Keep the account active: no email verification gate, no 2-step sign-in, and
   don't change the password while certification is in progress.

## 3. RASP scripts

Folder: `D:\protv-roku-rc5\tv\roku\certification\rasp\` (outside the RC9 package;
the packager includes only `manifest`, `source`, `components` and `assets`).

| File | Purpose | State |
| --- | --- | --- |
| `protv-signout.rasp` | Launch, Account, Sign Out | **Passed** on the Hisense: ended on "Signed out on this TV", header shows Guest, Sign in focused |
| `protv-signin.rasp` | Launch, Account, Sign in, email and password | **Draft**, see below |
| `run-rasp.mjs` | Local test runner: plays a .rasp through ECP | Working |

Both scripts follow Roku's rules:
- They start with a `launch` step and never press Home or Back.
- They use at most 10 pause steps.
- The sign-in script contains only the `script-login` and `script-password`
  placeholders. App Behavior Analysis replaces them with the dashboard test
  credentials, and fails if real credentials are in the file.

Flow facts, from screenshots on the Hisense:
- **Launch:** the sidebar is open with Home focused; Account is 9 presses of Down.
- **Account screen:** signed in, Sign Out is focused; signed out, Sign in is focused.
- **Sign in:** opens Roku's email-sharing screen first: Continue / Use different
  email / Privacy policy. The script presses Down, then Select, to choose
  *Use different email*, so it types its own login whatever Roku account the
  test device uses. That opens PROtv's email keyboard, focused on the keyboard
  with the text box empty.

**To finish the sign-in script:** the draft assumes 4 presses of Down from the
keyboard to reach Continue, and the same on the password keyboard to reach
Sign in. Verify it on the Hisense with the reviewer account, from a signed-out
state:

```powershell
cd D:\protv-roku-rc5\tv\roku\certification\rasp
$env:RASP_LOGIN = Read-Host 'Reviewer email'
$env:RASP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Reviewer password' -AsSecureString)))
node run-rasp.mjs 192.168.1.100 protv-signin.rasp
Remove-Item Env:RASP_LOGIN, Env:RASP_PASSWORD
```

**Pass:** the Account screen shows "Signed in…" with Sign Out available. If it
stops on a keyboard, adjust that loop's `iterations`. Then run
`protv-signout.rasp` to confirm the pair works.

**Upload:** if App Behavior Analysis expects the channel ID rather than `dev`,
change `PROtv: dev` to `PROtv: 888987` in both files. Roku's documentation uses
`dev` for sideloaded apps.

References: [Roku Remote Tool](https://developer.roku.com/dev/docs/roku-remote-tool),
[Authenticated app testing](https://developer.roku.com/docs/developer-program/certification/cert-tests/authenticated-cert-testing.md).
