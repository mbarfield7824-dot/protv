# Rollback and recovery

## Current (2026-10-25): code 5 release and the Firestick

- Release: `com.protv.firetv` 1.0.0 / code 5, source `7ff427f`, APK SHA-256 `08df95f7d48b18222e9d63b6e5c121e67033302ddf80e39c1a995044283152d5`, upload signer `3014…5a7f`. Installed on the owner's Firestick (AFTMM, serial G070VM2213661NEC).
- Superseded code 4 (`e52fea8c…b0b9`, source `f0d8e92`) is kept in `D:\protv-firetv-artifacts\final-1.0.0-code4-20261025\`. It has the same signer, so it could replace code 5 only by uninstalling (Android blocks version downgrades).
- On 2026-10-25 the debug RC (code 2) was uninstalled with the owner's approval and code 4 installed; code 5 was then installed as an update. The device's package records before and after are in `D:\protv-firetv-artifacts\firestick-records\`.
- Preserved before the code-4 build, outside the repository, in `D:\protv-firetv-artifacts\pre-final-build-20261025\` (with `SHA256SUMS.txt`):
  - `PROtv-0.2.0-rc1-code2-debug-INSTALLED-ON-FIRESTICK.apk` (`5c3926ea…6ce7`, debug signer `d1fd4ef3…30d2`), the build on the owner's Firestick before code 4.
  - `PROtv-1.0.0-code3-signed-UNUSED.apk` (`cabfa00e…0301`), never installed or uploaded.
- The signed release and the debug RC have different signers, so moving between them on one device requires uninstalling `com.protv.firetv` (local app data is lost; My List and watch progress stay on the account). Rolling the Firestick back to the RC: `adb uninstall com.protv.firetv`, then `adb install` the preserved RC APK.
- Amazon updates must be signed with the same upload key. Backups are made with `D:\protv-firetv-artifacts\tools\Backup-ProtvFireTvKey.ps1` and logged (no secrets) in `D:\protv-firetv-artifacts\key-backup-log.txt`.

## Earlier record (2026-10-24)

- Frozen verified source: `d2a6965250a9cc928c38c99f175332dbaa04c788`.
- Remote rollback tag: `firetv-rc1-rollback-20261024`.
- RC package/version: `com.protv.firetv`, `0.2.0-rc1` / code 2.
- Corrected RC1 debug APK SHA-256: `5C3926EA217AE08D2B828F09F685510D5420509F0084501673B8BAE04CC76CE7`.
- Debug signer SHA-256: `d1fd4ef346ccd1bc94e690d49e448640b863f5374157b426e8b6c97a91bf30d2`.

Do not uninstall or clear data to roll back. Android permits in-place update only with a compatible signing identity and version rules. Keep the existing verified APK and private signing key backed up securely; this package does not contain either private key material or an APK intended for submission.

The historical signed 0.1.0 APK in the separate Roku checkout is not the current RC and the signing private key was not located. Do not assume it can update the current installation or use it as a recovery binary without checking signature and package version compatibility first.

Before any future update, preserve the current APK and its checksum, verify the new candidate's signature against the installed app, and use a separate test device if the signature or version check fails.

## Production keystore backup procedure

The production upload keystore must remain outside the repository. The Gradle release configuration reads these local environment variables and never writes their values into the project:

- `PROTV_RELEASE_KEYSTORE_PATH`
- `PROTV_RELEASE_KEYSTORE_PASSWORD`
- `PROTV_RELEASE_KEY_ALIAS`
- `PROTV_RELEASE_KEY_PASSWORD`

## Current local signing identity

- Generated after owner authorization on 2026-10-24.
- Keystore: `%LOCALAPPDATA%\PROtv\firetv-signing\protv-firetv-upload.p12` (outside the checkout).
- Alias: `protv-amazon-upload`; RSA 3072-bit; PKCS#12; SHA256withRSA; certificate validity 10,000 days.
- Certificate SHA-256: `301433275fdc7d791dcf6c436499c2b517586de9548eef021f7c2a8482115a7f`.
- A random signing password is stored only in `%LOCALAPPDATA%\PROtv\firetv-signing\credentials.dpapi`, encrypted using the current Windows user's DPAPI. The keystore directory and files grant access only to the current user and LocalSystem.
- No password, private key, or plaintext credential file is in the repository. The temporary password file used by keytool was removed after key creation.
- An independent encrypted offline keystore backup and restore test are not yet recorded. On 2026-10-24, the available Windows file-system volumes were checked; no separately controlled offline destination was available, so no backup copy was created. Arrange the backup and test through the owner's controlled backup system before relying on this key for future releases.

After the owner-approved signing identity is generated:

1. Store the primary keystore in an access-controlled, encrypted release-signing location outside all checkouts. Restrict access to authorized release maintainers.
2. Store the keystore and both passwords in the organization's approved encrypted password manager or secrets vault; do not put them in `.env`, Gradle properties committed to the repo, chat, email, or shell history.
3. Create a second encrypted offline backup on separately controlled media and record its custody/location in the owner-controlled password manager. Do not store the backup beside the primary copy.
4. Verify the keystore can be read with `keytool -list -v` using the password prompt, and verify its public certificate fingerprint. Never export or print the private key.
5. Perform a controlled restore test from the backup to a temporary location outside the repository, verify the certificate fingerprint matches, and securely remove the temporary restored copy.
6. Keep an owner-approved recovery contact/process and rotate neither the key nor alias without evaluating Amazon update compatibility.

The keystore and DPAPI credential file are local-only and are not included in this package or Git. Do not regenerate or replace this identity; future Amazon updates must use the same upload key.
