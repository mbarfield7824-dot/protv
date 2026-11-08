const { browse } = require('../catalog/readModel');
const { previewContent, contentMetadata, previewEligible } = require('../catalog/socialMetadata');
const { isFeaturedPodcast } = require('../catalog/podcasts');
const brand = require('../../../shared/brand.json');
const featured = require('../../../shared/featuredPodcast.json');
const { LinkInputError, linkInput } = require('./validation');
const { seriesDetails } = require('../catalog/details');
const { publicPathsFor, defaultSlugRegistry } = require('../catalog/slugs');

async function destinationMetadata(record, loadApproved, slugRegistry = defaultSlugRegistry()) {
  // Revalidate stored records too: no database value may become an external redirect.
  linkInput({ slug: record.slug, destination: record.destination, kind: record.kind, active: record.active });
  if (record.destination === featured.path) {
    if (!['podcast', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a Podcast.');
    return { title: featured.title, description: `${featured.tagline} With ${featured.hosts}.`,
      image: '/api/social/artwork/featured', destination: featured.path };
  }
  if (record.destination === '/creators') {
    if (record.kind !== 'creator') throw new LinkInputError('/creators is a creator recruitment destination.');
    return { title: 'Create with PROtv', description: brand.description, image: '/api/social/artwork/brand', destination: '/creators' };
  }
  const approved = await loadApproved();
  const paths = await publicPathsFor(approved, slugRegistry);
  const videos = paths.decorate(approved);
  const [, route, segment] = record.destination.split('/');
  // A destination may name a page by its internal ID or by its readable address.
  const id = route === 'podcasts' ? segment : paths.target(route === 'series' ? 'series' : 'title', segment,
    route === 'series' ? (value) => seriesDetails(videos).some((item) => item.key === value)
      : (value) => videos.some((item) => item.id === value)) || segment;
  let content;
  const kind = route === 'series' ? 'series' : route === 'podcasts' ? 'podcast' : 'title';
  if (route === 'title' || route === 'player') {
    content = previewContent(videos, 'title', id);
    const expected = content && browse(videos.filter(previewEligible), { view: 'music' }).some(item => item.id === content.id) ? 'music'
      : content?.contentType === 'PODCAST_EPISODE' ? 'podcast'
        : content?.contentType === 'EPISODE' ? 'series' : 'film';
    if (content && ![expected, 'featured', 'creator'].includes(record.kind)) throw new LinkInputError(`This title belongs to ${expected} content.`);
  } else if (route === 'podcasts') {
    content = previewContent(videos, 'podcast', id);
    if (content && !['podcast', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a Podcast.');
    if (isFeaturedPodcast(content)) return destinationMetadata({ ...record, destination: featured.path }, loadApproved, slugRegistry);
  } else if (route === 'series') {
    content = previewContent(videos, 'series', id);
    if (content && !['series', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a series.');
  }
  if (!content) throw new LinkInputError('The destination is not currently approved and publicly available.');
  // The page search engines are pointed at: the title or show's one public address (player links included).
  const canonicalPath = kind === 'podcast' ? record.destination
    : `/${kind === 'series' ? 'series' : 'title'}/${encodeURIComponent(paths.segment(kind, id))}`;
  return { ...contentMetadata(content, kind, id), destination: record.destination, canonicalPath };
}
module.exports = { destinationMetadata };
