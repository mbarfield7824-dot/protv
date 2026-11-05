// Runtime switch for the website's Sponsored (Adsterra Native Banner) placement. Off unless an Administrator turns it
// on. Stored in Firestore so it changes without a redeploy. Only the on/off state is configurable: the ad network
// script and container are fixed in the website code, so this setting can never inject other third-party code.
const DOCUMENT = { collection: 'siteSettings', id: 'advertising' };

class FirestorePlacementSettings {
  constructor(db) { this.db = db; }

  async read() {
    if (!this.db) return { nativeBannerEnabled: false, updatedAt: null, updatedBy: null };
    const snapshot = await this.db.collection(DOCUMENT.collection).doc(DOCUMENT.id).get();
    const data = snapshot.exists ? snapshot.data() : {};
    return {
      nativeBannerEnabled: data.nativeBannerEnabled === true,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
    };
  }

  async setNativeBanner(enabled, actorId) {
    if (!this.db) throw new Error('Advertising settings require Firestore.');
    const value = { nativeBannerEnabled: enabled === true, updatedAt: new Date().toISOString(), updatedBy: actorId || null };
    await this.db.collection(DOCUMENT.collection).doc(DOCUMENT.id).set(value, { merge: true });
    return value;
  }
}

class MemoryPlacementSettings {
  constructor(initial = {}) { this.value = { nativeBannerEnabled: false, updatedAt: null, updatedBy: null, ...initial }; }
  async read() { return { ...this.value }; }
  async setNativeBanner(enabled, actorId) {
    this.value = { nativeBannerEnabled: enabled === true, updatedAt: new Date().toISOString(), updatedBy: actorId || null };
    return { ...this.value };
  }
}

module.exports = { FirestorePlacementSettings, MemoryPlacementSettings };
