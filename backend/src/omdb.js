const https = require('https');

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`OMDb returned HTTP ${response.statusCode}.`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('OMDb returned an invalid response.'));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Unable to reach OMDb: ${error.message}`));
    });
  });
}

function titleAndYear(video) {
  const title = String(video.title || '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
  const yearMatch = String(video.title || '').match(/\((\d{4})\)\s*$/);
  const year = /^\d{4}$/.test(String(video.year)) ? String(video.year) : yearMatch?.[1];
  return { title, year };
}

async function getImdbRating(video) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    throw new Error('OMDb is not configured. Add OMDB_API_KEY to the server environment.');
  }

  const { title, year } = titleAndYear(video);
  if (!title) {
    throw new Error('A title is required to find an IMDb rating.');
  }

  const params = new URLSearchParams({ apikey: apiKey, t: title });
  if (year) params.set('y', year);
  const result = await requestJson(`https://www.omdbapi.com/?${params.toString()}`);

  if (result.Response !== 'True') {
    throw new Error(result.Error || 'No IMDb match was found.');
  }

  const rating = Number(result.imdbRating);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error('IMDb does not have a rating for this title yet.');
  }

  return {
    rating,
    ratingCount: Number.parseInt(String(result.imdbVotes || '').replace(/,/g, ''), 10) || 0,
    imdbId: result.imdbID,
    imdbTitle: result.Title,
    imdbYear: result.Year,
    ratingSource: 'IMDb',
    ratingUpdatedAt: new Date().toISOString(),
  };
}

async function getTitleReference({ title, year }) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    throw new Error('OMDb reference metadata is not configured.');
  }
  const params = new URLSearchParams({ apikey: apiKey, t: title, plot: 'full' });
  if (year) params.set('y', String(year));
  const result = await requestJson(`https://www.omdbapi.com/?${params.toString()}`);
  if (result.Response !== 'True') {
    throw new Error(result.Error || 'No trusted title reference was found.');
  }
  return {
    title: result.Title || title,
    year: result.Year || year,
    description: result.Plot && result.Plot !== 'N/A' ? result.Plot : '',
    genres: result.Genre && result.Genre !== 'N/A'
      ? result.Genre.split(',').map((value) => value.trim()).filter(Boolean)
      : [],
    director: result.Director && result.Director !== 'N/A' ? result.Director : '',
    country: result.Country && result.Country !== 'N/A' ? result.Country : '',
  };
}

module.exports = { getImdbRating, getTitleReference, titleAndYear };
