const assert = require('node:assert/strict');
const test = require('node:test');
const { premiereInput, promotionPremiere } = require('../src/catalog/premiereTime');
const { promotionInput, resolvePromotion } = require('../src/catalog/comingSoonPromotions');

const upcoming = (extra = {}) => ({
  target: { kind: 'upcoming', contentType: 'series' }, title: 'Ironborn', description: '', artworkUrl: '',
  status: 'published', rightsConfirmed: true, ...extra,
});
const at = (iso) => Date.parse(iso);

test('8 PM Eastern is 01:00 UTC the next day in winter (EST) and 00:00 UTC in summer (EDT)', () => {
  assert.equal(premiereInput({ premiereDate: '2026-12-03', premiereTime: '20:00' }).premiereAt, '2026-12-04T01:00:00.000Z');
  assert.equal(premiereInput({ premiereDate: '2027-06-03', premiereTime: '20:00' }).premiereAt, '2027-06-04T00:00:00.000Z');
  // Either side of the March 2027 change (March 14): the wall clock stays 8 PM.
  assert.equal(premiereInput({ premiereDate: '2027-03-13', premiereTime: '20:00' }).premiereAt, '2027-03-14T01:00:00.000Z');
  assert.equal(premiereInput({ premiereDate: '2027-03-14', premiereTime: '20:00' }).premiereAt, '2027-03-15T00:00:00.000Z');
  // Custom times are kept as entered.
  assert.equal(premiereInput({ premiereDate: '2026-12-05', premiereTime: '21:30' }).premiereAt, '2026-12-06T02:30:00.000Z');
});

test('times that do not exist or happen twice on a clock-change day are refused, and bad input is refused', () => {
  assert.throws(() => premiereInput({ premiereDate: '2027-03-14', premiereTime: '02:30' }), /does not exist/);
  assert.throws(() => premiereInput({ premiereDate: '2026-11-01', premiereTime: '01:30' }), /ambiguous/);
  assert.throws(() => premiereInput({ premiereDate: '2026-02-30' }), /valid premiere date/);
  assert.throws(() => premiereInput({ premiereDate: '2026-12-03', premiereTime: '8pm' }), /HH:MM/);
  assert.throws(() => premiereInput({ premiereTime: '20:00' }), /premiere date/);
});

test('TBD stays TBD, and a date without a time is never given one', () => {
  assert.equal(premiereInput({}), null);
  assert.equal(premiereInput({ premiereDate: '', premiereTime: '' }), null);
  const saved = promotionInput(upcoming({ premiereDate: '2026-12-03' }));
  assert.equal(saved.premiereDate, '2026-12-03');
  assert.equal(saved.premiereTime, null);
  const tbd = promotionInput(upcoming({ premiereDate: null, premiereTime: null }));
  assert.deepEqual([tbd.premiereAt, tbd.premiereDate, tbd.premiereTime], [null, null, null]);
});

test('records saved by the earlier form (17:00 UTC) are date-only; other stored instants keep their exact time', () => {
  assert.deepEqual(promotionPremiere({ premiereAt: '2026-12-03T17:00:00.000Z' }),
    { premiereDate: '2026-12-03', premiereTime: null, premiereAt: '2026-12-03T17:00:00.000Z', endsAt: '2026-12-04T05:00:00.000Z' });
  const exact = promotionPremiere({ premiereAt: '2026-12-04T01:00:00.000Z' });
  assert.deepEqual([exact.premiereDate, exact.premiereTime, exact.endsAt], ['2026-12-03', '20:00', '2026-12-04T01:00:00.000Z']);
  assert.equal(promotionPremiere({ premiereAt: null }), null);
});

test('a primetime promotion stays up until 8 PM ET and says so; a date-only one lasts until the day ends', () => {
  const primetime = { ...promotionInput(upcoming({ premiereDate: '2026-12-03', premiereTime: '20:00' })), id: 'iron' };
  const noonEt = at('2026-12-03T17:00:00Z');
  const live = resolvePromotion(primetime, [], [], noonEt);
  assert.equal(live.state, 'live', 'not retired at noon on premiere day');
  assert.equal(live.card.premiereAt, '2026-12-04T01:00:00.000Z');
  assert.equal(live.card.premiereDate, '2026-12-03');
  assert.equal(live.card.premiereTime, '20:00');
  assert.equal(live.card.premiereTimeZone, 'America/New_York');
  assert.equal(resolvePromotion(primetime, [], [], at('2026-12-04T00:59:00Z')).state, 'live');
  assert.equal(resolvePromotion(primetime, [], [], at('2026-12-04T01:00:00Z')).state, 'premiered');

  // The two live records as stored today (noon-ET legacy values) keep showing through the whole premiere day.
  const legacy = { ...upcoming(), id: 'side', premiereAt: '2026-12-04T17:00:00.000Z' };
  const evening = resolvePromotion(legacy, [], [], at('2026-12-05T01:30:00Z'));
  assert.equal(evening.state, 'live');
  assert.equal(evening.card.premiereDate, '2026-12-04');
  assert.equal(evening.card.premiereTime, undefined, 'no invented time');
  assert.equal(resolvePromotion(legacy, [], [], at('2026-12-05T05:00:00Z')).state, 'premiered');
});
