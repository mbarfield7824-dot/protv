class YouTubeDiscoveryService {
  constructor({ apiKey, paginationStore = null }) {
    this.apiKey = apiKey || '';
    this.paginationStore = paginationStore;
    this.name = 'YouTube Creative Commons';
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async discover() {
    if (!this.configured) {
      return { items: [], warning: 'YouTube discovery is disabled until YOUTUBE_API_KEY is configured.' };
    }
    const queries = ['public domain full movie', 'public domain television'];
    const candidates = [];
    for (const query of queries) {
      const stateKey = `youtube:${query}`;
      const saved = await this.paginationStore?.get(stateKey);
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        videoLicense: 'creativeCommon',
        maxResults: '12',
        order: 'date',
        q: query,
        key: this.apiKey,
      });
      if (typeof saved?.pageToken === 'string' && saved.pageToken.length > 0 && saved.pageToken.length <= 2048) {
        params.set('pageToken', saved.pageToken);
      }
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`YouTube search failed (${response.status}).`);
      const payload = await response.json();
      if (this.paginationStore) {
        const pageToken = typeof payload.nextPageToken === 'string'
          && payload.nextPageToken.length <= 2048
          ? payload.nextPageToken
          : null;
        await this.paginationStore.set(stateKey, { pageToken });
      }
      for (const result of payload.items || []) {
        const videoId = result.id?.videoId;
        if (!videoId) continue;
        candidates.push({
          id: `youtube:${videoId}`,
          source: 'youtube',
          sourceLabel: this.name,
          externalId: videoId,
          title: result.snippet?.title || videoId,
          year: null,
          description: result.snippet?.description || 'No description is available.',
          thumbnailUrl: result.snippet?.thumbnails?.medium?.url || '',
          sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          contentKind: query.includes('television') ? 'show' : 'movie',
          licenseEvidence: {
            eligible: false,
            label: 'YouTube Creative Commons means CC BY, not confirmed Public Domain.',
            url: 'https://support.google.com/youtube/answer/2797468',
          },
          ingestionAvailable: false,
          ingestionReason: 'Reference only. Obtain an authorized source file before re-uploading.',
        });
      }
    }
    return { items: candidates };
  }
}

module.exports = { YouTubeDiscoveryService };
