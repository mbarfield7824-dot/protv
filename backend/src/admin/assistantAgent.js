// Bounded, tool-assisted reasoning for the Administrator Assistant.
// With a tool-capable AI provider the model decides which read-only tools to call (max rounds
// and calls are capped). If AI is unavailable or fails, a deterministic intent router runs the
// same tools and says so plainly. Neither path can write to the catalog.
const { detectGenre } = require('../acquisition/genres');
const { humanizeReply } = require('./adminAssistantResponseService');

const MAX_ROUNDS = 5;
const MAX_TOOL_CALLS = 8;
const DEADLINE_MS = 90_000;
const MAX_TOOL_OUTPUT = 14_000;

const SYSTEM_PROMPT = [
  'You are the PROtv Administrator Assistant for a streaming service run by one owner.',
  'You have READ-ONLY research tools. Use them instead of guessing: search_catalog, check_duplicate, search_film_candidates, inspect_acquisition_evidence, check_mux_asset_status, find_catalog_gaps, catalog_health_summary.',
  'For any request to find or recommend films, call search_film_candidates. Never recommend a title without tool evidence, and never name a film PROtv already has: the tool already excludes catalog titles and reports possible duplicates separately.',
  'Report ratings only if a tool returned them. Say plainly when ratings are unavailable. Never invent rights, ratings, runtimes or sources.',
  'Rights classifications are triage, not legal advice: Likely PD, Needs Review, Not Cleared. Explain the basis and mention concerns. The owner always approves before publishing.',
  'PROtv has separate content types: movies, music videos, podcast shows, podcast episodes and Originals. Do not mix them. Film discovery covers films only; for other types use search_catalog with the right contentType.',
  'You cannot change anything. To edit metadata or posters the owner uses an exact phrase such as "update metadata for <title> ..." and then confirms. Never claim to have published, deleted, ingested or edited anything.',
  'If a tool returns an error or fewer results than requested, say so and explain why using the tool notes.',
  'Be concise and specific. Use plain text, short numbered lists for shortlists, no Markdown symbols.',
].join('\n');

function truncate(value) {
  const text = JSON.stringify(value);
  return text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}…[truncated]` : text;
}

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };

function requestedCount(text) {
  const lowered = text.toLowerCase();
  const digits = lowered.match(/\b(\d{1,2})\b(?!\s*(?:th|st|nd|rd|s\b|min))/);
  if (digits) return Number(digits[1]);
  const word = Object.keys(WORD_NUMBERS).find((entry) => new RegExp(`\\b${entry}\\b`).test(lowered));
  return word ? WORD_NUMBERS[word] : null;
}

function detectContentType(text) {
  const lowered = text.toLowerCase();
  if (/\b(podcasts?|episodes?|hosts?)\b/.test(lowered)) {
    return /\bepisodes?\b/.test(lowered) && !/\bshows?\b/.test(lowered) ? 'podcast-episode' : 'podcast';
  }
  if (/\b(music|songs?|artists?|bands?|concerts?|live performance|album)\b/.test(lowered)) return 'music';
  if (/\boriginals?\b/.test(lowered)) return 'original';
  return null;
}

function quotedOrTitle(text) {
  const quoted = text.match(/["“”]([^"“”]{2,120})["“”]/);
  if (quoted) return quoted[1].trim();
  const after = text.match(/\b(?:have|own|got|about|status of|for|is|check)\s+(?:the\s+(?:movie|film|title)\s+)?([A-Z0-9][\w'’:,.&\- ]{1,80}?)(?:\s*\((\d{4})\))?\s*(?:\?|$| already| in )/);
  return after ? after[1].trim() : '';
}

// Resolves "more", "another 5", "what about comedy" using earlier turns.
function inheritFromHistory(history = []) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const genre = detectGenre(history[index].content);
    if (genre) return genre;
  }
  return null;
}

function routeIntent(message, history = []) {
  const text = message.toLowerCase();
  const contentType = detectContentType(message);
  const genre = detectGenre(message);
  const remembered = inheritFromHistory(history);
  const wantsFilms = /\b(find|discover|recommend|suggest|research|look for|get me|show me|give me|any good|need|want|acquire)\b/.test(text)
    && /\b(movies?|films?|titles?|classics?)\b|\b(horror|sci-?fi|noir|western|comedy|comedies|drama|silent|cartoons?|adventure|war)\b/.test(text);
  const asksAboutCatalog = /\bin (the|our) catalog\b|\bdo we (already )?(have|own)\b/.test(text);

  if (/\bcatalog health\b|\bhealth summary\b|\boverview\b|\bhow is the catalog\b|\bsummar(?:y|ize)\b.*\bcatalog\b/.test(text)) {
    return { tool: 'catalog_health_summary', args: {} };
  }
  if (/\bmissing\b.*\b(posters?|metadata|descriptions?|artwork)\b|\b(no|without)\b.*\b(posters?|artwork)\b|\bneeds? (a )?posters?\b/.test(text)) {
    const posters = /posters?|artwork/.test(text);
    const metadata = /metadata|description/.test(text);
    return {
      tool: 'find_catalog_gaps',
      args: { kind: posters && !metadata ? 'posters' : metadata && !posters ? 'metadata' : 'all', contentType: contentType || 'all' },
    };
  }
  if (/\b(broken|won'?t play|not playing|playback|mux|stuck|errored)\b/.test(text)) {
    return { tool: 'check_mux_asset_status', args: { title: quotedOrTitle(message) } };
  }
  if (/\b(rights?|evidence|license|where did .* come from)\b/.test(text) && quotedOrTitle(message)) {
    return { tool: 'inspect_acquisition_evidence', args: { title: quotedOrTitle(message) } };
  }
  if (/\b(do we (already )?(have|own)|already (have|in)|in (the|our) catalog|duplicate)\b/.test(text) && quotedOrTitle(message)) {
    const year = message.match(/\b(18\d{2}|19\d{2}|20[0-4]\d)\b/);
    return { tool: 'check_duplicate', args: { title: quotedOrTitle(message), year: year ? Number(year[1]) : undefined } };
  }
  if (wantsFilms && !asksAboutCatalog && (!contentType || contentType === 'original')) {
    return { tool: 'search_film_candidates', args: { genre: genre || '', limit: requestedCount(message) || 10 } };
  }
  if (!contentType && remembered && history.length
    && /\b(more|another|else|different|next|again|what about|how about|instead)\b/.test(text)) {
    const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant');
    const shown = (String(lastAssistant?.content || '').match(/^\d+\. /gm) || []).length;
    const sameGenre = !genre || genre === remembered;
    return {
      tool: 'search_film_candidates',
      args: { genre: genre || remembered, limit: requestedCount(message) || 10, offset: sameGenre ? shown : 0 },
    };
  }
  if (contentType && wantsFilms) {
    return { tool: 'search_film_candidates', args: { genre: '', limit: 10, contentType: contentType === 'music' ? 'music' : contentType }, unsupportedFirst: true };
  }
  if (contentType || asksAboutCatalog || /\b(search|list)\b.*\b(catalog|library|movies?|films?)\b/.test(text)) {
    const cleaned = message
      .replace(/\b(find|search|list|show|me|all|the|our|my|in|catalog|library|do we have|which|what|any|for)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { tool: 'search_catalog', args: { query: quotedOrTitle(message) || cleaned, contentType: contentType || 'all', limit: 15 } };
  }
  return null;
}

const RIGHTS_LABELS = { 'likely-pd': 'Likely PD', 'needs-review': 'Needs Review', 'not-cleared': 'Not Cleared' };

function label(item) {
  return `${item.title}${item.year ? ` (${item.year})` : ''}`;
}

function formatResult(tool, data) {
  if (data.error) return `The ${tool.replace(/_/g, ' ')} check failed: ${data.error}`;
  if (tool === 'search_film_candidates') {
    if (data.unsupported) return data.reason;
    const lines = [];
    const genreText = data.genre && data.genre !== 'Any' ? `${data.genre.toLowerCase()} ` : '';
    lines.push(`I researched ${genreText}public-domain films on the Internet Archive (${data.examined} examined from ${data.totalMatchedOnInternetArchive.toLocaleString('en-US')} matches) and excluded everything already in PROtv.`);
    if (!data.candidates.length) lines.push('No candidates qualified.');
    data.candidates.forEach((item) => {
      const rating = item.rating?.value ? `, IMDb ${item.rating.value}/10` : '';
      lines.push(`${item.rank}. ${label(item)} - ${item.kind}${item.runtimeMinutes ? `, ${item.runtimeMinutes} min` : ''}${rating}. Score ${item.score}/100. Rights: ${RIGHTS_LABELS[item.rights.classification] || item.rights.classification}. ${item.rights.basis}`);
      if (item.why.length) lines.push(`   Why: ${item.why.slice(0, 3).join('; ')}.`);
      if (item.concerns.length) lines.push(`   Watch: ${item.concerns.slice(0, 2).join(' ')}`);
    });
    if (data.alreadyInCatalogExcluded.length) lines.push(`Skipped because PROtv already has them: ${data.alreadyInCatalogExcluded.slice(0, 8).join(', ')}.`);
    if (data.possibleDuplicatesHeldBack.length) lines.push(`Held back as possible duplicates: ${data.possibleDuplicatesHeldBack.slice(0, 4).join(' | ')}`);
    data.notes.forEach((note) => lines.push(note));
    lines.push('Nothing was added. Use the Public Domain Bot to queue and approve any of these.');
    return lines.join('\n');
  }
  if (tool === 'check_duplicate') {
    return data.status === 'new'
      ? `No match: "${data.checked.title}" is not in the catalog (checked ${data.catalogSize} records including drafts and hidden titles).`
      : `${data.label}: ${data.reasons.join('; ')}`;
  }
  if (tool === 'search_catalog') {
    if (!data.items.length) return 'Nothing in the catalog matched.';
    const head = `Found ${data.matches} match${data.matches === 1 ? '' : 'es'} in the catalog (${Object.entries(data.byType).map(([type, count]) => `${count} ${type}`).join(', ')}):`;
    return [head, ...data.items.map((item) => {
      const extra = item.family === 'podcast-show' ? `, ${item.episodeCount} episode(s)`
        : item.family === 'podcast-episode' ? `, episode ${item.episodeNumber ?? '?'} of ${item.showTitle || 'unknown show'}`
          : item.family === 'music' ? `, ${item.musicFormat || 'format not set'}` : '';
      return `- ${label(item)} [${item.type}${extra}; ${item.approval}/${item.processing}]`;
    })].join('\n');
  }
  if (tool === 'find_catalog_gaps') {
    if (!data.titlesWithGaps) return 'Every checked title has its required poster and metadata.';
    return [`${data.titlesWithGaps} title(s) have gaps (showing ${data.returned}):`, ...data.items.map((item) => `- ${label(item)} [${item.type}]: missing ${item.missing.join(', ')}`), data.rules].join('\n');
  }
  if (tool === 'check_mux_asset_status') {
    if (!data.items.length) return `No matching titles, or no playback problems recorded. ${data.note}`;
    return [data.note, ...data.items.map((item) => `- ${label(item)} [${item.approval}/${item.processing}]: ${item.issues.join(' ') || 'No issues recorded.'}`)].join('\n');
  }
  if (tool === 'inspect_acquisition_evidence') {
    if (data.found === false) return data.message;
    if (data.found === 'discovery-candidate') {
      return `${data.title}${data.year ? ` (${data.year})` : ''} from ${data.source}: ${data.rights.classification}. ${data.rights.basis} ${data.rights.concerns.join(' ')} Source: ${data.sourceUrl}`;
    }
    return `${label(data)} [${data.type}]: rights ${data.rightsClassification || data.copyrightStatus}; evidence: ${data.licenseEvidence || 'none recorded'}; source: ${data.sourceUrl || data.source || 'not recorded'}.`;
  }
  if (tool === 'catalog_health_summary') {
    const parts = [
      `Catalog: ${data.catalogSize} records. By type: ${Object.entries(data.byType).map(([k, v]) => `${v} ${k}`).join(', ')}.`,
      `Approval: ${Object.entries(data.byApproval).map(([k, v]) => `${v} ${k}`).join(', ')}.`,
      `${data.missingPosters} missing poster(s), ${data.missingDescriptions} missing/short description(s), ${data.brokenPlayback} with playback problems.`,
    ];
    if (data.internalDuplicateGroups.length) {
      parts.push(`Possible duplicate records inside the catalog:\n${data.internalDuplicateGroups.map((group) => `- ${group.join(' / ')}`).join('\n')}`);
    }
    return parts.join('\n');
  }
  return truncate(data);
}

class AssistantAgent {
  constructor({ toolkit, responseService }) {
    this.toolkit = toolkit;
    this.responseService = responseService;
  }

  async run({ message, history = [], snapshot }) {
    let aiNotice;
    if (this.responseService?.configured && typeof this.responseService.complete === 'function') {
      try {
        return await this.runWithModel({ message, history, snapshot });
      } catch (error) {
        aiNotice = `The AI research step failed (${String(error.message).slice(0, 160)}), so I ran the catalog tools directly instead.`;
      }
    } else {
      aiNotice = 'The AI provider is not configured, so I ran the catalog tools directly instead of reasoning with a model.';
    }
    return this.runDeterministic({ message, history, aiNotice });
  }

  async runDeterministic({ message, history, aiNotice }) {
    const intent = routeIntent(message, history);
    if (!intent) return { handled: false, aiNotice };
    let data = await this.toolkit.run(intent.tool, intent.args);
    let text = formatResult(intent.tool, data);
    if (intent.unsupportedFirst) {
      const catalog = await this.toolkit.run('search_catalog', {
        query: '', contentType: intent.args.contentType === 'music' ? 'music' : intent.args.contentType, limit: 10,
      });
      text = `${data.reason}\nHere is what PROtv already has in that category:\n${formatResult('search_catalog', catalog)}`;
      data = catalog;
    }
    return {
      handled: true,
      mode: 'deterministic',
      reply: humanizeReply(`${aiNotice}\n\n${text}`),
      tools: [{ name: intent.tool, args: intent.args, ok: !data.error }],
    };
  }

  async runWithModel({ message, history, snapshot }) {
    const started = Date.now();
    const toolLog = [];
    const context = JSON.stringify({
      catalog: snapshot.catalog,
      discoveryQueue: snapshot.discoveryQueue,
      relevantTitles: (snapshot.relevantTitles || []).slice(0, 5),
    });
    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\nCurrent time: ${snapshot.currentTime}.` },
      ...history,
      { role: 'user', content: `${message}\n\nBackground operational context (not a substitute for tools): ${context}` },
    ];
    const tools = this.toolkit.definitions();
    let calls = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (Date.now() - started > DEADLINE_MS) throw new Error('research timed out');
      const allowTools = calls < MAX_TOOL_CALLS && round < MAX_ROUNDS - 1;
      const assistant = await this.responseService.complete({ messages, tools: allowTools ? tools : undefined });
      if (!assistant.tool_calls?.length) {
        const reply = typeof assistant.content === 'string' ? assistant.content.trim() : '';
        if (!reply) throw new Error('the model returned an empty answer');
        return { handled: true, mode: 'ai-tools', reply: humanizeReply(reply), tools: toolLog };
      }
      messages.push({ role: 'assistant', content: assistant.content || null, tool_calls: assistant.tool_calls });
      for (const call of assistant.tool_calls) {
        let args = {};
        let output;
        if (calls >= MAX_TOOL_CALLS) {
          output = { error: 'Tool call budget exhausted; answer with the evidence gathered.' };
        } else {
          calls += 1;
          try {
            args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
            output = await this.toolkit.run(call.function?.name, args);
          } catch (error) {
            output = { error: `Invalid tool arguments: ${error.message}` };
          }
          toolLog.push({ name: call.function?.name, args, ok: !output.error });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: truncate(output) });
      }
    }
    throw new Error('the model did not finish within the tool-call limit');
  }
}

module.exports = { AssistantAgent, MAX_ROUNDS, MAX_TOOL_CALLS, formatResult, requestedCount, routeIntent };
