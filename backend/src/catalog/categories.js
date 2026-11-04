const MAX_CATALOG_CATEGORIES = 8;

function categoryText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}

// Primary genre first, then additional categories. Case-insensitive duplicates are dropped. A request that only
// changes the primary genre keeps the title's other categories, so an edit never silently loses them.
function catalogCategories({ primary, categories, existing = {} }) {
  if (categories !== undefined && (!Array.isArray(categories) || categories.some((item) => typeof item !== 'string'))) {
    throw new Error('Categories must be a list of names.');
  }
  const current = Array.isArray(existing.categories) ? existing.categories : [];
  const previousPrimary = categoryText(existing.category || existing.genre || current[0]);
  const list = categories !== undefined
    ? [categoryText(primary), ...categories.map(categoryText)]
    : [categoryText(primary), ...current.map(categoryText).filter((item) => item.toLowerCase() !== previousPrimary.toLowerCase())];
  const seen = new Set();
  const unique = list.filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
  if (unique.length > MAX_CATALOG_CATEGORIES) throw new Error(`A title can have at most ${MAX_CATALOG_CATEGORIES} categories.`);
  return unique.length ? unique : ['General'];
}

module.exports = { catalogCategories, MAX_CATALOG_CATEGORIES };
