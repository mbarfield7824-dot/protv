export function matchesDocumentaryClassification(video) {
  return [video.category, video.subgenre, ...(Array.isArray(video.genres) ? video.genres : [])]
    .some((value) => String(value || '').toLowerCase() === 'documentary');
}
