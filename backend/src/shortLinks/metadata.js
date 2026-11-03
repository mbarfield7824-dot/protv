const { browse, playableCatalog, podcastCatalog, seriesCatalog } = require('../catalog/readModel');
const { isFeaturedPodcast } = require('../catalog/podcasts');
const brand = require('../../../shared/brand.json');
const featured = require('../../../shared/featuredPodcast.json');
const { LinkInputError, linkInput } = require('./validation');

async function destinationMetadata(record, loadApproved) {
  // Revalidate stored records too: no database value may become an external redirect.
  linkInput({ slug: record.slug, destination: record.destination, kind: record.kind, active: record.active });
  if (record.destination === featured.path) {
    if (!['podcast', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a Podcast.');
    return { title: featured.title, description: `${featured.tagline} With ${featured.hosts}.`,
      image: '/api/short-links/artwork/mmwf', destination: featured.path };
  }
  if (record.destination === '/creators') {
    if (record.kind !== 'creator') throw new LinkInputError('/creators is a creator recruitment destination.');
    return { title: 'Create with PROtv', description: brand.description, image: '/api/short-links/artwork/brand', destination: '/creators' };
  }
  const videos = await loadApproved();
  const [, route, id] = record.destination.split('/');
  let content;
  if (route === 'title') {
    content = playableCatalog(videos).find(item => item.id === id);
    const expected = content && browse(videos, { view: 'music' }).some(item => item.id === content.id) ? 'music'
      : content?.contentType === 'PODCAST_EPISODE' ? 'podcast'
        : content?.contentType === 'EPISODE' ? 'series' : 'film';
    if (content && ![expected, 'featured', 'creator'].includes(record.kind)) throw new LinkInputError(`This title belongs to ${expected} content.`);
  } else if (route === 'podcasts') {
    content = podcastCatalog(videos).find(item => item.id === id);
    if (content && !['podcast', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a Podcast.');
    if (isFeaturedPodcast(content)) return destinationMetadata({ ...record, destination: featured.path }, loadApproved);
  } else if (route === 'series') {
    content = seriesCatalog(videos).find(item => item.key === id);
    if (content && !['series', 'featured', 'creator'].includes(record.kind)) throw new LinkInputError('This destination is a series.');
  }
  if (!content) throw new LinkInputError('The destination is not currently approved and publicly available.');
  const image = content.artworkUrl || content.artwork || content.heroImageUrl || content.thumbnailUrl || content.posterUrl
    || content.seasons?.[0]?.episodes?.[0]?.thumbnailUrl;
  if (!image) throw new LinkInputError('This destination needs approved public artwork before assigning a share link.');
  let artwork;
  try { artwork = new URL(image, 'https://watchprotv.com'); } catch { throw new LinkInputError('The public artwork URL is invalid.'); }
  if (artwork.protocol !== 'https:' || artwork.username || artwork.password) throw new LinkInputError('Public artwork must use HTTPS without credentials.');
  return { title: content.title, description: content.description || content.title, image: artwork.href, destination: record.destination };
}
module.exports = { destinationMetadata };
