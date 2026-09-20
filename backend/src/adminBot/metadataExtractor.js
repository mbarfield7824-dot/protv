const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const ffprobe = require('ffprobe-static');

const execFileAsync = promisify(execFile);

function metadataFromFileName(fileName) {
  const withoutExtension = path.basename(fileName, path.extname(fileName));
  const yearMatch = withoutExtension.match(/(?:^|[\s_.()[\]-])((?:18|19|20)\d{2})(?=$|[\s_.()[\]-])/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const title = withoutExtension
    .replace(/(?:^|[\s_.()[\]-])(?:18|19|20)\d{2}(?=$|[\s_.()[\]-])/g, ' ')
    .replace(/[()[\]]+/g, ' ')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (!title) throw new Error(`A title could not be derived from "${fileName}".`);
  return { title, year };
}

async function runtimeFromFile(filePath) {
  const result = await execFileAsync(ffprobe.path, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { windowsHide: true });
  const runtime = Math.round(Number(result.stdout.trim()));
  if (!Number.isFinite(runtime) || runtime <= 0) {
    throw new Error('FFprobe could not determine the movie runtime.');
  }
  return runtime;
}

class MetadataExtractor {
  constructor({ aiMetadataService, referenceLookup }) {
    this.aiMetadataService = aiMetadataService;
    this.referenceLookup = referenceLookup;
  }

  async extract(filePath) {
    const base = metadataFromFileName(path.basename(filePath));
    const runtime = await runtimeFromFile(filePath);
    const sourceMetadata = await this.referenceLookup(base).catch((error) => ({
      unavailable: error.message,
    }));
    const generated = await this.aiMetadataService.enrich({
      ...base,
      runtime,
      sourceMetadata,
    });
    return {
      ...base,
      runtime,
      description: generated.description,
      tags: generated.tags,
      categories: generated.categories,
      reference: sourceMetadata,
    };
  }
}

module.exports = { MetadataExtractor, metadataFromFileName, runtimeFromFile };
