const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov']);

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function listVideoFiles(directory) {
  let entries;
  try {
    entries = await fsPromises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Public Domain content directory does not exist: ${directory}`);
    }
    throw new Error(`Unable to scan the Public Domain content directory: ${error.message}`);
  }

  const results = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listVideoFiles(entryPath));
    } else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(entryPath);
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}

async function discoverFiles({ directory, stateStore }) {
  const files = await listVideoFiles(directory);
  const newItems = [];
  const skipped = [];

  for (const filePath of files) {
    const hash = await hashFile(filePath);
    const previous = await stateStore.get(hash);
    const item = {
      hash,
      filePath,
      fileName: path.basename(filePath),
      previous,
    };
    if (previous?.status === 'published') {
      skipped.push({
        fileName: item.fileName,
        title: previous.title || item.fileName,
        reason: 'Already added to the live catalog.',
      });
    } else {
      newItems.push(item);
    }
  }

  return { newItems, skipped };
}

module.exports = { VIDEO_EXTENSIONS, discoverFiles, hashFile, listVideoFiles };
