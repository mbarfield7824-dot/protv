# Remaining Roku certification tests (owner, physical TV)

Build: `dist/releases/protv-roku-v1.0.0-rc2.zip` (SHA-256
`471f12dd…095c5bf8`). Footer on the Account screen: **PROtv for Roku 1.0.0**. Read-only checks already run from the PC on
2026-10-23: catalog 100 KB in about 0.2 s, playback authorization about
0.15 s, Mux seek previews 0.6–0.9 s each, deep-link targets valid.

## Before you start (once)

1. Note the Roku's IP: **Settings > Network > About**.
2. Allow PC control: **Settings > System > Advanced system settings >
   Control by mobile apps > Network access: Default** (or Permissive).
3. Start the log on this PC (keep it running for every test):
   `cd D:\protv\tv\roku` then `npm run console -- <Roku IP>`.
   The log is saved to `D:\protv\tv\roku\out\roku-console.log`.
4. For memory (test 5), install PuTTY. Open it with Host `<Roku IP>`,
   Port `8080`, Connection type **Telnet**.

Tell me "pass" or "fail" for each test, and send the log file for any failure.

## 1. Launch time under 15 s (certification 3.2)

1. From the Roku home screen, press Home twice, wait 10 s.
2. Start a phone stopwatch as you press OK on the PROtv tile.
3. Stop it when the PROtv home screen shows posters and responds to the remote.
4. Repeat 3 times. Then restart the Roku (Settings > System > Power > System
   restart) and do it once more (cold start).

- **Pass:** every run is under 15 s. The log shows a line containing
  `AppLaunchComplete` with a duration under 15000 ms.
- **Fail:** any run of 15 s or more, a blank screen, or a stuck "Loading PROtv".
- **Evidence:** the stopwatch times and the `AppLaunchComplete` lines in the log.

## 2. Seek preview thumbnails (certification 4.7)

1. Open **His Girl Friday (1940)** (92 min) and press Play.
2. Press **Right** 5 times quickly, then **Fast Forward** 3 times.
3. Wait 2 s. Press **Left** 3 times. Repeat on one more long movie.

- **Pass:** a picture from the movie appears above the progress bar within
  about 1 s, with the target time (for example 12:30 / 1:32:10), and playback
  jumps there about 1 s after the last press.
- **Fail:** no picture, an empty box, a picture that never updates, or the
  seek not landing.
- **Evidence:** a phone photo of the screen with the thumbnail showing.

## 3. Deep links to movies and episodes (certification 5.1)

Run in PowerShell on this PC, replacing `<IP>`. Each command should play the
title directly (or resume from its saved position).

1. App closed, movie:
   `Invoke-WebRequest -Method Post -Uri "http://<IP>:8060/launch/dev?contentId=LiMNMZWXBxJj3LoP73kU&mediaType=movie"`
2. App closed, episode:
   `Invoke-WebRequest -Method Post -Uri "http://<IP>:8060/launch/dev?contentId=5FHvg3BEwBlk9qqNdZT5&mediaType=episode"`
3. App already open on the home screen, movie:
   `Invoke-WebRequest -Method Post -Uri "http://<IP>:8060/input?contentId=LiMNMZWXBxJj3LoP73kU&mediaType=movie"`
4. App open and playing something else, episode: the same `/input` command
   with the episode ID and `mediaType=episode`.
5. Invalid ID: `.../launch/dev?contentId=not-a-real-title&mediaType=movie`
6. Unsupported type: `.../launch/dev?contentId=LiMNMZWXBxJj3LoP73kU&mediaType=series`

- **Pass:** 1–4 start the right title within 8 s with no extra key presses.
  Back from it returns to its details screen, then Home. 5–6 show the PROtv
  home screen with a short message, and nothing hangs.
- **Fail:** the wrong title, a stuck "Authorizing playback", the app
  closing, or no response.
- **Evidence:** the log (each deep link is visible there) and which step failed.

## 4. Network loss and recovery

Use the router or the PC's mobile hotspot. Do not unplug the Roku.

1. **Before launch:** turn the network off, open PROtv, wait 20 s. Turn the
   network on, then select **Home** in the PROtv menu.
2. **While browsing:** turn the network off, open a title and press Play,
   wait 20 s. Turn the network on and press Play again.
3. **During playback:** play a movie for 1 minute, turn the network off for
   60 s, then back on. Wait 30 s.
4. **Short drop:** play, turn the network off for 10 s, then back on.

- **Pass:** 1 shows "PROtv is unavailable …" within about 15 s and loads
  after Home. 2 shows a "request timed out" message; Play then works.
  3 shows "Loading", then either resumes, or returns to the details screen
  with "This title stopped playing …"; Play resumes near where it stopped.
  4 resumes by itself. The remote always responds.
- **Fail:** a frozen screen, no message after 20 s, controls stuck on screen,
  the app closing, or progress lost.
- **Evidence:** the log, with a note of when the network went off and on.

## 5. Two-hour playback and memory

1. In PuTTY (port 8080) type `chanperf` and press Enter. A line with CPU and
   memory use repeats every few seconds. If it isn't recognized, type `help`
   and send me the list.
2. Play a full feature to the end (for example **His Girl Friday**, 92 min).
   Then browse and play other titles for 30 minutes: open 10 titles, play
   each 1 minute, use OK, Left/Right and Back.
3. Then leave a movie playing for 30 minutes.
4. At the end, in PuTTY type `r2d2_bitmaps` and press Enter.

- **Pass:** no crash or exit for 2 hours. Memory in `chanperf` rises at first
  and then levels off rather than climbing steadily. The progress bar never
  remains after exit. Continue Watching is right at the end.
- **Fail:** the app exits to the Roku home screen, a freeze, steadily rising
  memory, or slowing navigation.
- **Evidence:** save the PuTTY window text (right-click the title bar, then
  Copy All to Clipboard, and paste into a text file) plus the console log.

## 6. Release candidate checks (1.0.0)

1. Cold launch: a blue spinner shows while PROtv loads, then the home screen.
2. Press Play on a title: the spinner shows briefly, then playback starts.
3. Sign out, then Sign in: the spinner shows after you choose Sign in on the
   password keyboard and disappears when "Signed in." appears.
4. Wrong password, and Back on a keyboard: no spinner is left on screen.
5. Repeat the 7 core checks (playback controls clear on exit, Continue
   Watching, resume, sign-in after restart, My List, episodes, remote controls).
6. RC2: open Account > Sign in, and while the email keyboard is showing run
   the movie deep link from store/listing.md (`/input/dev?...`). The keyboard
   closes and His Girl Friday plays; Back works normally afterwards.
7. RC2: signed in, the Account screen says to email support@watchprotv.com to
   delete the account.
8. Options (*) during playback: start any title and press * once. Record
   whether Roku's options overlay appears. RC2 does not give the Video node
   focus during playback, and Roku documents that the overlay then does not
   open (store/captions-investigation.md section 3). Either result is useful;
   no other change is needed for RC2.

## 7. RC4 candidate checks (playback remote and captions)

RC3 TV result (owner, 2026-10-24): * opened Roku's caption settings; OK during
playback showed no controls; turning captions on showed no words (no PROtv
title has a caption track, so that part was expected).

Sideload `dist/releases/protv-roku-v1.0.0-rc4-candidate.zip`, play any title
for at least 10 seconds, wait for the controls to fade, then:

1. OK: the title pauses and the controls appear (Resume highlighted). OK
   again resumes; the controls fade about 3 seconds later.
2. Play/Pause: pauses and resumes the same way.
3. Up or Down: the controls appear without pausing, then fade.
4. Right three times: the time jumps ahead 30 s with a thumbnail; the seek
   happens a moment after the last press. Left goes back. OK during a seek
   lands it without pausing. Rewind / Fast Forward step 30 s. Instant Replay
   jumps back 10 s.
5. * : Roku's caption settings appear. Close them, then press OK: the
   controls still appear (this is the RC3 failure).
6. Back: playback ends on the title's details with Play/Resume focused;
   Left/Right/OK work there.
7. Sign in, play, Back, restart the app: the title is in Continue Watching and
   resumes. Run one movie deep link from store/listing.md.

Captions (sideload `dist/releases/protv-roku-v1.0.0-rc4-caption-test.zip`;
it replaces the dev channel, so re-sideload RC4 afterwards):

8. The channel is titled "PROtv CAPTION TEST". Search for "caption" (it is
   also in All Movies after the creator films, and in a "Test" row) and play
   "TEST ONLY - Caption check (Apple HLS sample)".
9. Press *, set Closed captioning to On: English subtitles appear within a
   few seconds. Set Off: they disappear. If your TV offers On mute / On
   replay, check them too.
10. OK, Back and the other keys behave as in steps 1-6.

Record each result. If step 5's * fails on RC4 but works on RC3, report it:
the fallback is a Captions control on PROtv's overlay
(store/captions-investigation.md).

### RC4 results (owner, 2026-10-24)

Steps 1–7 and 8–9 passed on a physical Roku TV: playback excellent; OK,
Play/Pause, Up/Down, Left/Right seeking, *, OK after the caption settings,
Back, Continue Watching after restart; English subtitles shown in the
caption-test package. Not reported: Rewind/Fast Forward, Instant Replay, the
deep link in step 7, On mute / On replay.

## 8. RC5 candidate checks (about 20 minutes)

RC5 runs the same playback code as RC4. These checks confirm the package
itself before signing. Sideload `dist/releases/protv-roku-v1.0.0-rc5-candidate.zip`.

1. The channel tile and splash say PROtv (not "CAPTION TEST"). Home shows the
   catalog; no "TEST ONLY" title exists (search "caption": no result).
2. Play Tears of Steel: OK pauses and shows the controls; OK resumes; Left /
   Right seek; Instant Replay jumps back 10 s; * opens Roku's caption
   settings; OK works after closing them; Back returns to the details.
3. Rewind / Fast Forward step 30 s with a preview.
4. Signed in: play 2 minutes, Back, restart the app: Continue Watching
   resumes. Sign out from Account; sign in again.
5. Deep links (PC; replace the IP):
   `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=gbcxmtl6mAHQeBxx8Dgs&mediaType=movie"`
   (Tears of Steel plays), then while it plays
   `curl -d "" "http://<TV-IP>:8060/input/dev?contentId=iUX01XuVHd9okFW4gmqR&mediaType=episode"`
   (the Superman episode plays), then a restricted title:
   `curl -d "" "http://<TV-IP>:8060/launch/dev?contentId=vyjpYtuEpOlCWzyzlaxM&mediaType=movie"`
   (Home with "unavailable"; nothing plays).
6. Network: during playback unplug the router for 30 s: spinner, then the
   "stopped playing" message, no crash; reconnect and Play resumes.
7. Back on Home exits the app.
8. Optional, before submission: the 2-hour soak (section 5).

Record each result in RELEASES.md under RC5.

## 6b. RC3 candidate check (superseded: RC3 failed step 1 on the TV; see section 7)

Sideload `dist/releases/protv-roku-v1.0.0-rc3-candidate.zip`, play any title, then:

1. Press **OK**: playback pauses and PROtv's controls appear. Press OK again:
   it resumes. (This is the behavior RC3 could break.)
2. Press **Left** three times: the seek preview moves back 30 s; wait: it seeks.
3. Press **Instant Replay**: it jumps back 10 s.
4. Press **\***: Roku's options overlay slides in (captions, etc.). Press Back
   to close it; playback continues.
5. Press **Back**: playback ends and the details screen shows Resume.

All five pass: use RC3 for submission. Step 1 fails: keep RC2 and report it.
