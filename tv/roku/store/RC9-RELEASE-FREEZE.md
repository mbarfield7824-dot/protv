# PROtv Roku 1.0.0: RC9 release freeze and signing preparation

**Frozen 2026-10-24.** RC9 is the release candidate. Its application code and
assets do not change from here; any change means a new candidate and a new
freeze. This file supersedes the RC5 and RC6 signing notes in older handoffs.

| | |
| --- | --- |
| Package | `D:\protv\tv\roku\dist\releases\protv-roku-v1.0.0-rc9-candidate.zip` (read-only) |
| Size | 678,406 bytes |
| SHA-256 | `a3a23130bae680bf4d00da708ed10fc6ad033af6e86fa69456506e59b74c1097` (also in the `.sha256` file beside it) |
| Source | branch `release/roku-1.0-rc9`, commit 923f1d7, tag `roku-v1.0.0-rc9` |
| Version | manifest 1.0.0, `rsg_version=1.3` |
| Tests | 12/12 test files pass (228 scene checks) |
| Static Analysis | 0 errors; 6 advisory warnings (dialog beacon reminder, 5 memory-monitor notes), unchanged since RC7 |
| On device | Hisense 6-Series Roku TV (192.168.1.100, 1080p): installed, poster focus outline verified on the first card, middle card and next row |

Since RC7: poster focus is one thin electric-blue outline (RC8), shown in full
on every card, including the card next to the sidebar (RC9).

## Signing status (checked 2026-10-24, nothing generated)

- No signing key file on this PC (`%USERPROFILE%\protv-roku-signing\` does not exist).
- No signed package (`dist\releases\signed\` does not exist).
- The Hisense holds no signing key (developer installer reports `dev_key: false`).
- Repository and history: no Dev ID, signing password or `.pkg` anywhere.
- **Not checkable from here:** whether a package was ever uploaded to channel
  888987 in the Roku Developer Dashboard. If one was, a PROtv key already exists:
  find it and use Utilities > Rekey; never run genkey.

`tools/sign.mjs` now accepts only this RC9 ZIP (SHA-256 pinned). Safeguards:

- Secrets never reach output, command arguments or the repository: the
  developer password comes from `ROKU_DEV_PASSWORD`, curl reads it from stdin,
  and the signing password goes to the Packager through a private temporary
  file that is deleted immediately.
- The ZIP checksum is verified before any action.
- `--genkey` refuses if a key file already exists or if the device already holds a key.
- `--package` refuses without the key file, if the device has no key, or if the
  device key's Dev ID is not PROtv's.
- The `.pkg` is never overwritten; it is size-checked, hashed and made read-only.

Refusal paths verified: `--genkey` without the device check, `--package`
without a key file, a tampered ZIP, an unknown mode.

## Step 1: generate the permanent signing key (owner authorization required)

Run once, ever, for PROtv. The same key must sign every future update to
channel 888987; if it is lost, the channel cannot be updated.

In PowerShell on this PC, with the Hisense on and in developer mode:

```powershell
cd D:\protv-roku-rc5\tv\roku
# Prompts without echo and keeps the password out of PowerShell history.
$env:ROKU_DEV_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Roku developer password' -AsSecureString)))
node tools/sign.mjs 192.168.1.100 --check
```

Continue only if it prints: `RC9 ZIP verified`, `Key file not present`,
`Device holds no signing key`. Then:

```powershell
node tools/sign.mjs 192.168.1.100 --genkey
```

It prints the Dev ID and saves the Dev ID and signing password to
`C:\Users\Owner\protv-roku-signing\signing-key.json` (password not shown).

## Step 2: back up the key before anything else

1. Open `signing-key.json` and copy `devId` and `password` into your password
   manager as a new entry, "PROtv Roku signing key, channel 888987". Close the file.
2. Make an encrypted offline copy: for example a 7-Zip archive with AES-256
   encryption and a strong passphrase (kept in the password manager) holding
   `signing-key.json`, saved to a USB drive kept away from this PC.
3. Check both copies open, and that the Dev ID matches what `--genkey` printed.
4. Never email, upload, commit or paste the key file, signing password or Dev ID
   into chat.

## Step 3: produce the signed package (owner authorization required)

```powershell
node tools/sign.mjs 192.168.1.100 --package
Remove-Item Env:ROKU_DEV_PASSWORD
```

It re-verifies the RC9 ZIP and the device key, sideloads RC9, runs the
Packager (app name `PROtv/1.0.0`) and writes, read-only:

- `D:\protv\tv\roku\dist\releases\signed\protv-roku-v1.0.0-rc9-signed.pkg`
- `D:\protv\tv\roku\dist\releases\signed\protv-roku-v1.0.0-rc9-signed.pkg.sha256`

Check it shows the expected Dev ID, then add the `.pkg` and its SHA-256 to the
encrypted backup from step 2.

If the TV is ever factory reset or developer mode is re-enabled, restore the
key with Utilities > Rekey (upload the signed `.pkg`, enter the signing
password). `--package` refuses to run until that is done.

## Not part of signing (each needs separate authorization)

Uploading the `.pkg` to the Developer Dashboard and submitting channel 888987;
deploying the Roku launch-catalog eligibility backend; publishing the legal pages.
