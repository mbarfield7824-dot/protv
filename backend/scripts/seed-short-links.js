require('dotenv').config();
const { defaultStore, FLAGSHIP } = require('../src/shortLinks/router');

async function seedFlagship(store, actor = 'short-link-setup') {
  const existing = await store.get('mmwf');
  if (existing) {
    if (existing.slug !== FLAGSHIP.slug || existing.destination !== FLAGSHIP.destination
      || existing.kind !== FLAGSHIP.kind || !existing.active) {
      throw new Error('MMWF is already assigned differently or inactive. An administrator must review it; setup will not overwrite it.');
    }
    return existing;
  }
  return store.save(FLAGSHIP, actor);
}
if (require.main === module) {
  const store = defaultStore();
  if ((store.db || process.env.VERCEL || process.env.NODE_ENV === 'production') && !process.argv.includes('--approved-production')) {
    console.error('Production seeding requires explicit release approval and --approved-production.');
    process.exitCode = 1;
  } else {
    seedFlagship(store).then(record => console.log(`Registered /${record.slug} -> ${record.destination}`))
      .catch(error => { console.error('Short-link setup failed:', error.message); process.exitCode = 1; });
  }
}
module.exports = { seedFlagship };
