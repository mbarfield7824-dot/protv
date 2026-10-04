const { isPublicDomainLicense } = require('./posterService');

function boundedContinuation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([key, item]) => (
    /^[A-Za-z][A-Za-z0-9_]*$/.test(key)
    && (typeof item === 'string' || Number.isFinite(item))
    && String(item).length <= 512
  ));
  const size = entries.reduce((length, [key, item]) => length + key.length + String(item).length, 0);
  return entries.length > 0 && size <= 2048
    ? Object.fromEntries(entries.map(([key, item]) => [key, String(item)]))
    : null;
}

function metadataValue(metadata, name) {
  return String(metadata?.[name]?.value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function metadataYear(metadata) {
  const match = metadataValue(metadata, 'DateTimeOriginal').match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function preferredVideoUrl(image) {
  const derivatives = (image.derivatives || [])
    .filter((item) => item.transcodekey && String(item.type || '').startsWith('video/'))
    .sort((left, right) => (
      (Number(right.width || 0) * Number(right.height || 0))
      - (Number(left.width || 0) * Number(left.height || 0))
    ));
  return derivatives[0]?.src || image.url;
}

function candidateFromPage(page) {
  const image = page.videoinfo?.[0] || page.imageinfo?.[0];
  if (!image || !String(image.mime || '').startsWith('video/')) return null;
  const evidence = isPublicDomainLicense(image.extmetadata);
  const fileTitle = String(page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  return {
    id: `wikimedia:${page.pageid}`,
    source: 'wikimedia',
    sourceLabel: 'Wikimedia Commons',
    externalId: String(page.pageid),
    title: metadataValue(image.extmetadata, 'ObjectName') || fileTitle,
    year: metadataYear(image.extmetadata),
    description: metadataValue(image.extmetadata, 'ImageDescription') || 'Review the Commons page for details.',
    thumbnailUrl: image.thumburl || '',
    sourceUrl: image.descriptionurl || '',
    contentKind: 'movie',
    licenseEvidence: {
      eligible: evidence,
      label: metadataValue(image.extmetadata, 'LicenseShortName')
        || metadataValue(image.extmetadata, 'UsageTerms')
        || 'No supported Public Domain marker.',
      url: metadataValue(image.extmetadata, 'LicenseUrl'),
    },
    ingestionAvailable: evidence,
    ingestionReason: evidence ? '' : 'Only Public Domain Mark and CC0 files can be ingested.',
  };
}

class WikimediaVideoService {
  constructor({ paginationStore = null } = {}) {
    this.name = 'Wikimedia Commons';
    this.paginationStore = paginationStore;
  }

  async request(params) {
    const query = new URLSearchParams({
      action: 'query',
      prop: 'videoinfo',
      viprop: 'url|mime|mediatype|extmetadata|size|derivatives',
      viurlwidth: '640',
      format: 'json',
      origin: '*',
      ...params,
    });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, {
      headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Wikimedia Commons search failed (${response.status}).`);
    return response.json();
  }

  async discover() {
    const stateKey = 'wikimedia:discovery';
    const saved = await this.paginationStore?.get(stateKey);
    const continuation = boundedContinuation(saved?.continuation);
    const payload = await this.request({
      generator: 'search',
      gsrsearch: 'filetype:video (film OR movie OR television)',
      gsrnamespace: '6',
      gsrlimit: '30',
      ...(continuation ? continuation : {}),
    });
    if (this.paginationStore) {
      await this.paginationStore.set(stateKey, {
        continuation: boundedContinuation(payload.continue),
      });
    }
    const items = Object.values(payload.query?.pages || {})
      .map(candidateFromPage)
      .filter(Boolean);
    return { items };
  }

  async resolve(pageId, contentKind) {
    if (!/^\d+$/.test(String(pageId))) throw new Error('The Wikimedia page identifier is invalid.');
    const payload = await this.request({ pageids: String(pageId) });
    const page = Object.values(payload.query?.pages || {})[0];
    const candidate = page ? candidateFromPage(page) : null;
    if (!candidate?.licenseEvidence.eligible) {
      throw new Error('Wikimedia no longer reports supported Public Domain evidence for this file.');
    }
    const image = page.videoinfo?.[0] || page.imageinfo?.[0];
    return {
      identifier: candidate.externalId,
      source: 'Wikimedia Commons',
      title: candidate.title,
      year: candidate.year,
      contentKind: contentKind === 'show' ? 'show' : 'movie',
      sourceDescription: candidate.description,
      creator: metadataValue(image.extmetadata, 'Artist'),
      subjects: metadataValue(image.extmetadata, 'Categories').split('|').filter(Boolean).slice(0, 20),
      runtime: null,
      mediaUrl: preferredVideoUrl(image),
      posterUrl: candidate.thumbnailUrl,
      sourceUrl: candidate.sourceUrl,
      licenseEvidence: candidate.licenseEvidence,
      sourceFile: {
        name: page.title.replace(/^File:/i, ''),
        format: image.mime,
        size: Number(image.size || 0),
        sha1: image.sha1 || '',
      },
    };
  }
}

module.exports = { WikimediaVideoService, candidateFromPage, metadataYear, preferredVideoUrl };
