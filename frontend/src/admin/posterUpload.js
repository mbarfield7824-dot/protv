// Administrator poster uploads. The backend stores a durable, re-encoded copy
// (max 1000 x 1000) and points posterUrl and thumbnailUrl at it, so posters no
// longer depend on third-party links that can expire.
export const MAX_POSTER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const POSTER_TYPES = ['image/png', 'image/jpeg'];
const MAX_EDGE = 2000;

export function posterUploadProblem(file) {
  if (!file) return 'Choose a poster image.';
  if (!POSTER_TYPES.includes(file.type)) return 'Posters must be PNG or JPEG images.';
  return '';
}

// Large photos are downscaled in the browser so the request stays under the
// server limit; the server still decodes, validates and re-encodes the result.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be prepared for upload.'))),
    'image/jpeg', 0.9,
  ));
}

export async function preparePosterUpload(file, { resize = shrink } = {}) {
  const problem = posterUploadProblem(file);
  if (problem) throw new Error(problem);
  if (file.size <= MAX_POSTER_UPLOAD_BYTES) return file;
  const smaller = await resize(file);
  if (smaller.size > MAX_POSTER_UPLOAD_BYTES) throw new Error('Poster images must be 4 MB or smaller.');
  return smaller;
}

export async function uploadTitlePoster(apiUrl, headers, videoId, file, { fetchImpl = fetch, resize } = {}) {
  const body = await preparePosterUpload(file, { resize });
  const { Authorization } = await headers();
  const res = await fetchImpl(`${apiUrl}/admin/title-posters/${encodeURIComponent(videoId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': body.type, ...(Authorization ? { Authorization } : {}) },
    body,
  });
  const response = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(response.error || 'Unable to upload the poster.');
  return response;
}
