# Roku distribution rights

How a title reaches the Roku app. The rule is in `backend/src/catalog/platformEligibility.js`.

- **Reviewed titles:** the launch list from `tv/roku/store/ROKU-LAUNCH-CATALOG.md` (branch `release/roku-1.0-rc9`), plus creator films whose signed agreements were read.
- **New creator titles:** cleared when published, if the signed Schedule names Roku, TV apps or PROtv's apps. The Creator Portal decides this from the signed wording and sends `rokuCleared`. A signature alone is not enough, because the master agreement limits PROtv to the surfaces a Schedule identifies.
- **Held titles:** everything else stays off Roku. They remain on the website; this rule changes Roku only.
- **To clear one title without a deploy:** set `rokuCleared: true` on its `videos` document, with `rokuClearedBasis` stating the evidence.
- **To withdraw one title:** set `rokuHold: true`, which overrides everything else.

Music is excluded from device apps separately, and the released Roku app accepts only movies and episodes. No territory limits are recorded on any title; the signed agreements reviewed were worldwide or silent on territory.

## Titles in the catalog on 2026-11-02

| Title | ID | On Roku | Basis |
| --- | --- | --- | --- |
| A Day in the Life of a Coal Miner (1910) | `u3dXF1OlGIXiRPAHz3hE` | Yes | Rights evidence reviewed; cleared |
| Africa Screams (1949) | `uvRcBLWVKxLyHsswVZOo` | Yes | Rights evidence reviewed; cleared |
| Angel and the Badman (1947) | `aIZ4FeTCPjuTlycMgxiK` | Yes | Rights evidence reviewed; cleared |
| Angel on My Shoulder (1946) | `KS5fwSoYxy8h3FkrTWW3` | Yes | Rights evidence reviewed; cleared |
| Attack of the Giant Leeches (1959) | `ZIWIKF2lyh7hJCcRkPLr` | Yes | Rights evidence reviewed; cleared |
| Big Buck Bunny (2008) | `hKPU3JNJ4faWLgWE6ZSq` | Yes | Rights evidence reviewed; cleared |
| Big Timers (1945) | `dKxiQCeBcuT92BKv9dgJ` | Yes | Rights evidence reviewed; cleared |
| Body and Soul (1925) | `biitnhJJnBvHGFx8TJZC` | No | Held: rights unclear for the copy PROtv streams |
| Captain Kidd (1945) | `CmN3oev0txAoerdvsjCb` | Yes | Rights evidence reviewed; cleared |
| Carnival of Souls (1962) | `WIVB9NPQQzvtvjTBsiKw` | No | Held: verified replacement copy staged, not yet applied |
| Cavalcade of Stars | `FOn1pIGiBKaUb89oE6Gm` | No | Held: rights unclear for the copy PROtv streams |
| D.O.A. (1950) | `WMmLodEvI2gpEVW9v6yL` | Yes | Rights evidence reviewed; cleared |
| Dead Air | `creator_89303465-51e3-46bb-bd21-ff5ed2db2c49` | Yes | Rights evidence reviewed; cleared |
| Detour (1945) | `IHkqDr5bGIY0Nw5Lhkky` | No | Held: verified replacement copy staged, not yet applied |
| Elephants Dream (2006) | `6wWGoL2qWRqtCmCTSRQY` | Yes | Rights evidence reviewed; cleared |
| Fleischer Studios' Superman | `iUX01XuVHd9okFW4gmqR` | No | Held: rights unclear for the copy PROtv streams |
| Gulliver’s Travels (1939) | `t6Ii7hflAigcefjBRz3r` | No | Held: rights unclear for the copy PROtv streams |
| His Girl Friday (1940) | `LiMNMZWXBxJj3LoP73kU` | Yes | Rights evidence reviewed; cleared |
| House on Haunted Hill (1959) | `p532d2Aqpb3bC2rvYkQw` | No | Held: rights unclear for the copy PROtv streams |
| Jungle Book 1942 | `aFRblRPxcp3LEm1lf4ye` | Yes | Rights evidence reviewed; cleared |
| KIPHO | `hFVcdczhgn8dT3cZcXAR` | No | Held: verified replacement copy staged, not yet applied |
| Looney Tunes Classics: Collection | `lussNXvK08RN9xtfq4wN` | No | Held: rights unclear for the copy PROtv streams |
| Merri Melodies shorts | `v_1789872561270_i3svw5cbz` | No | Held: rights unclear for the copy PROtv streams |
| Murder in Harlem (1935) | `6h3blkiA6LTeLv66jj1v` | Yes | Rights evidence reviewed; cleared |
| NASA's Documentary Film - Hubble25 | `vmsxoXY005wf3SwsfF7F` | No | Held: rights unclear for the copy PROtv streams |
| Night of the Living Dead (1968) | `zGpbFWvSaup6ioUaoqsN` | No | Held: verified replacement copy staged, not yet applied |
| One Step Beyond - The Storm | `5FHvg3BEwBlk9qqNdZT5` | No | Held: rights unclear for the copy PROtv streams |
| Parker Solar Probe | `BcyriYT9mIQj4ZDd9jFr` | No | Held: rights unclear for the copy PROtv streams |
| Plan 9 from Outer Space (1957) | `B2MDEH2b25NknMQMEhoM` | Yes | Rights evidence reviewed; cleared |
| Sintel (2010) | `sCWQqVE5WIoNNN5wAGQ2` | Yes | Rights evidence reviewed; cleared |
| Sita Sings the Blues (2008) | `vuvTzWOcVJJeg12CsTq9` | No | Held: rights unclear for the copy PROtv streams |
| Superman cartoons | `morl7jrTRiEF2ihf282A` | No | Held: rights unclear for the copy PROtv streams |
| Tears of Steel (2012) | `gbcxmtl6mAHQeBxx8Dgs` | Yes | Rights evidence reviewed; cleared |
| The Amazing Mr. X (1948) | `evCYYCPlc23BKzpmt2ug` | Yes | Rights evidence reviewed; cleared |
| The Battle of Midway (1942) | `2OTfk1MA9SNAJcXQajCl` | Yes | Rights evidence reviewed; cleared |
| The Blood of Jesus (1941) | `PqGsChF8xtTQdaQFEWQI` | Yes | Rights evidence reviewed; cleared |
| The Brain That Wouldn't Die (1962) | `RwDe3WkIWoHQ1EUzfWn9` | Yes | Rights evidence reviewed; cleared |
| The Bronze Buckaroo (1939) | `goOpjlfjJF3YWw5dlHqe` | Yes | Rights evidence reviewed; cleared |
| The Bundy Chronicles | `sqKR6c5Cq7MD9lg1GDxG` | No | Held: rights unclear for the copy PROtv streams |
| The Duke Is Tops (1938) | `1l1uGB4v8CaUr9p4TTGv` | Yes | Rights evidence reviewed; cleared |
| The Exile (1931) | `uzZVSNOg0sOZaTk4tlV6` | Yes | Rights evidence reviewed; cleared |
| The Girl from Chicago (1932) | `Ts881xyfGAz4E4TZHIeg` | Yes | Rights evidence reviewed; cleared |
| The Incredible Petrified World (1959) | `MZ6Q6DI2S62pP8laH9Ku` | Yes | Rights evidence reviewed; cleared |
| The Little Shop of Horrors (1960) | `3NAU6BldsmCNs9wjM08a` | Yes | Rights evidence reviewed; cleared |
| The Lost Camp | `creator_20752565-9909-4c2b-9f53-c9719ca26769` | Yes | Rights evidence reviewed; cleared |
| The Phantom of the Opera (1925) | `WeNPJRItOH2nOdbwLkDG` | No | Held: verified replacement copy staged, not yet applied |
| The Scar of Shame (1927) | `tuwoR1lZN8VnSTCSEiTc` | No | Held: verified replacement copy staged, not yet applied |
| The Thirst | `creator_613e215e-709f-48ee-91bb-b225d8da4a33` | Yes | Signed replacement agreement: PROtv platform and associated applications, worldwide |
| UNITED NATIONS | `creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6` | Yes | Signed Schedule B naming TV apps |
| Within Our Gates (1920) | `XMj306OZSbomES2Zz0Fz` | No | Held: rights unclear for the copy PROtv streams |
| Woman on the Run (1950) | `9P2whdYluJRAJeI6cOuh` | No | Held: rights unclear for the copy PROtv streams |
