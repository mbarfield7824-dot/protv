const ALLOWED_CATEGORIES = [
  'Comedy',
  'Action',
  'Documentary',
  'Horror',
  'Drama',
  'Sci-Fi',
  'Espanol',
  'International',
  'AI Cinema',
  'Food',
  'Sports',
  'Podcast',
  'Black Cinema',
  'Anime',
  'Music',
  'Cartoons',
];

function fallbackMetadata({ title, year, sourceMetadata = {} }) {
  const evidence = [
    sourceMetadata.description,
    sourceMetadata.creator ? `Creator: ${sourceMetadata.creator}.` : '',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const searchable = [
    title,
    evidence,
    ...(Array.isArray(sourceMetadata.subjects) ? sourceMetadata.subjects : []),
  ].join(' ').toLowerCase();
  const categoryRules = [
    ['Documentary', /\bdocumentary|nonfiction|history|educational\b/],
    ['Cartoons', /\bcartoon|animation|animated\b/],
    ['Music', /\bmusic|concert|performance|hip-hop|r&b|jazz|classical\b/],
    ['Comedy', /\bcomedy|comic\b/],
    ['Horror', /\bhorror|monster|haunted|terror\b/],
    ['Sci-Fi', /\bsci[\s-]?fi|science fiction|space|alien\b/],
    ['Sports', /\bsport|baseball|football|basketball|boxing\b/],
    ['Food', /\bfood|cooking|recipe|culinary\b/],
  ];
  const category = categoryRules.find(([, pattern]) => pattern.test(searchable))?.[0] || 'Drama';
  const sourceTags = Array.isArray(sourceMetadata.subjects)
    ? sourceMetadata.subjects.filter((value) => typeof value === 'string' && value.trim())
    : [];
  const tags = [...new Set([
    ...sourceTags,
    'Public Domain',
    'Classic',
    year ? String(year) : '',
    category,
  ].filter(Boolean))].slice(0, 8);
  return {
    description: evidence || `${title}${year ? ` (${year})` : ''} is presented from verified source metadata for Administrator review.`,
    tags,
    categories: [category],
  };
}

function parseJsonResponse(content) {
  const cleaned = String(content || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The metadata service returned an invalid response.');
  }
  return parsed;
}

class AiMetadataService {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || '';
    this.apiKey = config.apiKey || '';
    this.model = config.model || '';
  }

  get configured() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async enrich({ title, year, runtime, sourceMetadata }) {
    if (!this.configured) {
      return fallbackMetadata({ title, year, runtime, sourceMetadata });
    }
    const prompt = [
      'Prepare plain-language catalog metadata for a movie administrator.',
      'Use only the supplied title, year, runtime, and trusted reference metadata.',
      'Do not invent plot details, creators, awards, ownership, or legal conclusions.',
      'Return one JSON object with description, tags, and categories.',
      'Description must be two or three clear sentences.',
      'Tags must be an array of 4-8 short strings.',
      `Categories must be an array selected only from: ${ALLOWED_CATEGORIES.join(', ')}.`,
      'If evidence is limited, say so in the description rather than guessing.',
      `Evidence: ${JSON.stringify({ title, year, runtime, sourceMetadata })}`,
    ].join('\n');
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You create accurate, concise movie catalog metadata.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`AI metadata request failed (${response.status}): ${responseBody.slice(0, 240)}`);
    }
    const payload = await response.json();
    const result = parseJsonResponse(payload.choices?.[0]?.message?.content);
    const description = typeof result.description === 'string' ? result.description.trim() : '';
    const tags = Array.isArray(result.tags)
      ? result.tags.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()).slice(0, 8)
      : [];
    const categories = Array.isArray(result.categories)
      ? result.categories.filter((value) => ALLOWED_CATEGORIES.includes(value)).slice(0, 4)
      : [];
    if (!description || tags.length === 0 || categories.length === 0) {
      throw new Error('AI metadata was incomplete. Description, tags, and categories are required.');
    }
    return { description, tags, categories };
  }
}

module.exports = { ALLOWED_CATEGORIES, AiMetadataService, fallbackMetadata, parseJsonResponse };
