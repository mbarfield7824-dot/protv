const MAX_HISTORY_MESSAGES = 10;

function safeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => (
      entry
      && ['admin', 'assistant'].includes(entry.role)
      && typeof entry.text === 'string'
      && entry.text.trim()
    ))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((entry) => ({
      role: entry.role === 'admin' ? 'user' : 'assistant',
      content: entry.text.trim().slice(0, 4000),
    }));
}

function catalogEvidence(video) {
  return {
    id: video.id,
    title: video.title,
    year: video.year || null,
    runtime: video.runtime || video.duration || null,
    categories: video.categories || [video.category || video.genre].filter(Boolean),
    approvalStatus: video.approvalStatus || 'unknown',
    processingStatus: video.status || 'unknown',
    playbackReady: Boolean(video.muxPlaybackId),
    posterSource: video.posterSource || '',
    copyrightStatus: video.copyrightStatus || 'unknown',
    licenseType: video.licenseType || '',
    rightsHolder: video.rightsHolder || '',
    rightsStartAt: video.rightsStartAt || null,
    rightsEndAt: video.rightsEndAt || null,
    source: video.publicDomainSource || video.distributorName || '',
    sourceUrl: video.publicDomainSourceUrl || '',
  };
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceEvidence(video, candidates, auditEvents) {
  if (video.publicDomainSource || video.distributorName) {
    return {
      source: video.publicDomainSource || video.distributorName,
      sourceUrl: video.publicDomainSourceUrl || '',
    };
  }
  const normalizedTitle = normalizeTitle(video.title);
  const candidate = candidates.find((item) => (
    item.externalId === video.publicDomainSourceId
    || normalizeTitle(item.title) === normalizedTitle
  ));
  if (candidate) {
    return {
      source: candidate.sourceLabel || candidate.source || '',
      sourceUrl: candidate.sourceUrl || '',
    };
  }
  const event = auditEvents.find((item) => (
    item.details?.catalogId === video.id
    || normalizeTitle(item.message).includes(normalizedTitle)
  ));
  return {
    source: event?.details?.source || '',
    sourceUrl: event?.details?.sourceUrl || '',
  };
}

function relevantCatalogItems(message, catalog, contextCatalogId, candidates = [], auditEvents = []) {
  const normalized = message.toLowerCase();
  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  return catalog
    .map((video) => {
      const title = String(video.title || '').toLowerCase();
      const score = (video.id === contextCatalogId ? 100 : 0)
        + (title && normalized.includes(title) ? 50 : 0)
        + words.filter((word) => title.includes(word)).length;
      return { video, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ video }) => ({
      ...catalogEvidence(video),
      ...sourceEvidence(video, candidates, auditEvents),
    }));
}

function humanizeReply(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\bplaybackReady\b/g, 'playback readiness')
    .replace(/\bprocessingStatus\b/g, 'processing status')
    .replace(/\bdiscoveryQueue\b/g, 'discovery queue')
    .replace(/\brelevantTitles\b/g, 'matching catalog titles')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function localTimeDescription(date = new Date(), timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date);
}

function answerVerifiedQuestion({ message, snapshot }) {
  const request = message.toLowerCase();
  const title = snapshot.relevantTitles?.[0];
  const asks = (...terms) => terms.some((term) => request.includes(term));

  if (/\bwhat time\b|\bcurrent time\b|\btime is it\b/.test(request)) {
    return `It’s ${snapshot.currentTime}.`;
  }

  if (asks('contract', 'agreement') && asks('review', 'pending', 'how many', 'count')) {
    return 'I can’t see contract-review data from this PROtv Admin assistant, so I can’t give you a reliable contract count. The pending discovery count is for movies and shows awaiting catalog review, not contracts.';
  }

  if (title && asks('why') && asks('ready')) {
    if (title.playbackReady && title.processingStatus === 'ready') {
      return `It actually is ready. ${title.title} is approved and its public playback is available.`;
    }
  }

  if (title && asks('ready', 'playback', 'watch', 'viewer', 'play')) {
    if (title.playbackReady && title.processingStatus === 'ready') {
      return `${title.title} is ready to watch. It is approved and has a public playback ID.`;
    }
    if (title.processingStatus === 'processing') {
      return `${title.title} is still being prepared by Mux, so it is not ready for viewers yet. Its current approval status is ${title.approvalStatus}.`;
    }
    if (title.processingStatus === 'errored') {
      return `${title.title} is not ready because video processing failed. I don’t have a more specific Mux error in the catalog record, so the next safe check is the Mux asset status and the recent ingestion audit entry.`;
    }
    return `${title.title} is not ready for viewers. Its video status is ${title.processingStatus}, its approval status is ${title.approvalStatus}, and no public playback ID is recorded.`;
  }

  if (title && asks('source', 'come from', 'origin', 'where did')) {
    if (title.source) {
      return `${title.title} came from ${title.source}.${title.sourceUrl ? ` Source page: ${title.sourceUrl}` : ''}`;
    }
    return `I couldn’t find a recorded source for ${title.title}. I checked its catalog record, the discovery queue, and recent Administrator audit history. I don’t want to guess.`;
  }

  if (asks('how many', 'count') && asks('discovery', 'review', 'candidate', 'titles')) {
    const pending = snapshot.discoveryQueue.pending || 0;
    const processing = snapshot.discoveryQueue.processing || 0;
    const failed = snapshot.discoveryQueue.failed || 0;
    return `You have ${pending} discovered title${pending === 1 ? '' : 's'} waiting for review. ${processing} ${processing === 1 ? 'is' : 'are'} processing, and ${failed} need${failed === 1 ? 's' : ''} attention.`;
  }

  return null;
}

class AdminAssistantResponseService {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || '';
    this.apiKey = config.apiKey || '';
    this.model = config.model || '';
  }

  get configured() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async answer({ message, history, snapshot }) {
    const verifiedAnswer = answerVerifiedQuestion({ message, snapshot });
    if (verifiedAnswer) return verifiedAnswer;
    if (!this.configured) {
      throw new Error('The conversational AI provider is not configured.');
    }
    const evidence = {
      currentTime: snapshot.currentTime,
      discoveryQueue: snapshot.discoveryQueue,
      publicDomain: snapshot.publicDomain,
      distributor: snapshot.distributor,
      catalog: snapshot.catalog,
      relevantTitles: snapshot.relevantTitles,
      recentAuditEvents: snapshot.auditEvents.slice(0, 12).map((event) => ({
        type: event.type,
        message: event.message,
        createdAt: event.createdAt,
      })),
      failedCandidates: snapshot.failedCandidates.slice(0, 8).map((candidate) => ({
        title: candidate.title,
        source: candidate.sourceLabel || candidate.source,
        error: candidate.lastError || '',
      })),
      configuration: snapshot.configuration,
      operationalGuide: {
        discoveryQueue: 'Potential movies and shows found by source adapters. These are not contracts.',
        ingestion: 'An Administrator confirms one eligible title, PROtv creates a draft, Mux prepares playback, and publishing occurs only after playback is ready.',
        rights: 'Source rights metadata is evidence for Administrator review, not an automated legal conclusion.',
        safeAssistantChanges: 'The chat can propose metadata and poster corrections, but a separate Administrator confirmation is required.',
        unavailableData: 'Creator contracts and contract-review counts are not connected to this PROtv Admin Assistant.',
      },
    };
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.25,
        messages: [
          {
            role: 'system',
            content: [
              'You are the PROtv Administrator Assistant.',
              'Answer the Administrator’s exact question directly and specifically.',
              'Use only the supplied operational evidence. Never invent status, rights, titles, failures, or configuration.',
              'If the evidence does not answer the question, say what is unavailable and name the next safe check.',
              'Use recent conversation context to resolve follow-up phrases such as "it", "that title", and "why".',
              'Do not repeat a general dashboard summary unless the Administrator asks for an overview.',
              'Prefer a short answer first, then relevant facts or steps.',
              'Write like a capable human coworker: natural, calm, concise, and helpful.',
              'Use plain text only. Do not use Markdown, bold markers, backticks, JSON, internal field names, or an "Evidence" section.',
              'Do not expose raw object keys. Translate technical state into ordinary language.',
              'A discovery candidate is not a contract. Contract counts are unavailable unless contract evidence is explicitly supplied.',
              'If a user’s premise conflicts with current evidence, politely correct the premise.',
              'Explain technical errors in plain language.',
              'Do not claim to publish, delete, ingest, upload, approve, reject, or change content.',
              'Safe catalog edits require the separate structured confirmation flow; do not simulate a completed change.',
              'Do not make legal conclusions. Describe rights metadata as evidence requiring Administrator judgment.',
            ].join('\n'),
          },
          ...safeHistory(history),
          {
            role: 'user',
            content: `Current question:\n${message}\n\nCurrent PROtv evidence:\n${JSON.stringify(evidence)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Conversational AI request failed (${response.status}): ${body.slice(0, 240)}`);
    }
    const payload = await response.json();
    const reply = payload.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error('The conversational AI provider returned an empty answer.');
    }
    return humanizeReply(reply);
  }
}

module.exports = {
  AdminAssistantResponseService,
  answerVerifiedQuestion,
  catalogEvidence,
  humanizeReply,
  localTimeDescription,
  relevantCatalogItems,
  safeHistory,
  sourceEvidence,
};
