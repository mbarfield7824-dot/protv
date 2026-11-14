export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// Keychain items have historically been limited to about 2 KB, and Firebase sessions can be larger.
const CHUNK_SIZE = 1800;

function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

// Stores values across several secure items. Keychain items outlive an app uninstall, so the
// marker (kept in storage that is removed with the app) stops a reinstall from restoring a session.
export function createChunkedStorage(secure: KeyValueStore, marker: KeyValueStore): KeyValueStore {
  const clear = async (key: string) => {
    const count = Number(await secure.getItem(`${key}.count`)) || 0;
    await Promise.all(Array.from({ length: count }, (_, index) => secure.removeItem(`${key}.${index}`)));
    await secure.removeItem(`${key}.count`);
  };
  return {
    async getItem(rawKey) {
      const key = safeKey(rawKey);
      if (!await marker.getItem(`${key}.installed`)) {
        await clear(key);
        return null;
      }
      const count = Number(await secure.getItem(`${key}.count`)) || 0;
      if (!count) return null;
      const chunks = await Promise.all(Array.from({ length: count }, (_, index) => secure.getItem(`${key}.${index}`)));
      return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
    },
    async setItem(rawKey, value) {
      const key = safeKey(rawKey);
      await clear(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      await Promise.all(Array.from({ length: count }, (_, index) => (
        secure.setItem(`${key}.${index}`, value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE))
      )));
      await secure.setItem(`${key}.count`, String(count));
      await marker.setItem(`${key}.installed`, '1');
    },
    async removeItem(rawKey) {
      const key = safeKey(rawKey);
      await clear(key);
      await marker.removeItem(`${key}.installed`);
    },
  };
}
