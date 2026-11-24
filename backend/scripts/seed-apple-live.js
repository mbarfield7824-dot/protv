require('dotenv').config();
const crypto = require('crypto');
const { db } = require('../src/firebase');
const { appAllows, appPolicy } = require('../src/linear/appPolicy');
const { CHANNEL_ID, knownDuration, linearRightsFor, rightsKeysFor } = require('../src/linear/model');
const { FirestoreLinearStore } = require('../src/linear/store');

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const enabled = (name) => process.argv.includes(name);

async function main() {
  if (!db) throw new Error('Firebase service account credentials are required.');
  const apply = enabled('--apply');
  const replace = enabled('--replace');
  const startMs = Date.parse(arg('--start') || new Date().toISOString());
  const days = Number(arg('--days') || 7);
  if (!Number.isFinite(startMs)) throw new Error('--start must be an ISO date.');
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error('--days must be 1 through 14.');

  const store = new FirestoreLinearStore(db);
  const [catalog, rights, creatives] = await Promise.all([store.listCatalog(), store.listRights(), store.listCreatives()]);
  const apple = appPolicy('ios', { country: 'US', reason: 'admin' });
  const at = new Date(startMs);
  const programs = catalog.filter((video) => (
    video.approvalStatus === 'approved'
      && video.status === 'ready'
      && appAllows(apple, video, startMs)
      && linearRightsFor(video, rights, startMs).status === 'confirmed'
      && knownDuration(video) > 0
  )).sort((left, right) => {
    const priority = ['creator_613e215e-709f-48ee-91bb-b225d8da4a33'];
    const leftRank = priority.indexOf(left.id);
    const rightRank = priority.indexOf(right.id);
    return (leftRank < 0 ? 1 : 0) - (rightRank < 0 ? 1 : 0)
      || leftRank - rightRank
      || left.title.localeCompare(right.title);
  });
  if (programs.length < 10) throw new Error(`Only ${programs.length} Apple/linear-cleared titles were found; refusing to create a narrow lineup.`);

  const pod = [...creatives.values()]
    .filter((creative) => creative.status === 'approved' && creative.muxStatus === 'ready')
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, 2)
    .map((creative) => ({ creativeId: creative.id, durationSeconds: Math.round(creative.durationSeconds) }));
  if (!pod.length) throw new Error('No approved PROtv commercial creative is ready; refusing to create the Apple lineup.');

  const endMs = startMs + days * 86_400_000;
  const entries = [];
  let cursor = startMs;
  let index = 0;
  const createdAt = new Date().toISOString();
  while (cursor < endMs) {
    const video = programs[index % programs.length];
    const durationSeconds = knownDuration(video);
    const programEnd = cursor + durationSeconds * 1000;
    entries.push({
      id: crypto.randomUUID(),
      kind: 'program',
      channelId: CHANNEL_ID,
      videoId: video.id,
      programType: video.contentType === 'EPISODE' ? 'episode' : 'movie',
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(programEnd).toISOString(),
      durationSeconds,
      sourceStartSeconds: 0,
      label: '',
      notes: 'Rights-cleared Apple LIVE lineup; master network schedule is unchanged.',
      status: 'approved',
      origin: 'apple-lineup',
      createdAt,
      updatedAt: createdAt,
    });
    cursor = programEnd;
    index += 1;
    if (cursor >= endMs) break;
    const breakEnd = cursor + 120_000;
    const breakSeconds = Math.round((breakEnd - cursor) / 1000);
    entries.push({
      id: crypto.randomUUID(),
      kind: 'break',
      channelId: CHANNEL_ID,
      videoId: null,
      programType: null,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(breakEnd).toISOString(),
      durationSeconds: breakSeconds,
      sourceStartSeconds: 0,
      label: 'Commercial break',
      notes: 'Existing approved PROtv commercial pod for the Apple LIVE lineup.',
      pod,
      status: 'approved',
      origin: 'apple-lineup',
      createdAt,
      updatedAt: createdAt,
    });
    cursor = breakEnd;
  }

  const summary = {
    apply,
    replace,
    from: at.toISOString(),
    to: new Date(endMs).toISOString(),
    programs: programs.map((video) => ({ id: video.id, title: video.title, durationSeconds: knownDuration(video) })),
    entryCount: entries.length,
    breakCount: entries.filter((entry) => entry.kind === 'break').length,
    first: entries.slice(0, 4),
    last: entries.slice(-4),
  };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const schedule = db.collection('linearChannels').doc(CHANNEL_ID).collection('appleSchedule');
  const existing = await schedule.get();
  if (!replace && !existing.empty) throw new Error('An Apple LIVE lineup already exists; inspect it or use --replace.');
  const writer = db.bulkWriter();
  existing.docs.forEach((doc) => writer.delete(doc.ref));
  entries.forEach(({ id, ...entry }) => writer.set(schedule.doc(id), entry));
  await writer.close();
  console.log(JSON.stringify({ ...summary, written: entries.length, replaced: existing.size }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
