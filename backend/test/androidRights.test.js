const assert = require('node:assert/strict');
const test = require('node:test');
const { platformFromRequest, eligibleForPlatform, androidEligible, rokuEligible } = require('../src/catalog/platformEligibility');

const request = (headers) => ({ get: (name) => headers[name.toLowerCase()] });

test('the released Android app is recognised by its React Native User-Agent; nothing else changes platform', () => {
  assert.equal(platformFromRequest(request({ 'user-agent': 'PROtv/1.0.0' })), 'android');
  assert.equal(platformFromRequest(request({ 'user-agent': 'PROtv/1.0.1' })), 'android');
  // An explicit header always wins (iOS, Fire TV, Samsung builds send one).
  assert.equal(platformFromRequest(request({ 'user-agent': 'PROtv/1.0.0', 'x-protv-platform': 'ios' })), 'ios');
  assert.equal(platformFromRequest(request({ 'user-agent': 'Roku/DVP-12.0 (12.0.0.4182-AE)' })), 'roku');
  for (const agent of [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/480.0]',
    'okhttp/4.12.0', 'PROtvBot/1.0', 'Mozilla/5.0 PROtv/1.0.0', '',
  ]) assert.equal(platformFromRequest(request({ 'user-agent': agent })), 'default', agent);
});

test('Android follows the reviewed Roku rule, and androidHold withdraws a title from Android only', () => {
  const cleared = { id: 'hKPU3JNJ4faWLgWE6ZSq' }; // Big Buck Bunny (reviewed device-app evidence)
  const signedCreator = { id: 'creator_episode_x', contentType: 'EPISODE', rokuCleared: true }; // Schedule names TV/PROtv apps
  const podcast = { id: 'BuE5ImA6axvfctqXdAxp', contentType: 'PODCAST_EPISODE' };
  const unreviewed = { id: 'p532d2Aqpb3bC2rvYkQw' }; // never cleared for an app
  const held = { ...signedCreator, id: 'creator_held', androidHold: true };
  const rokuHeld = { ...cleared, id: 'creator_roku_held', rokuCleared: true, rokuHold: true };
  const all = [cleared, signedCreator, podcast, unreviewed, held, rokuHeld];
  assert.deepEqual(eligibleForPlatform(all, 'android').map((video) => video.id), ['hKPU3JNJ4faWLgWE6ZSq', 'creator_episode_x']);
  assert.equal(rokuEligible(held), true, 'androidHold does not affect Roku');
  assert.equal(androidEligible(rokuHeld), false, 'a Roku hold also keeps a title off Android');
  // Website, iOS (no policy yet) and unidentified clients are unchanged.
  assert.equal(eligibleForPlatform(all, 'default').length, all.length);
});
