# Owner approvals needed (batched)

2026-10-24. Five decisions unlock the Roku submission; everything else is
prepared. Reply with the batch numbers you approve.

## 1. Deploy the Roku launch catalog (backend)

Deploy `feature/roku-launch-eligibility` (`58d0f28`). Roku then shows the 28
Group A titles; the website and Fire TV are unchanged. Reversible by
redeploying `b123f03`. Details: remediation/CHANGE-MANIFEST.md, Batch 1.

## 2. Replace six videos and three posters

Run `apply-remediation.cjs stage`, then `apply`, with your approval
reference. This adds new Mux assets (old ones kept) and changes only the
listed fields on 9 records. It brings Detour, Carnival of Souls, Night of the
Living Dead, The Scar of Shame, The Phantom of the Opera and KIPHO to Roku
(34 titles), and removes likeness and hotlinked posters on all platforms.
Reversible with `rollback`. Details: CHANGE-MANIFEST.md, Batch 2.

## 3. Confirm poster provenance (one statement)

The 32 owner-supplied posters (approved in GitHub issue #5) have no recorded
creation method. Please state how they were made (for example, "created by
Prophecy Entertainment with <tool> under its commercial-use terms; no
third-party artwork or photographs used"). Batch 2 already replaces the two
that depict real performers.

## 4. Website and Fire TV: titles with renewal records

These titles have **primary records of renewed rights** and are still live on
the website and Fire TV (the Roku allowlist already excludes them):

| Title | Record |
| --- | --- |
| Gulliver's Travels (1939) | Songs renewed 1966 (Famous Music; protected to the end of 2034) |
| House on Haunted Hill (1959) | Film renewal RE0000318809 (1986) and song renewal RE0000309723 |
| Woman on the Run (1950) | Score renewal RE0000909148 |
| "Merri Melodies shorts" (You're Too Careless with Your Kisses!, 1932) | Song renewed 1959 (protected through 2027) |

Recommendation: restrict these four everywhere with the existing reversible
Admin workflow, as with the seven titles restricted on 2026-10-23. Not done:
it changes the website and needs your decision.

## 5. Final Roku steps (only you can do)

- Sideload RC5 after Batch 1 and confirm 28 titles; run docs/TV-TESTS.md
  section 8; run the 2-hour soak (never performed).
- Capture 6 screenshots (STORE-SUBMISSION-PACKAGE.md section 4, Group A
  titles only).
- Create the reviewer account and record the two .rasp scripts.
- `genkey`, back up the Dev ID and password, package RC5, back up the .pkg.
- Enter the support phone and administrative and technical contacts.
- Publish the approved privacy policy and terms (counsel first).
- Explicitly authorize the final submission.

## For counsel (not blocking the 28-title launch)

- Captions: whether 47 CFR 79.4 applies to any launch title
  (CAPTIONS-ASSESSMENT.md).
- Group C questions in ROKU-LAUNCH-CATALOG.md: the Superman derivative-work
  question, the Cavalcade of Stars broadcast, One Step Beyond and CBS, the
  Within Our Gates intertitles, the House on Haunted Hill renewal vs notice,
  and Sita's song terms.
- Privacy and terms decisions L1–L10 (legal/LIVE-VS-DRAFT-CORRECTIONS.md).
