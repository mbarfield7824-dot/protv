const { ALLOWED_CATEGORIES } = require('../adminBot/aiMetadataService');

function normalizeDescription(value) {
  if (typeof value !== 'string' || value.trim().length < 10) {
    throw new Error('The description must contain at least 10 characters.');
  }
  return value.trim().slice(0, 5000);
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1888 || year > new Date().getFullYear() + 1) {
    throw new Error('The release year is invalid.');
  }
  return year;
}

function normalizeRuntime(value) {
  const runtime = Number(value);
  if (!Number.isFinite(runtime) || runtime <= 0 || runtime > 24 * 60 * 60) {
    throw new Error('Runtime must be between 1 second and 24 hours.');
  }
  return Math.round(runtime);
}

function normalizeCategory(value) {
  if (typeof value !== 'string') throw new Error('A category is required.');
  const category = ALLOWED_CATEGORIES.find(
    (allowed) => allowed.toLowerCase() === value.trim().toLowerCase()
  );
  if (!category) {
    throw new Error(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`);
  }
  return category;
}

function normalizeMetadataUpdates(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Metadata updates are required.');
  }
  const normalized = {};
  if (Object.hasOwn(updates, 'description')) {
    normalized.description = normalizeDescription(updates.description);
  }
  if (Object.hasOwn(updates, 'year')) normalized.year = normalizeYear(updates.year);
  if (Object.hasOwn(updates, 'runtime')) {
    normalized.runtime = normalizeRuntime(updates.runtime);
    normalized.duration = normalized.runtime;
  }
  if (Object.hasOwn(updates, 'category')) {
    const category = normalizeCategory(updates.category);
    normalized.category = category;
    normalized.genre = category;
    normalized.categories = [category];
  }
  if (Object.hasOwn(updates, 'categories')) {
    const categories = updates.categories.map(normalizeCategory);
    normalized.categories = [...new Set(categories)].slice(0, 4);
    normalized.category = normalized.categories[0];
    normalized.genre = normalized.categories[0];
  }
  if (Object.hasOwn(updates, 'tags')) {
    if (!Array.isArray(updates.tags)) throw new Error('Tags must be a list.');
    normalized.tags = [...new Set(
      updates.tags
        .filter((tag) => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )].slice(0, 12);
  }
  if (Object.keys(normalized).length === 0) throw new Error('No supported metadata changes were supplied.');
  return normalized;
}

module.exports = {
  normalizeCategory,
  normalizeDescription,
  normalizeMetadataUpdates,
  normalizeRuntime,
  normalizeYear,
};
