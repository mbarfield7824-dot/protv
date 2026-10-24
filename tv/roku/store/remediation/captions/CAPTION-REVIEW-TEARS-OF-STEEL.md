# Tears of Steel captions: review sheet

For the person reviewing the pilot captions before they are attached.
**Not published. Nothing is attached to Mux.**

| Item | Value |
| --- | --- |
| File | `tears-of-steel.en.vtt` (76 cues), converted from `TOS-en.official.srt` with `tools/captions.mjs`; text unchanged |
| Source | Blender Foundation's official subtitles, `download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt`, as captured by the Wayback Machine on 2013-07-02 (the live server blocks automated downloads) |
| Licence | CC BY 3.0: the Mango project licence covers "all the data we publish on this website" (mango.blender.org/sharing). Attribution: "(CC) Blender Foundation / mango.blender.org" |
| Fits PROtv's copy? | Yes. PROtv streams the official release (734 s); the subtitles were made for it. Measured global offset against the official audio: +0.1 s (aligned) |
| Type | Subtitles (dialogue only). Adding sound cues makes them captions; attach with `closed_captions: false` until then |

## Automated checks (2026-10-24)

- Format: 76 cues, in order, none past the end of the film, none empty.
- Global timing: aligned (best match +0.1 s).
- **Check by eye and ear** (the measurement cannot decide these): 23 cues where
  speech is masked by the score in the measurement, at 61, 131, 136, 226,
  231, 233.5, 237, 240, 241.5, 245, 302.5, 316, 325, 356, 359.5, 386, 396,
  407, 410, 422, 518, 534 and 559 seconds.
- Two lines exceed 42 characters (at 25 s and 41 s), and 11 cues read faster
  than 20 characters per second. The worst is "...by these giant robotic
  claws of death..." at 41 s (1 second on screen). Consider splitting or
  extending these.
- Language: the film contains the word "dick" (cue at 359.5 s); keep it as
  spoken.

## Review steps (about 30 minutes)

1. Play the film with the VTT (VLC: Subtitle > Add Subtitle File).
2. Check every cue listed above; fix timing in 0.1 s steps if a line appears
   early or late.
3. Optional: add sound cues ([alarm blares], [robots whirring]) to make them
   captions.
4. Delete the `NOTE` block at the top of the file, and record the reviewer's
   name and date in this sheet.
5. Attach it (owner approval): captions-investigation.md, "First title: Tears
   of Steel", step 4.

Reviewed by: ________  Date: ________
