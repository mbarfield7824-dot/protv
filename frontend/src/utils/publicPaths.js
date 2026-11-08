// Public page addresses. A title or show uses its readable address (slug) when the catalog supplies one and
// its internal ID otherwise; the server permanently redirects internal-ID addresses to the readable one.
const segment = (value) => encodeURIComponent(String(value));

export function titlePath(video) {
  return `/title/${segment(video?.slug || video?.id)}`;
}

export function seriesPath(series) {
  return `/series/${segment(series?.slug || series?.key)}`;
}
