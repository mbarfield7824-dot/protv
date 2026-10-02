import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesDocumentaryClassification } from '../src/utils/documentary.js';

test('Documentary classification matches category, subgenre, or genres', () => {
  assert.equal(matchesDocumentaryClassification({ category: 'Documentary' }), true);
  assert.equal(matchesDocumentaryClassification({ category: 'Music', subgenre: 'Documentary' }), true);
  assert.equal(matchesDocumentaryClassification({
    contentType: 'MUSIC',
    musicFormat: 'music_documentary',
    category: 'Music',
    genres: ['Jazz', 'Documentary'],
  }), true);
  assert.equal(matchesDocumentaryClassification({
    contentType: 'MUSIC',
    musicFormat: 'music_documentary',
    category: 'Music',
    genres: ['Jazz'],
  }), false);
});
