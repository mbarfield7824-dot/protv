# Rollback and recovery

- Frozen verified source: `d2a6965250a9cc928c38c99f175332dbaa04c788`.
- Remote rollback tag: `firetv-rc1-rollback-20261024`.
- RC package/version: `com.protv.firetv`, `0.2.0-rc1` / code 2.
- Corrected RC1 debug APK SHA-256: `5C3926EA217AE08D2B828F09F685510D5420509F0084501673B8BAE04CC76CE7`.
- Debug signer SHA-256: `d1fd4ef346ccd1bc94e690d49e448640b863f5374157b426e8b6c97a91bf30d2`.

Do not uninstall or clear data to roll back. Android permits in-place update only with a compatible signing identity and version rules. Keep the existing verified APK and private signing key backed up securely; this package does not contain either private key material or an APK intended for submission.

The historical signed 0.1.0 APK in the separate Roku checkout is not the current RC and the signing private key was not located. Do not assume it can update the current installation or use it as a recovery binary without checking signature and package version compatibility first.

Before any future update, preserve the current APK and its checksum, verify the new candidate's signature against the installed app, and use a separate test device if the signature or version check fails.
