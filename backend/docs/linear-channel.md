# PROtv LIVE — scheduled linear channel

One web channel, `/live`, where viewers watch whatever is scheduled now, like television. It runs 24/7 from the
schedule, using existing Mux on-demand assets with no live encoder, and stays **off** until an Owner or Administrator
launches it from Admin → Programming → PROtv LIVE → Channel.

Code: `backend/src/linear/` (API), `frontend/src/pages/Live.jsx` (viewer), `frontend/src/components/AdminLinearChannel.jsx` (admin).

## How it works

PROtv LIVE is a *virtual* linear channel. It does not use RTMP, Mux live streams or any new encoder. The schedule in
Firestore is the source of truth. For each request the server works out what is airing and how far into it the
channel is, and the player plays that title's existing Mux on-demand asset from that point.

| Concern | Behaviour |
| --- | --- |
| Time | Stored in UTC. Entered and shown in America/New_York. Spring-forward times are refused, and fall-back times must say which occurrence (EDT or EST). |
| Joining | `offsetSeconds` is computed on the server. The client anchors the server clock at the request midpoint, so a wrong device clock or slow network does not move the join point. |
| Staying in sync | Every 5 s the player checks drift. Beyond 8 s it jumps to live. It re-syncs after pause, tab sleep (`visibilitychange`), reconnect (`online`) and every schedule refresh. |
| Advancing | The server returns `refreshAfterMs` (time to the next boundary). Clients re-ask with 0.25–2.5 s of jitter, so a primetime start is spread out. Each program also stops at its scheduled end. |
| Interruptions | Schedule failures retry after 2, 4, 8, 16, then 30 s while the current program keeps playing. Media errors remount the player with backoff, then show "can't play right now" with a Try again button. |
| Seeking | Seek bar, skip and speed controls are hidden and hotkeys are off. A seek more than 3 s from live is undone. Pausing shows "Return to LIVE", and resuming always returns to live. |
| Gaps | An "Up next" card and "Off air" rows in the guide. Nothing unscheduled or uncleared ever fills a gap. |
| Unattended viewing | After 3 hours with no input the player stops and asks "Are you still watching?". The player is removed, so no Mux delivery continues to an empty room. Off-air cards and breaks load no video at all. |

Verified in headless Chrome against real Mux assets (isolated harness, no production writes):
- join point within 1.5 s of the schedule
- two viewers within 0.7 s of each other
- a +600 s seek attempt snapped back to within 0.1 s of live
- pause → Return to LIVE → back at live
- program → break → next program, joined at the correct point

## What can air (fail-closed)

An entry airs only if **all** of these are true *at that moment* (checked on every request, not only at approval):

1. It was approved by an Administrator. Drafts never air, and editing an entry returns it to draft.
2. The title is a movie or TV episode that is playable on demand right now: approved, processed, released, with a
   playback ID. This is the same rule the catalog uses (`isViewerEligible` + `releaseAllowed`).
3. Linear rights are **confirmed** in `linearRights` and not expired. On-demand approval, Roku clearance and Fire TV
   clearance do not count.

If any of these stops being true (rights withdrawn, title unpublished), the program comes off the air immediately and
leaves the guide.

### Premieres

PROtv LIVE never releases anything and never changes a release time. A premiere slot:
- cannot start before an approved `releaseAt` (admin-scheduled releases)
- for Creator Portal episodes (held privately, with no playback ID until the Creator Portal releases them), needs the
  Administrator to acknowledge "not released yet" when approving

Before release, viewers see only the series name and "New episode", with no episode title, synopsis or artwork, plus a
"Premiere starting shortly" card. Clients re-check every 15 s. Once the Creator Portal releases the episode, viewers
join it at the scheduled position.

### Linear rights

Admin → PROtv LIVE → Linear rights lists every movie and episode with its on-demand evidence (copyright basis, rights
holder, creator agreement, evidence tier, recommended territory).

Record a decision per title, or per series (covers its episodes unless an episode has its own decision). Each decision
requires:
- the evidence wording (at least 20 characters)
- optionally an agreement reference, territory and end date

Every decision is written to `adminAudit`.

**State on 2026-11-12:** no linear-rights decision is recorded, so nothing can air yet.

### Creator agreement review (2026-11-12)

`backend/src/linear/agreementReview.js` records what each agreement shows. Findings pre-fill the Record decision form;
they never record a decision.

| Title | Agreement | Finding |
| --- | --- | --- |
| A Long Time Coming | Signed STD6040-v1 (3e9c05e3…) | §2.1 streams "the Film to viewers through the PROtv Services" (Schedule 2: watchprotv.com and PROtv apps), with no on-demand-only limit. §5.1 allows ads during the Film at natural breaks. §2.2 forbids cutting it, so air it complete. Worldwide, 24 months. **Supports linear; Owner confirms.** |
| The Thirst, Dead Air (replacement agreements); The Lost Camp, UNITED NATIONS, It's a Double Date a Classic, CAESAR III JUDGEMENT, Curtain Call (Schedule B); ARÍỌRÍ (Schedule D) | Signed in the Creator Portal | Signed wording is held in the production Creator Portal and was not available to review. Roku clearance shows where a title may stream, not whether a scheduled channel is allowed. **Unverified: read each signed Schedule.** |
| Public-domain and CC BY titles | No licensor agreement | Same basis as on demand; CC BY needs the credit shown. **Owner decision on the existing evidence.** |

A slot that airs only part of a creator film needs acknowledgement, because creator agreements forbid cutting the film.

## Primetime lineup

The default lineup is stored in channel settings and can be edited in Admin:

| Day | Time | Series |
| --- | --- | --- |
| Tuesday | 8 PM ET | Dreadheads |
| Wednesday | 8 PM ET | Mr. Ceasefire |
| Thursday | 8 PM ET | Ironborn |
| Friday | 8 PM ET | Sidepiece |

"Draft this week" fills each slot with that series' next unscheduled episode as a **draft**, or explains why it
cannot:
- no episodes in the catalog
- linear rights not confirmed
- episode not ready
- no recorded duration
- already scheduled
- slot in the past

Series names must match the catalog exactly. Similar names are pointed out but never substituted.

**Catalog on 2026-11-12:** none of the four series has an episode in PROtv. "Dread Head" exists only as a Coming
Soon series record with no video and no contract reference.

## Building a 24/7 schedule

- **Coverage:** each day in the Schedule tab shows hours on air and hours of gap. Only approved slots that will actually
  play count as on air (`GET /admin/linear/coverage?weekOf=`). Each gap has "Fill this gap".
- **Title picker:** shows only released titles with confirmed linear rights by default.
- **Repeat this week:** copies the week's approved entries to the next 1–4 weeks at the same Eastern wall-clock times.
  - "Check for conflicts" previews; "Repeat and approve" writes.
  - Each copy is re-checked at its new time (linear rights including expiry, release status, overlaps). Failures are
    listed and left as gaps.
  - Drafts are not copied, premieres repeat as reruns, and primetime lineup slots stay open for new episodes (optional).
  - Times that do not exist on the target day (spring forward) are skipped. Repeated fall-back times use the first
    occurrence.
  - Re-running is safe: existing copies are reported as conflicts, never duplicated.

## Commercials (not active)

Commercial breaks are schedule entries (15 s – 10 min) and show a PROtv card. Mid-program breaks are made by
splitting a title into segments with "Start the video at".

No ad is requested, served or counted on PROtv LIVE, and nothing is written to the ad measurement collections. The
channel settings hold planned limits (`adPolicy`: break minutes per hour, breaks per program hour, viewer frequency cap)
for a future ad decision service; `adPolicy.insertion` is always `not-active`.

To activate commercials later:
1. Fill break entries from an ad decision service (for example Google IMA with VMAP, or server-side insertion).
2. Reuse `frontend/src/ads/adMeasurement.js` for served and viewable impressions.
3. Enforce `adPolicy`.

## Analytics (separate from on-demand views)

`POST /v1/linear/events` records the following. Administrators and the Owner are excluded; Do Not Track is honoured.

| Event | Meaning | Limit |
| --- | --- | --- |
| `tune_in` | A visit opened the channel | Once per visit; counts a daily unique viewer by pseudonymous guest ID |
| `video_start` | The player actually started a program | Once per visit per program |
| `heartbeat` | Seconds really played, sent every minute | Credited at most 60 s and never more than server-measured elapsed time |
| `error` | `media`, `network`, `schedule`, … | 20 per visit |

Counters are sharded (10 shards) in:
- `linearChannelDailyMetrics` (by Eastern date)
- `linearProgramMetrics` (by schedule entry)

Session and dedup documents carry `expiresAt` (7 days). Apply a Firestore TTL policy on `expiresAt` for
`linearChannelSessions` and `linearChannelEventKeys`, as for the playback-tracking collections.

Requests are rate-limited with the playback limiter (`PLAYBACK_TRACKING_SECRET` required). Nothing touches
`playbackTitleMetrics`.

## API (shared by web and, later, Roku and Fire TV)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/linear/status` | `{ public }`; CDN-cached 60 s; drives the header's LIVE link. |
| GET | `/v1/linear/channel` | `404` while off. `?preview=1` with an Administrator token works while off. Returns `serverTimeMs`, `now` (with `playback.muxPlaybackId`, `offsetSeconds`, `sourceStartSeconds`, `sourceEndSeconds` and `playbackToken` for signed titles), `next`, a 24-hour `guide` and `refreshAfterMs`. Only the program on air ever carries playback details. |
| POST | `/v1/linear/events` | Analytics, as above. |
| * | `/admin/linear/...` | `settings`, `schedule` (create, edit, approve, withdraw, delete, `repeat`), `coverage`, `programs`, `rights`, `primetime/draft`, `analytics`. Administrator only, audited. |

**Device apps:** a Roku or Fire TV client follows the same steps as the web player:
1. Fetch the channel.
2. Start at `offsetSeconds + (elapsed since the response)`.
3. Hide seek controls.
4. Re-fetch after `refreshAfterMs`.

No device app has been changed. Each needs its own playback, seek-lock and drift verification on hardware before
release.

## Firestore

| Collection | Contents |
| --- | --- |
| `linearChannels/protv-live` | Settings (status, name, primetime lineup, `adPolicy`, launch audit). Every schedule write bumps `scheduleVersion` inside the same transaction, so overlap checks cannot be raced. |
| `linearChannels/protv-live/schedule/{id}` | Entries. Indexes are single-field (`startAt`, `videoId`), which Firestore creates automatically. |
| `linearRights/{title_<id>\|series_<key>}` | Linear-rights decisions. |

All of these are server-only (`firestore.rules` denies clients).

## Costs (incremental, monthly; list prices checked 2026-11-12 on mux.com/pricing)

Running the channel 24/7 costs nothing by itself. Costs scale only with actual viewing.

- **Mux delivery:** $0.001 per minute delivered after the account's 100,000 free minutes a month, which are shared
  with on-demand. That is **$0.06 per viewer-hour**. There is no new encoding, storage, live stream or duplicate
  asset: the schedule only references existing assets. Off-air cards and breaks load no video, and unattended players
  stop after 3 hours.
- **Firestore:** about 4 reads and 5 writes per viewer-minute (heartbeat analytics and rate limits), which is about
  **$0.40 per 1,000 viewer-hours**. Schedule reads are cached for 30 s per server instance: about 150 reads per
  refresh, at most about $5 a month per continuously busy instance, and $0 when nobody is watching.
- **Vercel:** about 2 function calls per viewer-minute (heartbeat plus schedule refresh). That is about 120,000 calls
  per 1,000 viewer-hours, within the plan's included invocations at this scale.
- **Mux Data:** included with Mux Video. Channel views are tagged `custom_1 = protv-live`.

| Monthly viewing | Mux delivery | Firestore + Vercel | Total incremental |
| --- | --- | --- | --- |
| None (channel on, nobody watching) | $0 | $0 | **$0** |
| 1,000 viewer-hours (60,000 min) | $0–$60 (depends on on-demand use of the free 100k) | ~$1–$5 | **~$1–$65** |
| 10,000 viewer-hours (600,000 min) | ~$500–$600 | ~$5–$10 | **~$505–$610** |

For comparison, a continuous live encoder bills every minute of every day whether or not anyone watches, before any
delivery.

## Deployment

The code deploys with the normal website release; nothing turns the channel on.
- `linearChannels/protv-live` does not exist in production, so the channel reads as **off**: `/live` shows "coming
  soon", there is no header link, and `/v1/linear/channel` returns 404.
- Production already has `PLAYBACK_TRACKING_SECRET`, `MUX_SIGNING_KEY_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON`.
- No new indexes are needed.
- After deploying, add Firestore TTL policies on `expiresAt` for `linearChannelSessions` and `linearChannelEventKeys`.

## Launch checklist

1. Record linear-rights decisions for the titles you intend to air. A Long Time Coming is pre-filled; the other
   creator titles need their signed Schedules read.
2. Add the primetime episodes (Dreadheads, Mr. Ceasefire, Ironborn, Sidepiece) to the catalog through the Creator
   Portal (they are missing today), then draft and approve each week's primetime.
3. Build one week with approved, cleared titles until the coverage shows no gaps (or accept gaps), then "Repeat this
   week" for up to 4 weeks at a time.
4. Check `/live?preview=1` while signed in as an Administrator.
5. Channel tab: type `LAUNCH PROtv LIVE`. The LIVE link appears in the website header within about a minute.
6. To stop: Channel tab → Take the channel off the air (immediate).
