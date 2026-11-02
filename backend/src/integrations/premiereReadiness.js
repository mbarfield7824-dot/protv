const { db } = require('../firebase');
const { mux } = require('../mux');

const TEST_CLIP = 'https://muxed.s3.amazonaws.com/leds.mp4';
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Proves the release mechanism from production, with production's own credentials, on a free Mux test asset.
// It never touches a catalog record or a real title, and always deletes what it created.
async function checkPremiereReadiness({ client = mux, firestore = db, fetcher = fetch, pauseMs = 3000 } = {}) {
  const checks = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); return Boolean(ok); };
  let assetId = null;
  try {
    check('catalog store is transactional', firestore && typeof firestore.runTransaction === 'function');
    let asset = await client.video.assets.create({ inputs: [{ url: TEST_CLIP }], video_quality: 'basic', test: true, passthrough: 'protv-premiere-readiness' });
    assetId = asset.id;
    check('a new asset has no playback address', !(asset.playback_ids || []).length);
    for (let attempt = 0; attempt < 60 && !['ready', 'errored'].includes(asset.status); attempt += 1) {
      await wait(pauseMs);
      asset = await client.video.assets.retrieve(asset.id);
    }
    check('private processing finishes', asset.status === 'ready', asset.status);
    check('a finished asset still has no playback address', !(asset.playback_ids || []).length);
    if (asset.status !== 'ready') return { ok: false, checks };
    const playback = await client.video.assets.createPlaybackId(asset.id, { policy: 'public' });
    let manifest = 0;
    for (let attempt = 0; attempt < 20 && manifest !== 200; attempt += 1) {
      manifest = (await fetcher(`https://stream.mux.com/${playback.id}.m3u8?check=${Date.now()}`)).status;
      if (manifest !== 200) await wait(pauseMs);
    }
    check('release makes it playable', manifest === 200, manifest);
    const image = await fetcher(`https://image.mux.com/${playback.id}/thumbnail.jpg?width=640&time=1`);
    check('release makes artwork available', image.status === 200 && /image/.test(image.headers.get('content-type') || ''), image.status);
    await client.video.assets.deletePlaybackId(asset.id, playback.id);
    let gone = 200;
    for (let attempt = 0; attempt < 20 && gone === 200; attempt += 1) {
      await wait(pauseMs);
      gone = (await fetcher(`https://stream.mux.com/${playback.id}.m3u8?check=${Date.now()}`)).status;
    }
    check('unpublishing stops playback', gone !== 200, gone);
  } catch (error) {
    check('readiness check ran to the end', false, error instanceof Error ? error.message : 'Unknown error');
  } finally {
    if (assetId) {
      try {
        await client.video.assets.delete(assetId);
        check('test asset was deleted', true);
      } catch {
        check('test asset was deleted', false, 'Mux removes test assets within 24 hours anyway.');
      }
    }
  }
  return { ok: checks.every((item) => item.ok), checks };
}

module.exports = { checkPremiereReadiness };
