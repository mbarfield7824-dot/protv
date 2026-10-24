# Captions and audio description: requirements investigation

**Research file for the owner and counsel, 2026-10-23. Not legal advice; no
exemption is claimed.** Sources are quoted from the primary texts named.

## Bottom line

1. **Roku requires captions only "where required by law"** and, once an app
   includes captions, requires Roku's caption settings in the Options (*)
   menu. PROtv for Roku 1.0.0 RC2 has no caption tracks, so the
   menu requirement does not apply yet.
2. **US law:** the FCC rule for internet-delivered video (47 CFR 79.4)
   applies to full-length programming that was **"published or exhibited on
   television in the United States with captions."** PROtv cannot show which
   of its classic titles have aired on US TV with captions. Several (classic
   horror, noir and comedy features, and the TV episodes) are the kind of
   programming that does air on US TV. Counsel should decide; this file does
   not assume the rule is inapplicable.
3. **Recommended:** caption every long-form title, starting with the most
   plausibly covered. Mux's pricing page lists "On-demand auto-generated
   captions" as **included with Mux Video ("free")**. Its docs add that
   contract customers must contact Mux support for assets older than 7 days
   (the owner confirms the account type). Captions need human review before
   viewers see them (section 4).
4. **App finding, fixed in an RC3 candidate (not TV-tested):** in RC2,
   focus during playback sits on a separate key catcher, and Roku documents
   that "when the Video node is not in focus, the options overlay does not
   slide in". Branch `fix/roku-caption-options` (commit `d023f0a`) keeps
   focus on the Video node, with 215 scene tests (RC2 fails them). Package:
   `dist/releases/protv-roku-v1.0.0-rc3-candidate.zip`. **RC2 stays the
   stable candidate** until the 3-minute TV check in TV-TESTS.md section 7
   passes.

## RC5 status and one-title workflow (2026-10-24)

**State:** 0 of 49 live titles has a caption or subtitle track. Every master
playlist was checked through PROtv's own playback authorization:
`CLOSED-CAPTIONS=NONE` and no `TYPE=SUBTITLES` rendition (public GETs of
master playlists only). The app does not claim captions anywhere (listing,
release notes, reviewer notes).

**Player:** verified on a Roku TV with the RC4 caption-test package. *
opens Roku's caption settings, and English WebVTT subtitles render and follow
On/Off. Roku picks the track from the viewer's caption language; the app sets
no caption fields (a project test keeps it that way). RC5 removes the test
title; nothing else about captions changed.

**Formats Roku supports for HLS VOD:** WebVTT "in a separate stream described
in the manifest playlist" (what Mux text tracks produce), EIA-608 in the
stream, and SMPTE-TT as an external file (Roku closed-caption guide).

**Mux auto-generated captions:** "There is no additional charge for this
feature" (Mux docs; "there may be a charge for backfilling captions onto large
libraries"). Started per asset with `POST
/video/v1/assets/{ASSET_ID}/tracks/{AUDIO_TRACK_ID}/generate-subtitles`.
English is a stable language. Mux warns that music, noise and silence reduce
accuracy. **Not used in RC5:** a generated track is attached to the live asset,
so viewers would see unreviewed captions as soon as it is ready. Generating
needs the production Mux API (owner credentials), which was not used.

**Accuracy review (before any track is attached):** a person watches the
whole title with the captions and checks the wording, speaker changes, cue
timing (no cue early or late by more than about half a second), and line length
(two lines, about 32 characters each). Captions for FCC-covered programming
must be at least as good as the TV captions (47 CFR 79.4(c)). Include sound
cues ([music], [door slams]) for accessibility; plain subtitles cover
dialogue only.

### First title: Tears of Steel (cleared, English dialogue, 12 min)

Blender publishes official English subtitles for Tears of Steel:
https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt (from
https://mango.blender.org/download/). The server shows a browser check, so
the file could not be fetched automatically; it was not bypassed.

1. **Owner:** open the URL in a browser and save `TOS-en.srt`.
2. Convert and check it against PROtv's copy (734 s):
   `node tools/captions.mjs TOS-en.srt TOS-en.vtt 734`. Any PROBLEM line
   means the subtitle timing does not match PROtv's cut: stop.
3. **Review:** watch Tears of Steel with the VTT (for example in VLC) end to
   end, and add sound cues where needed. Keep the reviewed file.
4. **Owner, production Mux (no generation; confirm in the Mux dashboard that a text track adds no charge):** host the reviewed VTT at an
   HTTPS URL, then add it to the title's asset:
   `curl https://api.mux.com/video/v1/assets/$ASSET_ID/tracks -X POST -u "$MUX_TOKEN_ID:$MUX_TOKEN_SECRET" -H "Content-Type: application/json" -d '{"url":"<VTT URL>","type":"text","text_type":"subtitles","language_code":"en","name":"English","closed_captions":false}'`
   Use `"closed_captions": true` only if the file includes sound cues.
5. **Verify discoverability:** the title's master playlist (via
   `/api/v1/catalog/titles/gbcxmtl6mAHQeBxx8Dgs/playback`) lists a
   `TYPE=SUBTITLES` rendition. Rerun the manifest check script.
6. **TV:** play Tears of Steel on RC5, press *, turn captions On: the
   subtitles appear in sync; Off: they disappear.
7. **Rollback:** `DELETE /video/v1/assets/$ASSET_ID/tracks/$TRACK_ID`.

Do not start bulk generation. Do not describe PROtv as captioned until the
titles that need captions have reviewed tracks.

## RC4 update (2026-10-24)

- **TV (RC3):** * opened Roku's caption settings, so the Options gap below is
  closed. Turning captions on showed no words.
- **Why no words:** no title has a caption track. All 49 live titles were
  checked through the app's own playback authorization: every master
  playlist declares `CLOSED-CAPTIONS=NONE` and has no `TYPE=SUBTITLES`
  rendition (public GETs of master playlists only; no segments). This is
  "no caption track exists", not a player or settings fault.
- **App side:** Roku "selects a closed caption track based on the preferred
  caption language" and apps "do not need to handle track selection"
  (Roku closed-caption guide). PROtv sets no caption fields; a project test
  keeps it that way.
- **Check without Mux cost:** the caption-test package (RELEASES.md, RC4)
  lists one "TEST ONLY" title playing Apple's public HLS sample, which has
  English WebVTT subtitles. It never ships; candidate packages are tested to
  lack the flag.
- **RC3 regression fixed in RC4:** a focused Video node swallowed OK. Focus
  now sits on a child of the Video node, which keeps the Video node in the
  focus chain for *.

## 1. Roku certification text (criteria page, last updated October 2026)

> **4.8** Apps must comply with all applicable accessibility laws and global
> settings related to accessibility and user experience. Apps must provide
> closed captions and audio descriptions for content where required by law.
> If including closed captions, the app must follow the user global settings
> for closed captioning, and support the following closed captioning settings
> in the Options menu: On, Off, On instant replay, and On mute (Roku TVs
> only). For VOD content, apps must synchronize the captions with the audio.

> **4.4** Roku reserves use of the Options ("*") button during video playback
> for the sole purpose of Roku system displays.

Roku's closed-caption guide adds: the Options overlay "only works if the app
does not have its OnKeyEvent() handler fired"; "When the Video node is not in
focus, the options overlay does not slide in"; and if an app overrides the
built-in functionality, it "must offer equal levels of functionality".

## 2. US law

### FCC IP closed captioning (47 CFR 79.4, under the CVAA)

- **Who:** a "video programming distributor or provider" is "any person or
  entity that makes available directly to the end user video programming"
  over Internet protocol (79.4(a)(3)). PROtv is one.
- **What:** nonexempt full-length video programming "published or exhibited
  on television in the United States with captions" (79.4(b)(1)). "Video
  programming" is programming comparable to a TV station's and excludes
  consumer-generated media (79.4(a)(1)).
- **Library content:** if a title already online is later shown on US TV with
  captions, the online copy must be captioned within **15 days** (for
  showings on or after March 30, 2016; 79.4(b)(1)(iv)).
- **Quality:** owners must provide captions "with at least the same quality
  as the television captions" (79.4(c)(1)(i)); distributors must keep that
  quality (79.4(c)(2)(i)).
- **Relying on owners:** a distributor "may rely in good faith on a
  certification by a video programming owner" that captioning is not
  required, if it "includes a clear and concise explanation of why captioning
  is not required" and can be produced to the FCC (79.4(c)(2)(ii)).
- **Exemptions:** de minimis failures are not violations (79.4(c)(3));
  economic-burden exemptions only by FCC petition (79.4(d)).

**How it maps to PROtv's catalog**

| Group | Titles | Assessment |
| --- | --- | --- |
| Classic sound features, 1931–1968 | 30 | May have aired on US TV with captions (broadcast and cable channels show public-domain classics; an Internet Archive upload of *The Incredible Petrified World* is labelled as a Svengoolie (MeTV) airing). Treat as possibly covered. |
| TV episodes and classic cartoons (One Step Beyond, Cavalcade of Stars, Superman, Looney Tunes, Merrie Melodies, 50 Classic Cartoons) | 7 | Television or theatrical programming that airs on TV; possibly covered. |
| Silent films, 1910–1927 (including the KIPHO short) | 6 | Intertitles are on screen; the four features have music tracks. Captioning the music cues is good practice. |
| 1930s–40s US government documentaries | 3 | Possibly covered if aired with captions. |
| Blender open movies, Sita, NASA films, The Bundy Chronicles | 8 | No known US TV exhibition; likely outside the trigger. |
| Creator titles (The Lost Camp, Dead Air) | 2 | Creators are the "owners". PROtv can collect a written certification (79.4(c)(2)(ii)) that a title has not aired on US TV with captions. This would be a new form, not a change to existing agreements. |

**Public-domain gap:** the rule assumes an owner who passes captions to the
distributor. For public-domain titles PROtv sourced itself, no owner supplies
captions, and PROtv may effectively be both owner and distributor
(79.4(a)(4)(ii)). Counsel should confirm how the rule applies. Captioning
removes the question.

### Audio description

As we read the FCC rules, audio (video) description obligations (47 CFR
79.3) apply to certain broadcast stations and multichannel video distributors,
not to internet-only services. Counsel to confirm. No audio-description
tracks exist in any PROtv title.

### ADA Title III

Courts have differed on whether online-only video services are "places of
public accommodation". In *National Association of the Deaf v. Netflix*
(D. Mass. 2012) the court refused to dismiss the claim, and Netflix then
agreed to caption its streaming library. This is a litigation risk, not a
Roku rule; captioning all titles reduces it. Counsel to assess current law.

### Outside the US

Not relevant for a US-only launch. Before expanding (for example to the EU,
where the European Accessibility Act applies to some audiovisual services),
repeat this review.

## 3. App readiness (PROtv for Roku 1.0.0 RC2)

| Item | Status | Evidence |
| --- | --- | --- |
| Caption format | Ready | Roku: WebVTT "in a separate stream described in the manifest playlist" is supported for HLS VOD; Mux adds text tracks to the HLS manifest |
| Rendering and global setting | Expected to work | The Video node handles captions and follows the system caption setting; the app sets no caption fields |
| Options (*) menu during playback | RC2: **gap** (per Roku docs; `playerKeys` holds focus). RC3 candidate: **fixed in code, not TV-tested** | RC2 [ProtvScene.brs:1219](../components/ProtvScene.brs#L1219), [:1288](../components/ProtvScene.brs#L1288); RC3 commit `d023f0a` |
| Caption sync | Depends on track timing | QA each title |

**RC3 candidate (implemented):** the Video node holds focus during playback
with `enableUI="false"`. PROtv's controls stay in the scene's `onKeyEvent`,
which receives the keys the Video node does not handle, and `options` is
never handled. The package differs from RC2 only in `ProtvScene.brs` and
`ProtvScene.xml`.

**The one thing only a TV can prove:** with the Video node focused, OK still
reaches PROtv (pause and controls). v0.5.4's OK problem happened with the
native UI on; it stays off here. If OK does not pause on the TV, use the
fallback below and keep RC2.

**Fallback (not built):** a Captions control on the PROtv overlay offering
On, Off, On instant replay and On mute, writing the Video node's global
caption mode. Roku accepts this route if it offers "equal levels of
functionality".

**RC2 TV check (no build change):** during playback, press * once and
record whether Roku's overlay appears (TV-TESTS.md section 6, step 8).

## 4. Caption rollout strategy (no cost incurred; nothing generated)

**Rule: no unreviewed automatic captions reach viewers.** Mux's docs do not
say whether a generated track is withheld until reviewed, so assume it goes
live as soon as it is ready.

1. **Prove the Mux behavior once, safely:** run `generate-subtitles` on one
   asset that viewers cannot reach. A restricted title works: its playback
   ID is no longer served by PROtv. Watch whether the track appears in its
   HLS manifest when `video.asset.track.ready` fires.
2. **Draft method:**
   - If tracks are withheld until reviewed, generate in Mux (POST
     `/video/v1/assets/{ASSET_ID}/tracks/{AUDIO_TRACK_ID}/generate-subtitles`,
     free per Mux pricing).
   - Otherwise, make drafts away from the live asset: download the generated
     VTT from the test asset and delete it, or transcribe locally with an
     open-source speech-to-text tool. No paid service is needed either way.
3. **Human review (required):** a reviewer watches each title with the
   draft, fixes names, period vocabulary and timing, and adds speaker and
   sound cues ("[music]", "[door slams]"). Expect heavy correction on
   1930s–60s soundtracks.
4. **Publish:** add the reviewed VTT with Mux's create-track API:
   `language_code: "en"`, `name: "English CC"`, `closed_captions: true`,
   `text_type: "subtitles"` (confirm field names against the current API
   reference). Delete any generated draft track. Record the reviewer and
   date in `titleRightsEvidence`.
5. **Priority (live titles only, so none of the 7 restricted):**
   1. classic sound features 1931–1968 and the TV episodes (most plausibly
      covered by 47 CFR 79.4);
   2. other titles over 15 minutes;
   3. silent films (music and sound cues only);
   4. shorts.

   Blender films: use the official subtitle files where they exist under the
   same license.
6. **Roku validation:** with RC3 confirmed on the TV, play one captioned
   title, press *, and turn captions on, off and "On instant replay"; check
   sync at the start, middle and end.
7. **Cost:** Mux auto-generated on-demand captions are listed as free. Mux
   "Robots" caption workflows (translate, edit, premium) are paid per minute
   and are **not** needed. Review time is the real cost.
8. **Open questions for counsel:** which titles aired on US TV with captions
   (79.4 trigger); caption-quality obligations for library titles; whether
   audio description applies (as read, internet-only services are not
   covered by 47 CFR 79.3); ADA risk posture.
