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
3. **Recommended:** caption every long-form title before or soon after
   launch. Mux documents auto-generated captions at **no additional charge**
   for existing assets; they need human review. 42 titles (55.1 of 57.3
   hours) are over 15 minutes.
4. **App finding:** during playback, focus is on PROtv's own controls, not
   the Video node, so Roku's Options (*) overlay probably cannot open. This
   needs fixing **before captions are added**, and needs one TV check now
   (TV-TESTS.md section 6, step 8). RC2 is not changed because the defect is
   inferred from Roku's documentation, not observed, and cannot be verified
   without a captioned title.

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
| Options (*) menu during playback | **Gap (inferred)** | `playerKeys` holds focus during playback ([ProtvScene.brs:1219](../components/ProtvScene.brs#L1219), [:1288](../components/ProtvScene.brs#L1288)); per Roku, the overlay does not open when the Video node is not focused |
| Caption sync | Depends on track timing | QA each title |

**Fix design (for RC3, together with the first captioned titles):**

- **Preferred:** give the Video node focus during playback and keep PROtv's
  key handling in the scene's `onKeyEvent` (keys bubble up from the focused
  Video node). Return `false` for `options` so Roku's overlay opens. Verify on
  the TV that OK, Left/Right, Replay and Back still reach PROtv with
  `enableUI="false"`. The v0.5.4 OK-button problem came from the native UI,
  which stays off.
- **Fallback:** a Captions control on the PROtv overlay offering On, Off,
  On instant replay and On mute, writing the Video node's global caption mode.
  This is the "equal levels of functionality" route.
- **Tests:** scene regressions that `options` is not consumed during playback
  and that focus returns to PROtv controls after Back; TV check with one
  captioned title.

**TV check now (no build change):** during playback, press * once. If
Roku's overlay appears, the gap does not exist. If nothing happens, RC2 still
passes 4.8 (no captions), but a reviewer may question 4.4. Record the result
in TV-TESTS.md.

## 4. Producing captions (no cost has been incurred)

1. **Auto-generate in Mux:** POST
   `/video/v1/assets/{ASSET_ID}/tracks/{AUDIO_TRACK_ID}/generate-subtitles`.
   Per Mux's docs: "There is no additional charge for this feature."
   "Languages labeled as beta may have lower accuracy", and mixed-language
   content is not recommended. Contract customers must contact Mux support
   for assets older than 7 days, so the owner should confirm the account type
   and current pricing before starting.
2. **Review:** old soundtracks (1930s–60s) will produce errors. Correct each
   WebVTT file and re-upload it with Mux's create-track API.
3. **Order:** classic features and TV episodes first (possibly legally
   covered), then everything else over 15 minutes, then shorts.
4. **Silent films:** caption music and sound cues (for example, "[orchestral
   music]"); intertitles are already on screen.
5. **Blender films:** check for official subtitle files under the same
   license before generating.
6. **Then:** ship the Options-menu fix as RC3, verify on the TV, and update
   CERTIFICATION.md 4.8.
