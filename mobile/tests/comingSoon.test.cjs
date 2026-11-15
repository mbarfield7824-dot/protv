const assert = require('node:assert/strict');
const test = require('node:test');
process.env.EXPO_PUBLIC_API_URL = 'https://watchprotv.com/api/';
process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
const api = require('../.test-build/lib/api');
const {
  airingText, nextPremiere, premiereLong, premiereShort, releasedTitleFor, upcomingItems,
} = require('../.test-build/data/comingSoon');

const item = (id, extra = {}) => ({
  id, kind: 'title', title: id, description: '', categories: [], protvOriginal: false, trailerAvailable: false, ...extra,
});
const now = Date.parse('2026-11-09T17:00:00Z');

test('Coming Soon keeps only upcoming entries, soonest first, undated last', () => {
  const list = [
    item('later', { premiereAt: '2026-12-01T01:00:00Z' }),
    item('undated'),
    item('soon', { premiereAt: '2026-11-10T01:00:00Z' }),
    item('past', { premiereAt: '2026-11-09T16:59:00Z' }),
  ];
  assert.deepEqual(upcomingItems(list, [], now).map((entry) => entry.id), ['soon', 'later', 'undated']);
  assert.equal(nextPremiere(list, now), Date.parse('2026-11-10T01:00:00Z'));
});

test('an entry leaves Coming Soon once its title is in the playable catalog', () => {
  const film = item('film-1', { premiereAt: '2026-12-01T01:00:00Z' });
  const show = item('series-x', { kind: 'series', title: 'Dread Head' });
  const episode = { id: 'ep', title: 'Pilot', contentType: 'EPISODE', seriesTitle: 'dread head', seasonNumber: 1, episodeNumber: 1, genres: [] };
  const titles = [{ id: 'film-1', title: 'Film', contentType: 'MOVIE', genres: [] }, episode];
  assert.deepEqual(upcomingItems([film, show], titles, now), []);
  assert.equal(releasedTitleFor(show, titles).id, 'ep');
  assert.equal(releasedTitleFor(film, []), undefined);
});

test('premiere dates are shown in Eastern time, never invented', () => {
  // 01:00 UTC on Nov 10 is 8:00 PM on Nov 9 in New York (EST).
  assert.equal(premiereShort('2026-11-10T01:00:00Z'), 'Premieres Nov 9, 2026');
  assert.equal(premiereLong('2026-11-10T01:00:00Z'), 'Premieres Monday, November 9, 2026 at 8:00 PM ET');
  assert.equal(premiereShort(undefined), 'Premiere date to be announced');
  assert.equal(premiereLong('not a date'), 'Premiere date to be announced');
  assert.equal(airingText({ weekday: 'Friday', time: '20:30' }), 'New episodes Fridays at 8:30 PM ET');
  assert.equal(airingText(undefined), '');
});

test('the Coming Soon response is validated and carries no playback data', async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ items: [
    { id: 'series-a', kind: 'series', title: 'Dread Head', artwork: 'https://watchprotv.com/api/posters/a.jpg', comingSoon: true, protvOriginal: true, trailerAvailable: true, categories: ['Independent', 7] },
    { id: 'film-b', kind: 'title', title: 'B', artwork: 'http://insecure.test/b.jpg', premiereAt: '2026-12-01T01:00:00Z', muxPlaybackId: 'secret' },
    { id: 'film-c', kind: 'title', title: 'Released', comingSoon: false },
    { id: 'bad', kind: 'other', title: 'Nope' },
    { kind: 'title', title: 'No id' },
  ] }));
  try {
    const items = await api.fetchComingSoon();
    assert.deepEqual(items.map((entry) => entry.id), ['series-a', 'film-b']);
    assert.equal(items[0].artwork, 'https://watchprotv.com/api/posters/a.jpg');
    assert.deepEqual(items[0].categories, ['Independent']);
    assert.equal(items[1].artwork, undefined);
    assert.equal('muxPlaybackId' in items[1], false);
  } finally {
    global.fetch = original;
  }
});
