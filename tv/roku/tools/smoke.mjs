import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { root } from './package.mjs';

// Only public GETs. Never request credentials, write APIs or media segments.
const base = 'https://watchprotv.com/api';
const receipt = { checkedAt: new Date().toISOString(), requests: [], notes: [], deviceTested: false };
async function get(route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${route}: HTTP ${response.status}`);
  receipt.requests.push({ route, status: response.status });
  return response.json();
}
await mkdir(path.join(root, 'out'), { recursive: true });
const catalog = await get('/v1/catalog?view=all');
assert.ok(Array.isArray(catalog.items));
const ids = new Set(catalog.items.map(item => item.id));
assert.equal(ids.size, catalog.items.length);
const approved = catalog.items.filter(item => /\/approved-posters\/owner32-20261021\//.test(item.posterUrl || ''));
assert.equal(approved.length, 32, 'expected the 32 approved rollout poster URLs');
for (const item of approved) {
  assert.ok(item.posterUrl.includes(`/${item.id}/`), `approved poster ID mismatch: ${item.id}`);
  assert.match(item.posterUrl, /\/[a-f0-9]{64}\.(png|jpg)$/);
}
for (const id of ['MZ6Q6DI2S62pP8laH9Ku', 'XMj306OZSbomES2Zz0Fz']) assert.ok(ids.has(id));
const black = catalog.items.filter(item => item.category === 'Black Cinema');
assert.ok(black.length > 0);
const labels = item => [item.category, item.subgenre, ...(item.genres || [])].map(value => String(value || '').trim().toLowerCase());
const aiCinema = catalog.items.filter(item => item.contentType === 'MOVIE' && labels(item).includes('ai cinema'));
const aiCinemaCategory = aiCinema.filter(item => String(item.category || '').trim().toLowerCase() === 'ai cinema').length;
assert.ok(aiCinema.length > 0, 'live AI Cinema titles');
const search = await get('/v1/catalog?view=movies&q=black%20cinema');
assert.ok(search.items.length > 0);
assert.ok(search.items.every(item => item.contentType === 'MOVIE'));
const sample = approved.find(item => item.id === 'sCWQqVE5WIoNNN5wAGQ2') || approved[0];
assert.equal((await get(`/v1/catalog/titles/${encodeURIComponent(sample.id)}`)).id, sample.id);
const playback = await get(`/v1/catalog/titles/${encodeURIComponent(sample.id)}/playback`);
assert.equal(playback.id, sample.id);
assert.equal(playback.streamType, 'on-demand');
assert.match(playback.muxPlaybackId, /^[A-Za-z0-9]+$/);
if (sample.muxPlaybackPolicy === 'signed') assert.ok(playback.playbackToken);

// Execute the shipped BrightScript rules on the full live response, not a JS reimplementation.
const fixture = path.join(root, 'out', 'catalog-smoke.json');
const runner = path.join(root, 'out', 'catalog-smoke.brs');
try {
  await writeFile(fixture, JSON.stringify(catalog));
  await writeFile(runner, `sub Main()
    payload = ParseJson(ReadAsciiFile("pkg:/out/catalog-smoke.json"))
    result = NormalizeCatalog(payload)
    if result.error <> "" then stop
    if result.items.Count() <> ${catalog.items.length} then stop
    approvedCount = 0
    heldCount = 0
    for each item in result.items
        if HeldArtwork(item.id)
            if item.artwork <> "" then stop
            heldCount++
        else if Instr(1, Text(item.posterUrl), "/approved-posters/owner32-20261021/") > 0
            if item.artwork <> item.posterUrl then stop
            approvedCount++
        end if
    end for
    if approvedCount <> 32 or heldCount <> 2 then stop
    if HomeRows(result.items).Count() < 3 then stop
    ' Every live AI Cinema movie reaches the AI Cinema view and its Home row.
    aiCount = 0
    for each row in ViewRows(result.items, "aicinema")
        aiCount = aiCount + row.items.Count()
    end for
    if aiCount <> ${aiCinema.length} then stop
    homeAi = 0
    for each row in HomeRows(result.items)
        if row.title = "AI Cinema" then homeAi = row.items.Count()
    end for
    if ${aiCinemaCategory} > 0 and homeAi <> ${aiCinemaCategory} then stop
    ' Every live series groups into real seasons; no episode is lost.
    episodeTotal = 0
    for each show in SeriesList(result.items)
        listed = 0
        for each season in SeriesSeasons(show.episodes)
            listed = listed + season.episodes.Count()
        end for
        if listed <> show.episodes.Count() then stop
        episodeTotal = episodeTotal + listed
        print "LIVE_SERIES "; show.title; " | "; SeriesMeta(SeriesSeasons(show.episodes), show.episodes.Count())
    end for
    if episodeTotal <> ${catalog.items.filter(item => item.contentType === 'EPISODE').length} then stop
    print "LIVE_BRS_CONTRACT_PASS"
end sub
`);
  const output = execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'brs', 'bin', 'cli.js'), '-r', root,
    path.join(root, 'source', 'model.brs'), runner,
  ], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.match(output, /LIVE_BRS_CONTRACT_PASS/);
  receipt.series = [...output.matchAll(/LIVE_SERIES (.+)/g)].map(match => match[1].trim());
} finally {
  await unlink(fixture);
  await unlink(runner);
}

// One bounded master playlist GET verifies HLS availability, not decoding/playback.
// Same URL rule as PlaybackUrl: public streams request Roku trick-play thumbnails.
const stream = new URL(`https://stream.mux.com/${playback.muxPlaybackId}.m3u8`);
if (playback.playbackToken) stream.searchParams.set('token', playback.playbackToken);
else stream.searchParams.set('roku_trick_play', 'true');
const hls = await fetch(stream, { signal: AbortSignal.timeout(20000) });
assert.equal(hls.status, 200);
const master = await hls.text();
assert.match(master, /^#EXTM3U/);
const trickPlay = /#EXT-X-IMAGE-STREAM-INF/.test(master);
if (!playback.playbackToken) assert.ok(trickPlay, 'Mux returned the Roku trick-play image playlist');
receipt.catalog = {
  total: catalog.items.length,
  movies: catalog.items.filter(item => item.contentType === 'MOVIE').length,
  episodes: catalog.items.filter(item => item.contentType === 'EPISODE').length,
  approvedPosters: approved.length,
  blackCinema: black.length,
  aiCinema: aiCinema.map(item => item.title),
  signedTitles: catalog.items.filter(item => item.muxPlaybackPolicy === 'signed').length,
};
receipt.playback = { titleId: sample.id, authorization: 'passed', masterPlaylist: hls.status, rokuTrickPlay: trickPlay, decoded: false };
receipt.notes.push('Full live catalog passed shipped BrightScript normalization; 32 exact approved URLs and both artwork holds verified.');
receipt.notes.push('No image transforms, Firestore access, authentication writes, progress writes, media segments or native Video playback performed.');
const output = path.join(root, 'out', 'live-contract-report.json');
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
console.log(`Receipt: ${output}`);
