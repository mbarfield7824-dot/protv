const { db } = require('../firebase');

function validateCatalogId(catalogId) {
  if (typeof catalogId !== 'string' || !/^[A-Za-z0-9_-]{3,160}$/.test(catalogId)) {
    throw new Error('The catalog ID is invalid.');
  }
  return catalogId;
}

function validateCatalogRights(video) {
  const commercialUse = String(video.commercialUseStatus || '').toLowerCase();
  const copyrightStatus = String(video.copyrightStatus || '').toLowerCase();
  if (
    copyrightStatus === 'public-domain'
    || ['admin-confirmed', 'verified-public-domain', 'distributor-confirmed', 'verified', 'owned']
      .includes(commercialUse)
  ) {
    if (video.rightsStartAt && new Date(video.rightsStartAt) > new Date()) {
      throw new Error('The title rights window has not started.');
    }
    if (video.rightsEndAt && new Date(video.rightsEndAt) <= new Date()) {
      throw new Error('The title rights window has expired.');
    }
    return;
  }
  throw new Error('Catalog rights must be verified before metadata or poster changes.');
}

class AdminCatalogService {
  constructor(database = db) {
    this.db = database;
  }

  async get(catalogId) {
    const id = validateCatalogId(catalogId);
    if (!this.db) throw new Error('Firestore is required for Administrator catalog changes.');
    const document = await this.db.collection('videos').doc(id).get();
    if (!document.exists) throw new Error('The catalog title was not found.');
    return { id: document.id, ...document.data() };
  }

  async update(catalogId, updates) {
    const current = await this.get(catalogId);
    validateCatalogRights(current);
    await this.db.collection('videos').doc(current.id).update({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return this.get(current.id);
  }
}

module.exports = { AdminCatalogService, validateCatalogId, validateCatalogRights };
