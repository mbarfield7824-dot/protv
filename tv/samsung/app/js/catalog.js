/*
 * PROtv Samsung - catalog rules (pure, no DOM).
 * Ported from the Roku model (tv/roku/source/model.brs on release/roku-1.0-rc9) so
 * every TV client groups, searches and presents the shared catalog the same way.
 * ES2017 only: Tizen 4.0 TVs run Chromium 56.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.catalog = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POLICY = 'samsung-rights-v1';
  var HELD_ARTWORK = ['MZ6Q6DI2S62pP8laH9Ku', 'XMj306OZSbomES2Zz0Fz'];

  function text(value) {
    return typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : '');
  }

  function httpsUrl(value) {
    var url = text(value);
    return /^https:\/\/[^\s]+$/i.test(url) ? url : '';
  }

  function isCreatorTitle(item) {
    return text(item && item.id).indexOf('creator_') === 0;
  }

  // The catalog is accepted only when the server says it applied Samsung's rights policy.
  // A preview build may instead intersect with a fixed allowlist (never a release build).
  function normalizeCatalog(payload, options) {
    var opts = options || {};
    var result = { items: [], error: '', policy: '' };
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
      result.error = 'invalid';
      return result;
    }
    var allowlist = Array.isArray(opts.previewAllowlist) && opts.previewAllowlist.length ? opts.previewAllowlist : null;
    if (payload.platformPolicy === POLICY) result.policy = POLICY;
    else if (allowlist) result.policy = 'preview-allowlist';
    else {
      result.error = 'policy';
      return result;
    }
    var seen = {};
    for (var index = 0; index < payload.items.length; index += 1) {
      var item = payload.items[index];
      if (!item || typeof item !== 'object') { result.error = 'invalid'; result.items = []; return result; }
      var id = text(item.id);
      if (!id || !text(item.title) || Object.prototype.hasOwnProperty.call(seen, id)) {
        result.error = 'invalid'; result.items = []; return result;
      }
      seen[id] = true;
      if (allowlist && result.policy !== POLICY && allowlist.indexOf(id) < 0) continue;
      var kind = text(item.contentType);
      if (kind !== 'MOVIE' && kind !== 'EPISODE') continue;
      if (!text(item.muxPlaybackId)) continue;
      result.items.push(decorate(item));
    }
    return result;
  }

  function decorate(item) {
    var copy = {};
    Object.keys(item).forEach(function (key) { copy[key] = item[key]; });
    copy.id = text(item.id);
    copy.title = text(item.title);
    copy.artwork = artworkSource(item);
    copy.backdrop = backdropSource(item);
    copy.genres = Array.isArray(item.genres) ? item.genres.map(text).filter(Boolean) : [];
    return copy;
  }

  function artworkSource(item) {
    if (HELD_ARTWORK.indexOf(text(item.id)) >= 0) return '';
    if (text(item.contentType) === 'EPISODE') {
      return httpsUrl(item.thumbnailUrl) || httpsUrl(item.heroImageUrl) || httpsUrl(item.posterUrl);
    }
    return httpsUrl(item.posterUrl) || httpsUrl(item.thumbnailUrl);
  }

  function backdropSource(item) {
    if (HELD_ARTWORK.indexOf(text(item.id)) >= 0) return '';
    return httpsUrl(item.heroImageUrl);
  }

  // Descriptions end with an internal licensing note ("Rights: ..."). Viewers see the synopsis;
  // the note stays available as the credit line so CC BY attribution remains visible on details.
  function rightsIndex(description) {
    return description.toLowerCase().indexOf('rights:');
  }

  function synopsis(item) {
    var description = text(item && item.description);
    var cut = rightsIndex(description);
    var body = (cut >= 0 ? description.slice(0, cut) : description).trim();
    return body || 'Synopsis coming soon.';
  }

  function rightsLine(item) {
    var description = text(item && item.description);
    var cut = rightsIndex(description);
    var credits = text(item && item.credits);
    var parts = [];
    if (cut >= 0) parts.push(description.slice(cut).trim());
    if (credits) parts.push(credits);
    return parts.join('  ');
  }

  function formatRuntime(seconds) {
    var total = Number(seconds);
    if (!isFinite(total) || total <= 0) return '';
    var minutes = Math.round(total / 60);
    if (minutes < 60) return minutes + 'm';
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return rest ? hours + 'h ' + rest + 'm' : hours + 'h';
  }

  function metadataLine(item) {
    var parts = [];
    if (item.year) parts.push(text(item.year));
    var runtime = formatRuntime(item.duration);
    if (runtime) parts.push(runtime);
    if (text(item.maturityRating)) parts.push(text(item.maturityRating));
    if (text(item.category)) parts.push(text(item.category));
    return parts.join('  •  ');
  }

  function episodeLabel(item) {
    var parts = [];
    if (item.seasonNumber) parts.push('S' + item.seasonNumber);
    if (item.episodeNumber) parts.push('E' + item.episodeNumber);
    var name = text(item.episodeTitle) || text(item.title);
    return parts.length ? parts.join(' ') + '  ' + name : name;
  }

  function cardSubtitle(item) {
    if (text(item.contentType) === 'EPISODE') return episodeLabel(item);
    var parts = [];
    if (item.year) parts.push(text(item.year));
    if (text(item.category)) parts.push(text(item.category));
    return parts.join('  •  ');
  }

  function searchable(item) {
    return [item.title, item.category, item.subgenre, item.seriesTitle, item.episodeTitle]
      .concat(item.genres || []).map(text).join(' ').toLowerCase();
  }

  // Same all-terms semantics as the backend search, run against the downloaded catalog.
  function matchesSearch(item, query) {
    var terms = text(query).toLowerCase().slice(0, 200).split(/\s+/).filter(Boolean);
    if (!terms.length) return false;
    var haystack = searchable(item);
    return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
  }

  function search(items, query) {
    var matches = items.filter(function (item) { return matchesSearch(item, query); });
    return {
      movies: creatorsFirst(matches.filter(function (item) { return item.contentType === 'MOVIE'; })),
      episodes: matches.filter(function (item) { return item.contentType === 'EPISODE'; }),
      total: matches.length,
    };
  }

  function creatorsFirst(items) {
    return items.filter(isCreatorTitle).concat(items.filter(function (item) { return !isCreatorTitle(item); }));
  }

  function hasGenre(item, pattern) {
    var values = [item.category, item.subgenre].concat(item.genres || []).map(text);
    return values.some(function (value) { return pattern.test(value); });
  }

  // Collections the Samsung app can show when eligible titles carry them. Empty ones are hidden.
  var COLLECTIONS = [
    { id: 'ai-cinema', title: 'AI Cinema', pattern: /\bai\b|artificial intelligence/i },
    { id: 'music', title: 'Music', pattern: /music|concert|musical/i },
    { id: 'black-cinema', title: 'Black Cinema', pattern: /black cinema|black film|african american/i },
  ];

  function categories(items) {
    var byName = {};
    var order = [];
    items.forEach(function (item) {
      if (item.contentType !== 'MOVIE') return;
      var name = text(item.category);
      if (!name) return;
      var key = name.toLowerCase();
      if (!byName[key]) { byName[key] = { id: 'category:' + key, title: name, items: [] }; order.push(key); }
      byName[key].items.push(item);
    });
    var result = COLLECTIONS.map(function (collection) {
      return {
        id: 'collection:' + collection.id,
        title: collection.title,
        items: creatorsFirst(items.filter(function (item) { return item.contentType === 'MOVIE' && hasGenre(item, collection.pattern); })),
      };
    }).filter(function (entry) { return entry.items.length > 0; });
    var used = {};
    result.forEach(function (entry) { used[entry.title.toLowerCase()] = true; });
    order.sort().forEach(function (key) {
      if (!used[key]) result.push({ id: byName[key].id, title: byName[key].title, items: creatorsFirst(byName[key].items) });
    });
    return result;
  }

  function seriesKey(item) {
    return text(item.seriesTitle).toLowerCase();
  }

  function seriesList(items) {
    var map = {};
    var order = [];
    items.forEach(function (item) {
      if (item.contentType !== 'EPISODE' || !text(item.seriesTitle)) return;
      var key = seriesKey(item);
      if (!map[key]) { map[key] = { key: key, title: text(item.seriesTitle), episodes: [] }; order.push(key); }
      map[key].episodes.push(item);
    });
    return order.map(function (key) {
      var series = map[key];
      var episodes = sortEpisodes(series.episodes);
      var lead = episodes[0];
      return {
        id: 'series:' + key,
        key: key,
        title: series.title,
        contentType: 'SERIES',
        artwork: lead.artwork,
        backdrop: lead.backdrop,
        episodes: episodes,
        seasons: seasons(episodes),
      };
    });
  }

  function sortEpisodes(episodes) {
    return episodes.slice().sort(function (a, b) {
      var sa = Number(a.seasonNumber) || 9999;
      var sb = Number(b.seasonNumber) || 9999;
      if (sa !== sb) return sa - sb;
      var ea = Number(a.episodeNumber) || 9999;
      var eb = Number(b.episodeNumber) || 9999;
      if (ea !== eb) return ea - eb;
      return text(a.title).localeCompare(text(b.title));
    });
  }

  // Seasons come only from real seasonNumber values; unnumbered episodes are grouped, never invented.
  function seasons(episodes) {
    var numbered = {};
    var keys = [];
    var loose = [];
    episodes.forEach(function (episode) {
      var number = Number(episode.seasonNumber);
      if (number > 0 && Math.floor(number) === number) {
        if (!numbered[number]) { numbered[number] = []; keys.push(number); }
        numbered[number].push(episode);
      } else loose.push(episode);
    });
    keys.sort(function (a, b) { return a - b; });
    var result = keys.map(function (number) { return { title: 'Season ' + number, number: number, episodes: numbered[number] }; });
    if (loose.length) result.push({ title: keys.length ? 'More episodes' : 'Episodes', number: 0, episodes: loose });
    return result;
  }

  function seriesFor(items, episode) {
    var key = seriesKey(episode);
    if (!key) return null;
    var list = seriesList(items);
    for (var i = 0; i < list.length; i += 1) if (list[i].key === key) return list[i];
    return null;
  }

  function spotlight(items) {
    var movies = items.filter(function (item) { return item.contentType === 'MOVIE'; });
    var withArt = movies.filter(function (item) { return item.backdrop || item.artwork; });
    return creatorsFirst(withArt).slice(0, 6);
  }

  function byIds(items, ids) {
    var index = {};
    items.forEach(function (item) { index[item.id] = item; });
    var result = [];
    (ids || []).forEach(function (id) { if (index[id]) result.push(index[id]); });
    return result;
  }

  function homeRows(items, state) {
    var context = state || {};
    var rows = [];
    function add(id, title, list, options) {
      if (list && list.length) rows.push({ id: id, title: title, items: list, wide: Boolean(options && options.wide) });
    }
    add('continue', 'Continue Watching', context.continueWatching || [], { wide: true });
    add('my-list', 'My List', context.favorites || []);
    var movies = items.filter(function (item) { return item.contentType === 'MOVIE'; });
    add('creators', 'From PROtv Creators', movies.filter(isCreatorTitle));
    var series = seriesList(items);
    add('series', 'Series', series);
    categories(items).forEach(function (category) { add(category.id, category.title, category.items); });
    add('movies', 'All Movies', creatorsFirst(movies));
    return rows;
  }

  function find(items, id) {
    for (var i = 0; i < items.length; i += 1) if (items[i].id === id) return items[i];
    return null;
  }

  return {
    POLICY: POLICY,
    text: text,
    normalizeCatalog: normalizeCatalog,
    artworkSource: artworkSource,
    backdropSource: backdropSource,
    synopsis: synopsis,
    rightsLine: rightsLine,
    formatRuntime: formatRuntime,
    metadataLine: metadataLine,
    cardSubtitle: cardSubtitle,
    episodeLabel: episodeLabel,
    matchesSearch: matchesSearch,
    search: search,
    isCreatorTitle: isCreatorTitle,
    creatorsFirst: creatorsFirst,
    categories: categories,
    seriesList: seriesList,
    seriesFor: seriesFor,
    sortEpisodes: sortEpisodes,
    spotlight: spotlight,
    byIds: byIds,
    homeRows: homeRows,
    find: find,
  };
});
