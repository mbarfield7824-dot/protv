const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

function safeFileName(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'movie';
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function wrapTitleLines(title, maximumCharacters = 20, maximumLines = 6) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current || `${current} ${word}`.length > maximumCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  if (lines.length <= maximumLines) return lines;
  const visible = lines.slice(0, maximumLines);
  visible[maximumLines - 1] = `${visible[maximumLines - 1].slice(0, maximumCharacters - 1).trimEnd()}…`;
  return visible;
}

function isPublicDomainLicense(metadata = {}) {
  const license = String(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || '').toLowerCase();
  return license.includes('public domain') || license.includes('cc0') || license.includes('pdm');
}

class PosterService {
  constructor(config = {}) {
    this.storageDirectory = config.storageDirectory;
    this.publicBaseUrl = config.publicBaseUrl;
    this.imageBaseUrl = config.imageBaseUrl || '';
    this.imageApiKey = config.imageApiKey || '';
    this.imageModel = config.imageModel || '';
  }

  async create(metadata) {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const warnings = [];
    try {
      const commonsPoster = await this.findCommonsPoster(metadata);
      if (commonsPoster) {
        return {
          posterUrl: await this.storeRemoteImage(commonsPoster.url, metadata.title, 'wikimedia'),
          source: 'Wikimedia Commons',
          sourcePage: commonsPoster.descriptionUrl,
          warnings,
        };
      }
    } catch (error) {
      warnings.push(`Public-domain poster search was unavailable: ${error.message}`);
    }

    if (this.imageBaseUrl && this.imageApiKey && this.imageModel) {
      try {
        return {
          posterUrl: await this.generateAiPoster(metadata),
          source: 'AI-generated fallback',
          sourcePage: '',
          warnings,
        };
      } catch (error) {
        warnings.push(`AI poster generation was unavailable: ${error.message}`);
      }
    } else {
      warnings.push('AI poster generation is not configured; a branded local fallback was created.');
    }

    return {
      posterUrl: await this.createLocalFallback(metadata),
      source: 'PROtv fallback poster',
      sourcePage: '',
      warnings,
    };
  }

  async findCommonsPoster({ title, year }) {
    const search = `${title} ${year || ''} film poster`.trim();
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: search,
      gsrnamespace: '6',
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime',
      iiurlwidth: '800',
      format: 'json',
      origin: '*',
    });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}.`);
    const payload = await response.json();
    const pages = Object.values(payload.query?.pages || {});
    for (const page of pages) {
      const image = page.imageinfo?.[0];
      if (!image || !String(image.mime || '').startsWith('image/') || !isPublicDomainLicense(image.extmetadata)) {
        continue;
      }
      const imageUrl = image.thumburl || image.url;
      if (!imageUrl || new URL(imageUrl).hostname !== 'upload.wikimedia.org') continue;
      return {
        url: imageUrl,
        descriptionUrl: image.descriptionurl || '',
      };
    }
    return null;
  }

  async generateAiPoster({ title, year, description, categories }) {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const response = await fetch(`${this.imageBaseUrl.replace(/\/+$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.imageApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.imageModel,
        size: '1024x1536',
        response_format: 'b64_json',
        prompt: [
          'Create an original vertical movie poster with no logos, trademarks, copied artwork, or celebrity likenesses.',
          `Title: ${title}.`,
          year ? `Release year: ${year}.` : '',
          `Description: ${description}.`,
          `Categories: ${categories.join(', ')}.`,
          'Use cinematic typography and a clean composition suitable for a streaming catalog.',
        ].filter(Boolean).join(' '),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Image provider returned ${response.status}: ${body.slice(0, 180)}`);
    }
    const payload = await response.json();
    const image = payload.data?.[0];
    if (image?.b64_json) {
      const fileName = `${safeFileName(title)}-${crypto.randomUUID()}.png`;
      await fs.writeFile(path.join(this.storageDirectory, fileName), Buffer.from(image.b64_json, 'base64'));
      return this.publicUrl(fileName);
    }
    if (image?.url) return this.storeRemoteImage(image.url, title, 'ai');
    throw new Error('The image provider returned no poster.');
  }

  async storeRemoteImage(url, title, source) {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') throw new Error(`${source} poster must use HTTPS.`);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${source} poster download returned ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const normalizedType = contentType.split(';')[0].trim().toLowerCase();
    if (!supportedTypes.has(normalizedType)) {
      throw new Error(`${source} returned an unsupported image format.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) throw new Error(`${source} poster exceeded 15 MB.`);
    const extension = normalizedType === 'image/png' ? '.png' : normalizedType === 'image/webp' ? '.webp' : '.jpg';
    const fileName = `${safeFileName(title)}-${crypto.randomUUID()}${extension}`;
    await fs.writeFile(path.join(this.storageDirectory, fileName), bytes);
    return this.publicUrl(fileName);
  }

  async createLocalFallback({ title, year, categories }) {
    const fileName = `${safeFileName(title)}-${crypto.randomUUID()}.svg`;
    const category = categories[0] || 'Public Domain';
    const titleLines = wrapTitleLines(title);
    const titleFontSize = titleLines.length <= 3 ? 64 : titleLines.length <= 4 ? 56 : 46;
    const titleText = titleLines
      .map((line, index) => (
        `<tspan x="70" dy="${index === 0 ? 0 : Math.round(titleFontSize * 1.15)}">${escapeXml(line)}</tspan>`
      ))
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101b3f"/><stop offset="1" stop-color="#4169e1"/></linearGradient></defs>
<rect width="800" height="1200" fill="url(#bg)"/><circle cx="660" cy="180" r="230" fill="#60a5fa" opacity=".18"/>
<text x="70" y="120" fill="#9fc1ff" font-family="Arial" font-size="30" font-weight="700">PROtv · PUBLIC DOMAIN</text>
<text x="70" y="350" fill="white" font-family="Arial" font-size="${titleFontSize}" font-weight="800">${titleText}</text>
<text x="70" y="940" fill="#dbeafe" font-family="Arial" font-size="34">${escapeXml(category)}</text>
<text x="70" y="1010" fill="#93c5fd" font-family="Arial" font-size="30">${escapeXml(year || 'Classic Cinema')}</text>
</svg>`;
    await fs.writeFile(path.join(this.storageDirectory, fileName), svg, 'utf8');
    return this.publicUrl(fileName);
  }

  publicUrl(fileName) {
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/posters/${encodeURIComponent(fileName)}`;
  }
}

module.exports = { PosterService, isPublicDomainLicense, safeFileName, wrapTitleLines };
