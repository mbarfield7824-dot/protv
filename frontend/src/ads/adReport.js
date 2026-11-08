// Advertising measurement report: the metrics PROtv reports, what each means, and the sponsor CSV export.
export const RANGES = [7, 30, 90];
export const NOT_APPLICABLE = 'n/a';

export function isoDay(offsetDays) {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}
export const number = (value) => Number(value || 0).toLocaleString();
export function rate(part, whole) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';
}

// Every metric, in reporting order, with what it means. "display" / "video" say where it applies; anything else is
// shown as not applicable rather than as zero.
export const METRICS = [
  { key: 'requests', label: 'Ad requests', note: 'Ads asked for. Never counted as impressions.', display: true, video: true },
  { key: 'served', label: 'Served impressions', note: 'The ad began to render (display) or its first frame played (video).', display: true, video: true },
  { key: 'measurable', label: 'Viewability measured', note: 'Served ads the browser could measure for viewability.', display: true, video: true },
  { key: 'viewable', label: 'Viewable impressions', note: 'At least 50% of pixels on screen in a visible tab for 1 continuous second (display) or 2 continuous seconds of playback (video).', display: true, video: true, rateOf: 'measurable' },
  { key: 'clicks', label: 'Clicks', note: 'At most one per served impression.', display: true, video: true, rateOf: 'served' },
  { key: 'starts', label: 'Video starts', video: true },
  { key: 'firstQuartiles', label: '25% watched', video: true, rateOf: 'starts' },
  { key: 'midpoints', label: '50% watched', video: true, rateOf: 'starts' },
  { key: 'thirdQuartiles', label: '75% watched', video: true, rateOf: 'starts' },
  { key: 'completes', label: 'Video completions', video: true, rateOf: 'starts' },
  { key: 'skips', label: 'Skips', video: true },
  { key: 'errors', label: 'Failures before rendering', note: 'Empty responses, blocked scripts, ad errors and timeouts.', display: true, video: true },
  { key: 'interrupted', label: 'Interrupted after starting', video: true },
];

export const PLACEMENTS = [
  { channel: 'display', placement: 'native_banner', title: 'Sponsored · Adsterra Native Banner', platform: 'Website', config: 'nativeBanner' },
  { channel: 'video', placement: 'preroll', title: 'Video pre-roll · Google IMA (VAST)', platform: 'Website', config: 'videoPreroll' },
];

export function cell(row, metric, channel) {
  if (!metric[channel]) return NOT_APPLICABLE;
  return number(row?.[metric.key]);
}

export function reportCsv(report) {
  const lines = [
    ['PROtv advertising report', `${report.from} to ${report.to} (UTC days)`],
    ['Source', 'PROtv first-party measurement; valid traffic only. Not MRC-accredited. Ad network reports remain the billing source.'],
    ['Excluded', 'Invalid traffic (automated clients, excessive frequency) and test or Administrator activity are excluded from every figure below.'],
    [],
    ['Placement', 'Platform', ...METRICS.map((metric) => metric.label)],
  ];
  for (const placement of PLACEMENTS) {
    const row = report.placements.find((item) => item.channel === placement.channel && item.placement === placement.placement)?.valid;
    lines.push([placement.title, placement.platform, ...METRICS.map((metric) => cell(row, metric, placement.channel))]);
  }
  lines.push(['Roku and Fire TV apps', 'TV', ...METRICS.map(() => 'not measured: no ad placements')]);
  lines.push([]);
  lines.push(['Definitions']);
  for (const metric of METRICS) if (metric.note) lines.push([metric.label, metric.note]);
  return lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

