export function readInitialTitle(id, document) {
  const element = document.getElementById('protv-initial-title');
  if (!element) return null;
  try {
    if (element.tagName !== 'SCRIPT' || element.type !== 'application/json') {
      throw new Error('Invalid initial title data element.');
    }
    const title = JSON.parse(element.textContent);
    if (title?.id !== id) return null;
    if (typeof title.title !== 'string' || typeof title.description !== 'string'
      || typeof title.muxPlaybackId !== 'string' || !title.muxPlaybackId.trim()
      || !Array.isArray(title.genres) || title.genres.some((genre) => typeof genre !== 'string')) {
      throw new Error('Invalid initial public title data.');
    }
    return title;
  } catch (error) {
    console.error('Failed to read initial public title:', error);
    return null;
  }
}
