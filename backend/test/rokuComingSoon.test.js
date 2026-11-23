// Coming Soon for the Roku app: website promotions resolved against Roku's own eligible titles, promotional only.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { SEED_MIGRATIONS, rokuComingSoon, withPromotions } = require('../src/catalog/comingSoonPromotions');
const { comingSoonCatalog } = require('../src/catalog/details');
const { createCatalogRouter } = require('../src/catalog/router');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { seriesKey } = require('../src/catalog/readModel');

const NOW = Date.parse('2026-11-23T15:00:00Z');
const playable = (extra) => ({ status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'public-id', ...extra });
// 2212: released, Roku-cleared episodes (signed Schedule names TV apps). Dread Head: website Coming Soon, not on Roku.
const ep1 = playable({ id: 'creator_episode_1', contentType: 'EPISODE', title: 'Concrete', seriesTitle: '2212', seasonNumber: 1, episodeNumber: 1, creatorEpisodeId: 'e1', rokuCleared: true });
const ep2 = playable({ id: 'creator_episode_2', contentType: 'EPISODE', title: 'Death Before Dishonor', seriesTitle: '2212', seasonNumber: 1, episodeNumber: 2, creatorEpisodeId: 'e2', rokuCleared: true });
const dread = {
  id: 'coming_soon_dread', contentType: 'SERIES', title: 'Dread Head', seriesTitle: '', comingSoonProjectId: 'dread', status: 'ready',
  approvalStatus: 'approved', visibility: 'public', posterUrl: 'https://watchprotv.com/api/posters/d.jpg',
  trailerStatus: 'ready', trailerPlaybackId: 'dread-trailer', trailerDuration: 90,
};
const records = [ep1, ep2, dread];
const rokuRecords = eligibleForPlatform(records, 'roku');

const episode3 = SEED_MIGRATIONS[0].promotion; // 2212 Episode 3: C-Fluid, relative artwork, no date
const ironborn = {
  id: 'iron', status: 'published', sortOrder: 1, target: { kind: 'upcoming', contentType: 'series' }, title: 'Ironborn',
  description: 'A new series.', artworkUrl: 'https://watchprotv.com/api/posters/title-iron.jpg',
  premiereDate: '2026-12-03', premiereTime: '20:00', premiereAt: '2026-12-04T01:00:00.000Z',
};
const sidePeace = {
  id: 'side', status: 'published', sortOrder: 2, target: { kind: 'upcoming', contentType: 'series' }, title: 'Side Peace',
  artworkUrl: 'https://watchprotv.com/api/posters/title-side.jpg', premiereDate: '2026-12-04', premiereAt: '2026-12-04T17:00:00.000Z',
};
const westside = {
  id: 'west', status: 'published', sortOrder: 3, target: { kind: 'upcoming', contentType: 'series' }, title: 'Westside High',
  artworkUrl: 'https://watchprotv.com/api/posters/title-west.jpg', trailer: { source: 'upload', status: 'ready', playbackId: 'west-trailer', duration: 60 },
};
const dreadPromo = { id: 'dread', status: 'published', target: { kind: 'series', id: seriesKey('Dread Head') }, title: '', artworkUrl: '' };
const hidden = { ...sidePeace, id: 'hidden', status: 'hidden', title: 'Hidden Show' };
const promotions = [episode3, ironborn, sidePeace, westside, dreadPromo, hidden];

test('Roku gets the live promotions for titles Roku may carry and for upcoming productions, never for others', () => {
  const items = rokuComingSoon(comingSoonCatalog(rokuRecords), promotions, rokuRecords, NOW);
  // The website still shows Dread Head (not Roku-cleared); Roku never does, neither its promotion nor its automatic card.
  // Everything else appears in the website's own order (the Administrator's order, then soonest premiere).
  const website = withPromotions(comingSoonCatalog(records), promotions, records, NOW).map((item) => item.title);
  assert.deepEqual(items.map((item) => item.title), website.filter((title) => title !== 'Dread Head'));
  assert.deepEqual(items.map((item) => item.title), ['2212 · Episode 3: C-Fluid', 'Ironborn', 'Side Peace', 'Westside High']);
  assert.ok(website.includes('Dread Head'));
  assert.ok(!JSON.stringify(items).includes('Dread'));
  assert.ok(!JSON.stringify(items).includes('Hidden Show'), 'hidden promotions stay hidden');
});

test('Roku cards are promotional only: absolute HTTPS artwork, Eastern premiere wording, TBD, no links or playback', () => {
  const items = rokuComingSoon(comingSoonCatalog(rokuRecords), promotions, rokuRecords, NOW);
  const byTitle = Object.fromEntries(items.map((item) => [item.title, item]));
  assert.deepEqual(byTitle.Ironborn, {
    id: 'promo-iron', kind: 'upcoming', contentType: 'Series', title: 'Ironborn', description: 'A new series.',
    artwork: 'https://watchprotv.com/api/posters/title-iron.jpg', premiereAt: '2026-12-04T01:00:00.000Z',
    premiereLabel: 'Premieres Thursday, December 3 at 8:00 PM ET', premiereShort: 'Premieres Dec 3', trailerAvailable: false, promotion: true,
  });
  assert.equal(byTitle['Side Peace'].premiereLabel, 'Premieres Friday, December 4', 'a date-only premiere never gets an invented time');
  assert.equal(byTitle['Side Peace'].premiereShort, 'Premieres Dec 4');
  const episode = byTitle['2212 · Episode 3: C-Fluid'];
  assert.equal(episode.artwork, 'https://watchprotv.com/coming-soon/2212-episode-3-c-fluid.jpg', 'site-relative artwork made absolute');
  assert.equal(episode.premiereLabel, 'Premiere Date TBD');
  assert.equal(episode.premiereShort, 'Date TBD');
  assert.equal(episode.premiereAt, undefined);
  for (const item of items) {
    assert.equal(item.href, undefined);
    assert.doesNotMatch(JSON.stringify(item), /muxPlayback|playbackId|public-id|trailer"\s*:\s*\{|west-trailer/);
  }
});

test('a trailer is offered on Roku only when it belongs to a title Roku carries', () => {
  const items = rokuComingSoon(comingSoonCatalog(rokuRecords), promotions, rokuRecords, NOW);
  const westside = items.find((item) => item.title === 'Westside High');
  assert.equal(westside.trailerAvailable, false, 'an upcoming production\'s uploaded trailer has no Roku clearance');
  const websiteWest = withPromotions([], promotions, records, NOW).find((item) => item.title === 'Westside High');
  assert.equal(websiteWest.trailerAvailable, true, 'the website keeps offering it');
  // A promotion for the Roku-cleared 2212 show with a trailer from that show's own episode is offered.
  const withTrailer = { ...episode3, trailer: { source: 'title', titleId: 'creator_episode_1' } };
  const trailered = [{ ...ep1, trailerStatus: 'ready', trailerPlaybackId: 'ep1-trailer' }, ep2];
  const roku = eligibleForPlatform(trailered, 'roku');
  assert.equal(rokuComingSoon([], [withTrailer], roku, NOW)[0].trailerAvailable, true);
});

async function serve(t, router) {
  const app = express();
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return async (headers = {}) => (await fetch(`http://127.0.0.1:${server.address().port}/coming-soon`, { headers })).json();
}

test('only Roku gets the new response; the website and the other apps are unchanged', async (t) => {
  const call = await serve(t, createCatalogRouter({ loadApproved: async () => records, promotionStore: { list: async () => promotions } }));
  const roku = await call({ 'User-Agent': 'Roku/DVP-14.0 (14.0.0.4210-46)' });
  assert.equal(roku.policy, 'roku-coming-soon-v1');
  assert.ok(roku.items.some((item) => item.title === 'Ironborn'));
  const website = await call();
  assert.equal(website.policy, undefined);
  assert.deepEqual(website.items, JSON.parse(JSON.stringify(withPromotions(comingSoonCatalog(records), promotions, records))));
  for (const platform of ['samsung', 'firetv', 'ios']) {
    const other = await call({ 'X-PROtv-Platform': platform });
    assert.equal(other.policy, undefined, platform);
    assert.ok(!JSON.stringify(other.items).includes('Ironborn'), `${platform} keeps the automatic listings only`);
  }
});
