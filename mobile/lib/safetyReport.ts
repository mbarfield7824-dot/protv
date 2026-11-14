import type { CatalogTitle } from '../data/catalog';

const REPORT_ORIGIN = 'https://watchprotv.com';
const TARGET_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;

export function titleSafetyReportUrl(title: Pick<CatalogTitle, 'id' | 'title' | 'contentType'>): string {
  const url = new URL('/report', REPORT_ORIGIN);
  url.searchParams.set('type', 'content');
  if (TARGET_ID_PATTERN.test(title.id)) url.searchParams.set('targetId', title.id);
  url.searchParams.set('targetUrl', new URL(`/title/${encodeURIComponent(title.id)}`, REPORT_ORIGIN).toString());
  url.searchParams.set('targetDescription', `${title.contentType === 'PODCAST_EPISODE' ? 'Podcast Episode' : 'Title'}: ${title.title}`);
  return url.toString();
}
