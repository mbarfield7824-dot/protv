# PROtv captions assessment and rollout

For the owner and counsel, 2026-10-24. **Not legal advice. This file does not
claim that any title must, or need not, be captioned.** Companion:
captions-investigation.md (technical workflow).

## 1. Current state

| Item | Status |
| --- | --- |
| Caption tracks in the live catalog | **0 of 49** (every master playlist checked: `CLOSED-CAPTIONS=NONE`, no `TYPE=SUBTITLES`) |
| Roku player | Verified on the owner's TV: * opens Roku's caption settings; English WebVTT subtitles render and follow On/Off |
| What PROtv claims | Nothing about captions in the listing, release notes or reviewer notes |
| Paid services activated | None. No Mux asset changed |

## 2. The rules

**Roku certification 4.8** (criteria page, 2026-10-05): apps must provide
captions "for content where required by law". If an app includes captions, it
must follow the global settings and offer On, Off, On instant replay and On
mute in the Options menu. PROtv's player already does this.

**FCC, 47 CFR 79.4** (Cornell LII text, 2026-10-24):

- Applies to "full-length video programming" ("video programming that appears
  on television and is distributed to end users, substantially in its
  entirety"), made available over IP by a "video programming distributor or
  provider" ("any person or entity that makes available directly to the end
  user video programming"). PROtv is one.
- **Trigger:** the programming was "published or exhibited on television in
  the United States with captions" on or after September 30, 2012 (prerecorded,
  not edited for the Internet).
- **Library titles:** programming already in PROtv's library "must be
  captioned within 15 days after the date it is shown on television with
  captions on or after March 30, 2016."
- **Clips** of such programming have their own rule (79.4(b)(2)); PROtv
  shows no clips.
- **Quality:** captions at least as good as the TV captions (79.4(c)).
- **Good faith:** a distributor may rely on an owner's certification that
  captioning is not required, if it "includes a clear and concise
  explanation" and can be produced to the FCC (79.4(c)(2)(ii)).
- **Exemption:** petition for economic burden (79.4(d)); the title is treated
  as exempt while the petition is pending.

**Outside the FCC rule:** the ADA question (online-only services and
"places of public accommodation") is a litigation risk, not a Roku rule;
counsel assesses it. Captioning removes the question.

## 3. Facts counsel needs for a determination

For each title:

1. Has it been shown on US television (broadcast, cable or satellite) since
   September 30, 2012? Channel and date. Sources: TCM, MeTV (including
   *Svengoolie*), Movies!, Grit, local station schedules, NASA TV.
2. Was that showing captioned? (Almost all US TV is captioned under the FCC's
   TV rules, but the question is per showing.)
3. When did the title go live on PROtv? (Library 15-day rule.)
4. Who is the "video programming owner"? For public-domain titles PROtv
   obtained itself, nobody licensed them to PROtv; PROtv may be both owner and
   distributor (79.4(a)(4)).
5. Whether the copy PROtv streams is the same programming that aired
   (79.4 covers programming "substantially in its entirety").

Data points found: an unconfirmed TVDB listing suggests *House on Haunted Hill*
aired on 2011-04-02, before the trigger date. *The Incredible Petrified World*
has an Internet Archive upload labelled as a *Svengoolie* (MeTV) airing.
Neither establishes a captioned showing after 2012; both show that fact
gathering is needed per title.

## 4. Title by title: likely exposure and reusable caption sources

"Draft only" means machine-made text that must be reviewed and corrected by
a person before use. Drafts timed to the matching source file fit PROtv's copy
because the runtimes match (TITLE-RIGHTS-MATRIX.md).

| Title | US TV exposure (for counsel; not a conclusion) | Reusable caption source |
| --- | --- | --- |
| A Day in the Life of a Coal Miner (1910) | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| Africa Screams (1949) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (AfricaScreams/Africa_Screams.asr.srt); draft only |
| Angel and the Badman (1947) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (angel_and_the_badman/angel_and_the_badman.asr.srt); draft only |
| Angel on My Shoulder (1946) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (angel_on_my_shoulder/angel_on_my_shoulder.asr.srt); draft only |
| Attack of the Giant Leeches (1959) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Big Buck Bunny (2008) | Not known to have aired on US TV: likely outside 79.4 | No dialogue: captions would be sound and music cues only |
| Big Timers (1945) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Body and Soul (1925) | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| Captain Kidd (1945) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Carnival of Souls (1962) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Cavalcade of Stars | Possibly: TV or theatrical programming that airs on US TV | Internet Archive speech-recognition draft timed to the matching file (Cavalcade_Of_Stars/Honeymooners_1951.autogenerated.vtt); draft only |
| D.O.A. (1950) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Dead Air | Not known to have aired on US TV: likely outside 79.4 | Creator supplies captions (ask under the agreement) |
| Detour (1945) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Elephants Dream (2006) | Not known to have aired on US TV: likely outside 79.4 | Official subtitles from the Orange project (CC BY 2.5); a third-party archive.org file is CC BY-ND (not editable: do not use) |
| Fleischer Studios' Superman | Possibly: TV or theatrical programming that airs on US TV | None found: draft locally with an open-source speech model from the matching source file, then review |
| Gulliver’s Travels (1939) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| His Girl Friday (1940) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| House on Haunted Hill (1959) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (The_House_On_Haunted_Hill/The_House_On_Haunted_Hill.asr.srt); draft only |
| Jungle Book 1942 | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| KIPHO | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| Looney Tunes Classics: Collection | Possibly: TV or theatrical programming that airs on US TV | None found: draft locally with an open-source speech model from the matching source file, then review |
| Merri Melodies shorts | Possibly: TV or theatrical programming that airs on US TV | None found: draft locally with an open-source speech model from the matching source file, then review |
| Murder in Harlem (1935) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| NASA's Documentary Film - Hubble25 | Possibly: NASA TV channel (carried on cable/satellite); caption status unknown | YouTube auto-generated English and Spanish tracks on the matching archive.org file (draft only) |
| Night of the Living Dead (1968) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| One Step Beyond - The Storm | Possibly: TV or theatrical programming that airs on US TV | None found: draft locally with an open-source speech model from the matching source file, then review |
| Parker Solar Probe | Possibly: NASA TV channel (carried on cable/satellite); caption status unknown | None found: draft locally with an open-source speech model from the matching source file, then review |
| Plan 9 from Outer Space (1957) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Sintel (2010) | Not known to have aired on US TV: likely outside 79.4 | Official subtitles from the Durian project download page (CC BY 3.0 project data); confirm the file and its licence |
| Sita Sings the Blues (2008) | Reported broadcast on WNET (PBS) in 2009, before the 2012 trigger (verify); later airings unknown | Fan subtitle file on the matching archive.org item (licence unknown: do not use); official film site lists subtitle resources to check |
| Superman cartoons | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| Tears of Steel (2012) | Not known to have aired on US TV: likely outside 79.4 | Official English subtitles, CC BY 3.0 (download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt; Mango licence covers "all the data we publish"). **Pilot.** |
| The Amazing Mr. X (1948) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (amazing_mr_x/amazing_mr_x.asr.srt); draft only |
| The Battle of Midway (1942) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (the_battle_of_midway/the_battle_of_midway.asr.srt); draft only |
| The Blood of Jesus (1941) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (blood_of_jesus/blood_of_jesus.asr.srt); draft only |
| The Brain That Wouldn't Die (1962) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Bronze Buckaroo (1939) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | Internet Archive speech-recognition draft timed to the matching file (bronze_buckaroo/the_bronze_buckaroo.asr.srt); draft only |
| The Bundy Chronicles | Not known to have aired on US TV: likely outside 79.4 | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Duke Is Tops (1938) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Exile (1931) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Girl from Chicago (1932) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Incredible Petrified World (1959) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Little Shop of Horrors (1960) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Lost Camp | Not known to have aired on US TV: likely outside 79.4 | Creator supplies captions (ask under the agreement) |
| The Phantom of the Opera (1925) | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| The Scar of Shame (1927) | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| Within Our Gates (1920) | Possibly (silent films air on TCM); intertitles are on screen, captions would cover music cues | None found: draft locally with an open-source speech model from the matching source file, then review |
| Woman on the Run (1950) | Possibly: classic films air on US TV (TCM, MeTV, local stations) | None found: draft locally with an open-source speech model from the matching source file, then review |

## 5. Rollout (no paid services; nothing published unreviewed)

| Wave | Titles | Source | Cost |
| --- | --- | --- | --- |
| 1. Pilot | Tears of Steel | Official CC BY 3.0 subtitles (attribution "(CC) Blender Foundation / mango.blender.org") | Reviewer time only (~30 min) |
| 2 | Sintel, Elephants Dream, Big Buck Bunny (sound cues) | Official project subtitles (confirm each file's licence) | Reviewer time |
| 3 | Classic features and episodes that counsel considers exposed, highest first | Internet Archive speech-recognition drafts timed to the matching file (9 titles); otherwise a local open-source speech model run on the matching public source file | Reviewer time; no service fees |
| 4 | Everything else over 15 minutes | Same as wave 3 | Reviewer time |
| — | Creator titles | Ask creators to supply captions under their agreements | — |

**Review standard (every track):** a person watches the whole title with the
track. They correct wording and speaker changes, keep cues within about half a
second of speech, limit lines to two of about 32 characters, and add sound and
music cues ([organ music], [door slams]) so the track serves deaf and
hard-of-hearing viewers, not only as subtitles. Silent films get music-cue
captions only. Reviewer time is roughly 1.5 to 2 times the runtime per title
(an estimate, not a quote); the 35 live titles over 15 minutes total about 42.5 hours
of runtime.

**Why not Mux auto-captions:** Mux states "There is no additional charge for
this feature", but the generated track attaches to the live asset and viewers
see it as soon as it is ready, before any review. Use it only if Mux
confirms a way to keep a generated track unpublished (ask Mux support).

**Attaching a reviewed track (owner approval each time):** convert with
`node tools/captions.mjs <in.srt> <out.vtt> <runtime>`. Host the VTT over
HTTPS, then add it with Mux's create-track API. The exact command, the
verification and the rollback are in captions-investigation.md ("First title:
Tears of Steel"). Confirm in the Mux dashboard that a text track adds no
charge before the first one.

## 6. What may be said publicly

Until reviewed tracks exist, say nothing about captions. Afterwards, name the
captioned titles; never describe PROtv as "captioned" in general.

## Sources

- Roku certification criteria (updated 2026-10-05), 4.8.
- 47 CFR 79.4, text at https://www.law.cornell.edu/cfr/text/47/79.4 (eCFR
  blocked automated access).
- Mux: https://www.mux.com/docs/guides/add-autogenerated-captions-and-use-transcripts
- Mango (Tears of Steel) licence: https://mango.blender.org/sharing/ ("all the
  data we publish on this website"), subtitles from https://mango.blender.org/download/
- Internet Archive item metadata API (subtitle files per matched item).
