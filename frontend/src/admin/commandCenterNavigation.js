export const ADMIN_GROUPS = [
  { title: 'Overview', items: [
    { mode: 'overview', label: 'Overview', description: 'Your PROtv administration workspace.' },
  ] },
  { title: 'Content', items: [
    { mode: 'file', label: 'Upload Content', modes: ['file', 'url', 'add-content'], description: 'Upload a file, ingest a direct URL, or prepare content with rights.' },
    { mode: 'review-content', label: 'Review Content', description: 'Inspect rights evidence and review catalog approvals.' },
    { mode: 'edit-catalog', label: 'Catalog & Metadata', description: 'Edit existing titles, artwork, formats and episode metadata.' },
    { mode: 'bulk', label: 'Series & Seasons', description: 'Upload a season with per-episode titles and numbering.' },
  ] },
  { title: 'Podcasts', items: [
    { mode: 'podcasts', label: 'Shows & Episodes', description: 'Manage Podcast Shows, Episode drafts and publishing.' },
  ] },
  { title: 'Discovery', items: [
    { mode: 'admin-bot', label: 'Public Domain Discovery', description: 'Review source evidence, discover candidates and manage ingestion.' },
    { mode: 'distributor-ingestion', label: 'Distributor Feed', description: 'Process the configured licensed distributor feed.' },
  ] },
  { title: 'Safety', items: [
    { mode: 'safety-reports', label: 'Safety Reports', description: 'Review private reports and record review notes.' },
  ] },
  { title: 'Tools', items: [
    { mode: 'assistant', label: 'Administrator Assistant', description: 'Ask operational questions and confirm proposed catalog changes.' },
  ] },
];

export function adminDestination(mode) {
  return ADMIN_GROUPS.flatMap((group) => group.items)
    .find((item) => item.mode === mode || item.modes?.includes(mode));
}
