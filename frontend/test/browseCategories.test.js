import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BROWSE_CATEGORIES, matchesCategory } from '../src/data/browseCategories.js';

test('AI Cinema has a homepage category tile and its own row', () => {
  const aiCinema = BROWSE_CATEGORIES.find((category) => category.id === 'ai-cinema');
  assert.equal(aiCinema?.name, 'AI Cinema');
  assert.ok(matchesCategory({ category: 'AI Cinema' }, aiCinema));
  assert.ok(matchesCategory({ category: 'Drama', genres: ['ai cinema'] }, aiCinema));
  assert.equal(matchesCategory({ category: 'Drama' }, aiCinema), false);
  const home = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
  assert.match(home, /\{ id: 'ai-cinema', title: 'AI Cinema', matches: \['AI Cinema'\] \}/);
});
