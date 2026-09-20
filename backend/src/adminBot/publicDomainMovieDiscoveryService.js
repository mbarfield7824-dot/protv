function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function field(block, name) {
  const match = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function parseRss(xml) {
  const blocks = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const sourceUrl = field(block, 'link');
    const slug = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop();
    const rawDescription = field(block, 'description');
    return {
      id: `public-domain-movie:${slug}`,
      source: 'public-domain-movie',
      sourceLabel: 'PublicDomainMovie.net',
      externalId: slug,
      title: field(block, 'title') || slug,
      year: null,
      description: rawDescription.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
        || 'Review the source page for details.',
      thumbnailUrl: '',
      sourceUrl,
      contentKind: 'movie',
      licenseEvidence: {
        eligible: false,
        label: 'The site labels this as Public Domain but provides no authoritative structured rights record.',
        url: sourceUrl,
      },
      ingestionAvailable: false,
      ingestionReason: 'Reference only until the title is verified through an authoritative source.',
    };
  });
}

class PublicDomainMovieDiscoveryService {
  constructor() {
    this.name = 'PublicDomainMovie.net';
  }

  async discover() {
    const response = await fetch('https://publicdomainmovie.net/rss.xml', {
      headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`PublicDomainMovie.net feed failed (${response.status}).`);
    return { items: parseRss(await response.text()).slice(0, 30) };
  }
}

module.exports = { PublicDomainMovieDiscoveryService, parseRss };
