const { reserved } = require('../../../shared/shortLinkRoutes.json');
const RESERVED = new Set(reserved);
class LinkInputError extends Error {}
class LinkConflictError extends Error {}

function slugKey(slug) {
  if (typeof slug !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(slug)) {
    throw new LinkInputError('Use 1-64 letters, numbers or hyphens, starting with a letter or number.');
  }
  const key = slug.toLowerCase();
  if (RESERVED.has(key)) throw new LinkInputError('This name is reserved for an existing PROtv route.');
  return key;
}

function linkInput(body) {
  const fields = ['slug', 'destination', 'kind', 'active', 'version'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !fields.includes(key))) throw new LinkInputError('Unsupported short-link fields.');
  slugKey(body.slug);
  if (!['creator', 'film', 'series', 'podcast', 'music', 'featured'].includes(body.kind)) throw new LinkInputError('Select a supported content kind.');
  if (typeof body.active !== 'boolean') throw new LinkInputError('Active must be true or false.');
  if (typeof body.destination !== 'string'
    || !/^\/(?:title\/[A-Za-z0-9_-]+|series\/[A-Za-z0-9_-]+|podcasts\/[A-Za-z0-9_-]+|podcast\/me-and-my-white-friend|creators)$/.test(body.destination)) {
    throw new LinkInputError('Choose a public PROtv title, series, Podcast Show, featured Podcast, or /creators destination. External URLs, queries and fragments are not allowed.');
  }
  return { slug: body.slug, destination: body.destination, kind: body.kind, active: body.active };
}
module.exports = { slugKey, linkInput, RESERVED, LinkInputError, LinkConflictError };
