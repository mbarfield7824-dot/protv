# Roku Streaming Store screenshots (RC6)

**Status, 2026-10-24: none captured.** No screenshot here is a mockup or
was made from the website or Fire TV. The six files must come from the RC6
app running on a Roku.

## Why they were not captured automatically

Found on the local network (read-only checks):

| Address | Device | Developer mode | UI resolution |
| --- | --- | --- | --- |
| 192.168.1.152 | Roku Streaming Stick (Roku OS 15.3.4) | on | 720p |
| 192.168.1.100 | Hisense 6-Series 75" (Roku TV) | off | 1080p |
| 192.168.1.197 | TCL 65S41 (Roku TV) | off | 1080p |

- Sideloading RC6 and using the Screenshot utility need the developer
  password (`rokudev` login). It is not available here and was not guessed.
- The Streaming Stick's UI runs at 720p, so its screenshots would be
  1280x720. Enlarging them would be stretching. Capture on a device whose UI
  runs at 1080p instead (options below).

## Capture at a true 1920x1080 (about 20 minutes)

The PROtv app lays out its screens at 1280x720 (`ui_resolutions=hd`). On a
1080p Roku the Roku OS itself draws the app full screen at 1920x1080, which
is exactly what viewers see. The device produces the image; nothing is
resized afterwards.

**Option A: the Streaming Stick, switched to 1080p.** On the stick go to
Settings > Display type > 1080p HD TV (the TV must accept 1080p). Then
`http://192.168.1.152:8060/query/device-info` should show
`<ui-resolution>1080p</ui-resolution>`.

**Option B: one of the 1080p Roku TVs.** On the Hisense or TCL remote press
Home ×3, Up ×2, Right, Left, Right, Left, Right to enable developer mode,
set a developer password, and note the TV's IP address.

Then:

1. Open `http://<roku-ip>` in a browser and sign in as `rokudev` with your
   developer password. Upload
   `tv/roku/dist/releases/protv-roku-v1.0.0-rc6-candidate.zip` (from
   `D:\protv`) and click **Install**.
2. Capture after the Roku launch catalog is deployed if possible, so only the
   28 launch titles appear (store/ROKU-LAUNCH-CATALOG.md). Until then, keep
   held titles' posters out of frame. Their IDs are in
   store/roku-launch-catalog.json, group C (for example Gulliver's Travels,
   House on Haunted Hill, Woman on the Run, Body and Soul). Also keep the His
   Girl Friday and The Duke Is Tops posters out of frame (real performers).
3. For each screen below, put it on the TV, then on the PC open
   `http://<roku-ip>` > **Utilities** > **Screenshot**, and save the image in
   this folder with the file name shown.

| # | File | Screen | How to reach it in PROtv |
| --- | --- | --- | --- |
| 1 | `01-home.png` | Home: featured title and movie rows | Launch PROtv and wait for the catalog. Move Right on the featured buttons until a launch title is featured (Tears of Steel, Sintel, Big Buck Bunny, Elephants Dream, The Lost Camp, Dead Air) |
| 2 | `02-browse-categories.png` | Browse by category | Left to open the sidebar > **Movies** (category rows), or **Black Cinema** |
| 3 | `03-movie-details.png` | Movie details | OK on Tears of Steel (Play, My List and the synopsis show) |
| 4 | `04-playback.png` | Playback with PROtv's controls | Play Tears of Steel, press **Right** twice so the time and seek preview show, then capture |
| 5 | `05-search.png` | Search | Sidebar > **Search**, type `steel` |
| 6 | `06-my-list.png` | My List | On Tears of Steel's details choose **My List**, then sidebar > **My List** |

4. Check the files: `node verify-screenshots.mjs` in this folder. Every file
   must say `OK … 1920x1080`. A file that reports 1280x720 came from a 720p
   device: recapture it on a 1080p one; do not enlarge it.

**Playback screenshot:** the developer Screenshot utility captures the
graphics layer; on some devices the video picture is not included and shows
as black behind PROtv's controls. That is how Roku captures it, not a
fault. If you want the film frame visible, try capturing on the other 1080p
device. Do not paste a frame in afterwards.
