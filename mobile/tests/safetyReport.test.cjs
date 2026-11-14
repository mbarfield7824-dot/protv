const assert = require('node:assert/strict');
const test = require('node:test');
const { titleSafetyReportUrl } = require('../.test-build/lib/safetyReport');

test('title reports open the existing safety form with stable content references', () => {
  const url = new URL(titleSafetyReportUrl({
    id: 'creator_123',
    title: 'A Film & a Story',
    contentType: 'MOVIE',
  }));
  assert.equal(url.origin, 'https://watchprotv.com');
  assert.equal(url.pathname, '/report');
  assert.equal(url.searchParams.get('type'), 'content');
  assert.equal(url.searchParams.get('targetId'), 'creator_123');
  assert.equal(url.searchParams.get('targetUrl'), 'https://watchprotv.com/title/creator_123');
  assert.equal(url.searchParams.get('targetDescription'), 'Title: A Film & a Story');
});

test('title report URLs encode identifiers and identify podcast episodes', () => {
  const url = new URL(titleSafetyReportUrl({
    id: 'bad/id',
    title: 'A podcast episode',
    contentType: 'PODCAST_EPISODE',
  }));
  assert.equal(url.searchParams.has('targetId'), false);
  assert.equal(url.searchParams.get('targetUrl'), 'https://watchprotv.com/title/bad%2Fid');
  assert.equal(url.searchParams.get('targetDescription'), 'Podcast Episode: A podcast episode');
});
