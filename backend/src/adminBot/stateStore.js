const fs = require('fs/promises');
const path = require('path');

class IngestionStateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { files: {} };
      throw new Error(`Unable to read the Public Domain ingestion state: ${error.message}`);
    }
  }

  async get(hash) {
    return (await this.load()).files[hash] || null;
  }

  async set(hash, value) {
    const state = await this.load();
    state.files[hash] = {
      ...(state.files[hash] || {}),
      ...value,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
    return state.files[hash];
  }
}

module.exports = { IngestionStateStore };
