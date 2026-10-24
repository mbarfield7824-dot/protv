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
