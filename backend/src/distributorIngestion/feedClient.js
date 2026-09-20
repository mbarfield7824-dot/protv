const { ALLOWED_CATEGORIES } = require('../adminBot/aiMetadataService');

const CATEGORY_ALIASES = new Map([
  ['science fiction', 'Sci-Fi'],
  ['sci fi', 'Sci-Fi'],
  ['spanish', 'Espanol'],
]);

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function httpsUrl(value, field) {
  const raw = requiredString(value, field);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${field} must use HTTPS.`);
  return parsed.toString();
}

function isoDate(value, field) {
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date and time.`);
  return date.toISOString();
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must contain at least one value.`);
  }
  const values = [...new Set(value.map((entry) => requiredString(entry, field)))];
  return values;
}

function normalizeTitle(value) {
  return requiredString(value, 'title')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategories(values) {
  const categories = [];
  for (const value of stringList(values, 'categories')) {
    const exact = ALLOWED_CATEGORIES.find((category) => category.toLowerCase() === value.toLowerCase());
    const alias = CATEGORY_ALIASES.get(value.toLowerCase());
    const normalized = exact || alias;
    if (normalized && !categories.includes(normalized)) categories.push(normalized);
  }
  if (categories.length === 0) {
    throw new Error(`categories must include a supported PROtv category: ${ALLOWED_CATEGORIES.join(', ')}.`);
  }
  return categories.slice(0, 4);
}

function normalizeFeedItem(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`items[${index}] must be an object.`);
  }
  const externalId = requiredString(item.externalId, `items[${index}].externalId`);
  const startAt = isoDate(item.rights?.startAt, `items[${index}].rights.startAt`);
  const endAt = isoDate(item.rights?.endAt, `items[${index}].rights.endAt`);
  if (new Date(endAt) <= new Date(startAt)) {
    throw new Error(`items[${index}].rights.endAt must be after rights.startAt.`);
  }
  const runtime = item.runtimeSeconds;
  if (typeof runtime !== 'number' || !Number.isFinite(runtime) || runtime <= 0) {
    throw new Error(`items[${index}].runtimeSeconds must be greater than zero.`);
  }
  const releaseYear = item.releaseYear === null || item.releaseYear === undefined
    ? null
    : item.releaseYear;
  if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100)) {
    throw new Error(`items[${index}].releaseYear must be a valid year.`);
  }
  return {
    externalId,
    title: normalizeTitle(item.title),
    year: releaseYear,
    description: requiredString(item.description, `items[${index}].description`),
    runtime: Math.round(runtime),
    categories: normalizeCategories(item.categories || item.genres),
    tags: stringList(item.tags, `items[${index}].tags`).slice(0, 12),
    mediaUrl: httpsUrl(item.mediaUrl, `items[${index}].mediaUrl`),
    poster: normalizePoster(item.poster, index),
    rights: {
      holder: requiredString(item.rights?.holder, `items[${index}].rights.holder`),
      licenseType: requiredString(item.rights?.licenseType, `items[${index}].rights.licenseType`),
      startAt,
      endAt,
      territories: stringList(item.rights?.territories, `items[${index}].rights.territories`)
        .map((territory) => territory.toUpperCase()),
      exclusive: requiredBoolean(item.rights?.exclusive, `items[${index}].rights.exclusive`),
      confirmedForStreaming: requiredBoolean(
        item.rights?.confirmedForStreaming,
        `items[${index}].rights.confirmedForStreaming`
      ),
      notes: typeof item.rights?.notes === 'string' ? item.rights.notes.trim() : '',
    },
  };
}

function requiredBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
  return value;
}

function normalizePoster(poster, index) {
  if (poster === null || poster === undefined) return null;
  if (!poster || typeof poster !== 'object' || Array.isArray(poster)) {
    throw new Error(`items[${index}].poster must be an object.`);
  }
  return {
    url: httpsUrl(poster.url, `items[${index}].poster.url`),
    rightsConfirmed: requiredBoolean(
      poster.rightsConfirmed,
      `items[${index}].poster.rightsConfirmed`
    ),
  };
}

function parseDistributorFeed(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The distributor feed must contain a JSON object.');
  }
  if (payload.schemaVersion !== '1.0') {
    throw new Error('Unsupported distributor feed schema. Expected schemaVersion "1.0".');
  }
  const distributor = {
    id: requiredString(payload.distributor?.id, 'distributor.id'),
    name: requiredString(payload.distributor?.name, 'distributor.name'),
  };
  const generatedAt = isoDate(payload.generatedAt, 'generatedAt');
  if (!Array.isArray(payload.items)) throw new Error('items must be an array.');

  const items = [];
  const failures = [];
  const seenIds = new Set();
  payload.items.forEach((item, index) => {
    try {
      const normalized = normalizeFeedItem(item, index);
      if (seenIds.has(normalized.externalId)) {
        throw new Error(`Duplicate externalId "${normalized.externalId}" in the feed.`);
      }
      seenIds.add(normalized.externalId);
      items.push(normalized);
    } catch (error) {
      failures.push({
        title: item?.title || item?.externalId || `Feed item ${index + 1}`,
        externalId: typeof item?.externalId === 'string' ? item.externalId : null,
        message: error.message,
      });
    }
  });
  return { schemaVersion: payload.schemaVersion, generatedAt, distributor, items, failures };
}

class DistributorFeedClient {
  constructor({ feedUrl, bearerToken }) {
    this.feedUrl = httpsUrl(feedUrl, 'DISTRIBUTOR_FEED_URL');
    this.bearerToken = requiredString(bearerToken, 'DISTRIBUTOR_FEED_TOKEN');
  }

  async fetch() {
    const response = await global.fetch(this.feedUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.bearerToken}`,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Distributor feed request failed (${response.status}).`);
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 10 * 1024 * 1024) throw new Error('Distributor feed exceeds 10 MB.');
    const body = await response.text();
    if (body.length > 10 * 1024 * 1024) throw new Error('Distributor feed exceeds 10 MB.');
    try {
      return parseDistributorFeed(JSON.parse(body));
    } catch (error) {
      throw new Error(`Distributor feed validation failed: ${error.message}`);
    }
  }
}

module.exports = {
  DistributorFeedClient,
  normalizeFeedItem,
  normalizeTitle,
  parseDistributorFeed,
};
