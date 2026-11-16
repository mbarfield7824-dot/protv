/*
 * PROtv Samsung - application controller: screens, remote focus, Back/Exit, account and playback.
 * Depends on catalog, progress, account, http, keys, focus and player (loaded before this file).
 */
(function () {
  'use strict';

  var P = window.PROtv;
  var C = P.catalog;
  var config = window.PROTV_CONFIG || {};
  var tizenApi = window.tizen;
  var webapis = window.webapis;
  var CATALOG_STALE_MS = 15 * 60 * 1000;
  var GUEST_PROGRESS_KEY = 'protv.samsung.guestProgress.v1';
  var OSD_HIDE_MS = 5000;

  var http = P.http.create({ apiBase: config.apiBase, version: config.version });
  var storage = safeStorage();
  var accountService = P.account.createAccountService({
    http: http,
    storage: storage,
    now: function () { return Date.now(); },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimer: function (id) { clearTimeout(id); },
    apiBase: config.apiBase,
    firebaseApiKey: config.firebaseApiKey,
  });

  var state = {
    items: [],
    catalogStatus: 'loading', // loading | ready | error | policy | empty
    catalogLoadedAt: 0,
    progress: {},
    favorites: [],
    favoritesLoaded: false,
    accountSyncedAt: 0,
    stack: [],
    navOpen: false,
    rowMemory: {},
    spotlightIndex: 0,
  };

  var dom = {
    nav: document.getElementById('nav'),
    screen: document.getElementById('screen'),
    player: document.getElementById('player'),
    osd: document.getElementById('osd'),
    toast: document.getElementById('toast'),
    dialog: document.getElementById('dialog'),
    splash: document.getElementById('splash'),
    offline: document.getElementById('offline'),
    ambientA: document.getElementById('ambient-a'),
    ambientB: document.getElementById('ambient-b'),
  };

  /* ================= utilities ================= */
  function safeStorage() {
    try {
      var probe = '__protv';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (error) {
      var memory = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
        setItem: function (k, v) { memory[k] = String(v); },
        removeItem: function (k) { delete memory[k]; },
      };
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Official PROtv logo artwork, pre-scaled to its exact on-screen width (img/logo-<width>.png; see
  // tools/render-store-art-roku-brand.mjs --app). Width and height keep the logo's own aspect ratio.
  var LOGO_HEIGHTS = { 720: 198, 320: 88, 120: 33 };
  function wordmark(width) {
    var w = LOGO_HEIGHTS[width] ? width : 120;
    var img = new Image(w, LOGO_HEIGHTS[w]);
    img.className = 'wordmark';
    img.alt = 'PROtv';
    img.src = 'img/logo-' + w + '.png';
    return img;
  }

  var ICONS = {
    home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
    movies: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v2h2V6zm12 0v2h2V6zM5 10v4h14v-4zm0 6v2h2v-2zm12 0v2h2v-2z',
    series: 'M3 6h18v12H3zm2 2v8h14V8zM8 2l4 3 4-3',
    categories: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
    mylist: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
    account: 'M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 11c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5z',
    play: 'M8 5v14l11-7z',
    pause: 'M7 5h4v14H7zm6 0h4v14h-4z',
    info: 'M11 10h2v7h-2zm0-3h2v2h-2zm1-5a10 10 0 1 1 0 20 10 10 0 0 1 0-20z',
    check: 'M9 16.2l-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z',
    back10: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
    fwd10: 'M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z',
    restart: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
    next: 'M6 18l8.5-6L6 6zm9-12h2v12h-2z',
  };

  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name] || '');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    return svg;
  }

  function button(label, iconName, onSelect, primary) {
    var node = el('div', 'btn focusable' + (primary ? ' primary' : ''));
    if (iconName) node.appendChild(icon(iconName));
    node.appendChild(el('span', '', label));
    node.setAttribute('role', 'button');
    node._select = onSelect;
    return node;
  }

  var toastTimer = null;
  function toast(message, ms) {
    dom.toast.textContent = message;
    dom.toast.className = 'show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.className = ''; }, ms || 4500);
  }

  function online() { return navigator.onLine !== false; }

  /* ================= ambient background ================= */
  var ambientFront = 'a';
  var ambientUrl = '';
  var ambientTimer = null;
  function ambient(item) {
    var url = item ? (item.backdrop || item.artwork || '') : '';
    var sharp = Boolean(item && item.backdrop);
    if (url === ambientUrl) return;
    if (ambientTimer) clearTimeout(ambientTimer);
    ambientTimer = setTimeout(function () {
      ambientUrl = url;
      var next = ambientFront === 'a' ? dom.ambientB : dom.ambientA;
      var prev = ambientFront === 'a' ? dom.ambientA : dom.ambientB;
      ambientFront = ambientFront === 'a' ? 'b' : 'a';
      next.style.backgroundImage = url ? 'url("' + url.replace(/"/g, '%22') + '")' : 'none';
      next.className = 'ambient-layer' + (sharp ? ' sharp' : '') + (url ? ' show' : '');
      prev.className = prev.className.replace(' show', '');
    }, 250);
  }

  /* ================= cards and rows ================= */
  function imageInto(frame, url, alt) {
    if (!url) return;
    var img = new Image();
    img.alt = alt || '';
    img.onload = function () { img.className = 'loaded'; var fb = frame.querySelector('.fallback'); if (fb) fb.style.display = 'none'; };
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = url;
    frame.insertBefore(img, frame.firstChild);
  }

  function card(item, options) {
    var opts = options || {};
    var wide = Boolean(opts.wide);
    var node = el('div', 'card focusable' + (wide ? ' wide' : ''));
    var frame = el('div', 'frame');
    var fallback = el('div', 'fallback');
    fallback.appendChild(wordmark());
    fallback.appendChild(el('strong', '', item.title));
    frame.appendChild(fallback);
    imageInto(frame, item.artwork, item.title);
    if (C.isCreatorTitle(item) && !wide) frame.appendChild(el('div', 'badge', 'CREATOR'));
    var fraction = item.id ? P.progress.fraction(state.progress, item.id) : 0;
    if (fraction > 0 && P.progress.inProgress(state.progress[item.id])) {
      var bar = el('div', 'bar');
      var fill = el('b');
      fill.style.width = Math.round(fraction * 100) + '%';
      bar.appendChild(fill);
      frame.appendChild(bar);
    }
    node.appendChild(frame);
    node.appendChild(el('div', 'label', item.contentType === 'EPISODE' && wide ? C.episodeLabel(item) : item.title));
    var sub = opts.subtitle !== undefined ? opts.subtitle
      : (opts.continueRow ? P.progress.timeLeft(state.progress, item.id) : (item.contentType === 'SERIES' ? seasonsMeta(item) : C.cardSubtitle(item)));
    if (sub) node.appendChild(el('div', 'sublabel', sub));
    node._item = item;
    node._select = opts.onSelect || function () { openItem(item); };
    node._focus = function () { if (opts.onFocus) opts.onFocus(item); };
    return node;
  }

  function seasonsMeta(series) {
    var count = series.episodes.length;
    var seasons = series.seasons.filter(function (s) { return s.number > 0; }).length;
    return (seasons > 1 ? seasons + ' seasons  •  ' : '') + count + (count === 1 ? ' episode' : ' episodes');
  }

  function row(id, title, items, options) {
    var opts = options || {};
    var node = el('section', 'row' + (opts.wide ? ' wide' : ''));
    node.setAttribute('data-row', id);
    var heading = el('div', 'row-title', title);
    heading.appendChild(el('small', '', items.length + (items.length === 1 ? ' title' : ' titles')));
    node.appendChild(heading);
    var windowEl = el('div', 'track-window');
    var track = el('div', 'track');
    items.forEach(function (item, index) {
      var c = card(item, { wide: opts.wide, continueRow: opts.continueRow, onFocus: opts.onFocus });
      c.setAttribute('data-group', id);
      c.setAttribute('data-index', String(index));
      track.appendChild(c);
    });
    windowEl.appendChild(track);
    node.appendChild(windowEl);
    return node;
  }

  /* ================= navigation rail ================= */
  var NAV = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'movies', label: 'Movies', icon: 'movies' },
    { id: 'series', label: 'Series', icon: 'series' },
    { id: 'categories', label: 'Categories', icon: 'categories' },
    { id: 'mylist', label: 'My List', icon: 'mylist' },
    { id: 'account', label: 'Account', icon: 'account' },
  ];

  function renderNav() {
    dom.nav.innerHTML = '';
    var logo = el('div', 'nav-logo');
    logo.appendChild(wordmark());
    dom.nav.appendChild(logo);
    NAV.forEach(function (entry) {
      var item = el('div', 'nav-item focusable');
      item.setAttribute('data-nav', entry.id);
      item.appendChild(icon(entry.icon));
      item.appendChild(el('span', '', entry.label));
      item._select = function () { goRoot(entry.id); };
      dom.nav.appendChild(item);
    });
    syncNav();
  }

  function syncNav() {
    var top = currentScreen();
    var root = top ? top.navId : '';
    Array.prototype.forEach.call(dom.nav.querySelectorAll('.nav-item'), function (item) {
      var active = item.getAttribute('data-nav') === root;
      item.className = 'nav-item focusable' + (active ? ' active' : '') + (item === focused ? ' focused' : '');
    });
    dom.nav.className = 'nav' + (state.navOpen ? ' open' : '');
    dom.nav.style.display = top && top.hideNav ? 'none' : '';
  }

  /* ================= screen stack ================= */
  function currentScreen() { return state.stack[state.stack.length - 1] || null; }

  function mount(screen) {
    dom.screen.innerHTML = '';
    dom.screen.appendChild(screen.el);
    syncNav();
    var target = screen.lastFocus && document.body.contains(screen.lastFocus) ? screen.lastFocus : (screen.initialFocus && screen.initialFocus());
    if (target) setFocus(target);
    else {
      var first = screen.el.querySelector('.focusable');
      if (first) setFocus(first);
      else setFocus(dom.nav.querySelector('.nav-item.active') || dom.nav.querySelector('.nav-item'));
    }
  }

  function push(screen) {
    var top = currentScreen();
    if (top) { top.lastFocus = focused; if (top.leave) top.leave(); }
    state.stack.push(screen);
    mount(screen);
  }

  function pop() {
    if (state.stack.length <= 1) return false;
    var top = state.stack.pop();
    if (top.leave) top.leave();
    var next = currentScreen();
    // Returning rebuilds the screen so My List, progress bars and Resume labels are current,
    // with focus restored to the card or button the viewer left from.
    if (next.rebuild && !next.isActivation) rebuildTop(next.lastFocus);
    else mount(next);
    return true;
  }

  function replaceTop(screen) {
    var top = state.stack.pop();
    if (top && top.leave) top.leave();
    state.stack.push(screen);
    mount(screen);
  }

  function goRoot(id, force) {
    var top = currentScreen();
    if (!force && top && top.navId === id && state.stack.length === 1) { setFocus(top.initialFocus ? top.initialFocus() : top.el.querySelector('.focusable')); closeNav(); return; }
    state.stack.forEach(function (screen) { if (screen.leave) screen.leave(); });
    state.stack = [];
    state.navOpen = false;
    push(buildRoot(id));
    if (id === 'home' || id === 'mylist') refreshAccount();
  }

  function buildRoot(id) {
    if (id === 'search') return searchScreen();
    if (id === 'movies') return gridScreen('movies', 'Movies', function () { return C.creatorsFirst(state.items.filter(function (i) { return i.contentType === 'MOVIE'; })); }, 'Movies arrive here as they are cleared for Samsung TVs.');
    if (id === 'series') return gridScreen('series', 'Series', function () { return C.seriesList(state.items); }, 'Series arrive here as they are cleared for Samsung TVs.');
    if (id === 'categories') return categoriesScreen();
    if (id === 'mylist') return myListScreen();
    if (id === 'account') return accountScreen();
    return homeScreen();
  }

  // Rebuilds the top screen with fresh data (resume labels, My List, progress bars) and puts focus
  // back on the same row position or title the viewer left from.
  function rebuildTop(anchor) {
    var top = currentScreen();
    if (!top || !top.rebuild) return;
    var from = anchor || focused;
    var memory = from && top.el.contains(from) ? {
      group: from.getAttribute('data-group'),
      index: from.getAttribute('data-index'),
      id: from._item ? from._item.id : null,
      label: from.textContent,
    } : null;
    if (top.leave) top.leave();
    var fresh = top.rebuild();
    fresh.lastFocus = null;
    state.stack[state.stack.length - 1] = fresh;
    if (memory) {
      var match = null;
      if (memory.group) match = fresh.el.querySelector('[data-group="' + memory.group + '"][data-index="' + memory.index + '"]');
      if (!match && memory.id) {
        match = Array.prototype.filter.call(fresh.el.querySelectorAll('.card'), function (c) { return c._item && c._item.id === memory.id; })[0] || null;
      }
      if (match) fresh.lastFocus = match;
    }
    mount(fresh);
  }

  /* ================= focus engine ================= */
  var focused = null;

  function layerRoot() {
    if (!dom.dialog.classList.contains('hidden')) return [dom.dialog];
    if (!dom.player.classList.contains('hidden')) return [dom.osd];
    var top = currentScreen();
    return top && top.hideNav ? [dom.screen] : [dom.nav, dom.screen];
  }

  function candidates() {
    var list = [];
    layerRoot().forEach(function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('.focusable'), function (node) {
        if (node.offsetParent !== null || node === focused) list.push(node);
      });
    });
    return list;
  }

  function setFocus(node) {
    if (!node) return;
    if (focused && focused !== node) focused.classList.remove('focused');
    focused = node;
    node.classList.add('focused');
    var inNav = dom.nav.contains(node);
    if (inNav !== state.navOpen) { state.navOpen = inNav; dom.nav.className = 'nav' + (inNav ? ' open' : ''); }
    var group = node.getAttribute('data-group');
    if (group) state.rowMemory[group] = node;
    scrollIntoView(node);
    Array.prototype.forEach.call(dom.screen.querySelectorAll('.row.active'), function (r) { r.classList.remove('active'); });
    var rowEl = closest(node, 'row');
    if (rowEl) rowEl.classList.add('active');
    if (node._focus) node._focus();
  }

  function closeNav() {
    state.navOpen = false;
    dom.nav.className = 'nav';
  }

  function closest(node, className) {
    var cur = node;
    while (cur && cur !== document.body) {
      if (cur.classList && cur.classList.contains(className)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  function scrollIntoView(node) {
    var track = closest(node, 'track');
    if (track) {
      var current = Number(track.getAttribute('data-offset') || 0);
      var viewport = 1920 - (track.parentNode.getBoundingClientRect().left + current * 0) - 140;
      var next = P.focus.scrollOffset(current, node.offsetLeft, node.offsetWidth, viewport, 30);
      if (next !== current) {
        track.setAttribute('data-offset', String(next));
        track.style.transform = 'translateX(' + (-next) + 'px)';
      }
    }
    var scroller = closest(node, 'scroller');
    if (scroller) {
      var anchor = closest(node, 'row') || closest(node, 'scroll-anchor') || node;
      var top = anchor.offsetTop;
      var target = anchor.getAttribute('data-scroll-top') !== null ? Number(anchor.getAttribute('data-scroll-top')) : Math.max(0, top - 96);
      if (closest(node, 'hero')) target = 0;
      scroller.style.transform = 'translateY(' + (-target) + 'px)';
      if (target > 0) scroller.classList.add('browsing'); else scroller.classList.remove('browsing');
      scroller.setAttribute('data-y', String(target));
    }
  }

  function move(direction) {
    if (!focused) { var first = candidates()[0]; if (first) setFocus(first); return; }
    var top = currentScreen();
    if (top && top.onMove && top.onMove(direction, focused) === true) return;
    var group = focused.getAttribute('data-group');
    // Within a row Left/Right step by index, so animation never confuses the geometry.
    if (group && (direction === 'left' || direction === 'right')) {
      var index = Number(focused.getAttribute('data-index'));
      var sibling = focused.parentNode.querySelector('[data-group="' + group + '"][data-index="' + (index + (direction === 'right' ? 1 : -1)) + '"]');
      if (sibling) { setFocus(sibling); return; }
      if (direction === 'right') return; // end of row: stay put, no trap, no jump
    }
    // Leaving the navigation rail returns to where the viewer was on the screen.
    if (dom.nav.contains(focused) && direction === 'right') {
      var screen = currentScreen();
      var back = screen && screen.lastFocus && document.body.contains(screen.lastFocus) ? screen.lastFocus : null;
      if (back) { setFocus(back); return; }
    }
    if (!dom.nav.contains(focused) && direction === 'left' && top) top.lastFocus = focused;
    var list = candidates();
    var rects = list.map(function (node) { return { rect: node.getBoundingClientRect() }; });
    var nextIndex = P.focus.nextIndex(focused.getBoundingClientRect(), rects, direction);
    if (nextIndex < 0) return;
    var target = list[nextIndex];
    var targetGroup = target.getAttribute('data-group');
    if (targetGroup && targetGroup !== group) {
      // Entering a row lands on the card the viewer last used there, else on its first card.
      var remembered = state.rowMemory[targetGroup];
      if (remembered && document.body.contains(remembered)) target = remembered;
      else target = target.parentNode.querySelector('[data-group="' + targetGroup + '"][data-index="0"]') || target;
    }
    if (dom.nav.contains(target) && !dom.nav.contains(focused)) {
      // The rail is reached with Left only; Up/Down at the edge of a screen stay put.
      if (direction !== 'left') return;
      if (top) top.lastFocus = focused;
      target = dom.nav.querySelector('.nav-item.active') || target;
    }
    // Symmetric rule: Up/Down at the top or bottom of the rail stay in the rail (content is left with Right).
    if (dom.nav.contains(focused) && !dom.nav.contains(target) && (direction === 'up' || direction === 'down')) return;
    setFocus(target);
  }

  function select() {
    if (focused && focused._select) focused._select();
  }

  /* ================= dialogs ================= */
  var dialogReturn = null;
  function dialog(title, message, actions) {
    dialogReturn = focused;
    dom.dialog.innerHTML = '';
    var panel = el('div', 'panel');
    panel.appendChild(el('h2', '', title));
    if (message) panel.appendChild(el('p', '', message));
    var row = el('div', 'actions');
    actions.forEach(function (action, index) {
      row.appendChild(button(action.label, action.icon, function () { closeDialog(); if (action.run) action.run(); }, index === 0));
    });
    panel.appendChild(row);
    dom.dialog.appendChild(panel);
    dom.dialog.classList.remove('hidden');
    setFocus(row.querySelector('.focusable'));
  }

  function closeDialog() {
    dom.dialog.classList.add('hidden');
    dom.dialog.innerHTML = '';
    var back = dialogReturn && document.body.contains(dialogReturn) ? dialogReturn : null;
    dialogReturn = null;
    if (!dom.player.classList.contains('hidden')) { osd.show(); return; }
    if (back) setFocus(back);
    else { var top = currentScreen(); if (top) mount(top); }
  }

  function exitApp() {
    flushAll();
    try {
      tizenApi.application.getCurrentApplication().exit();
    } catch (error) {
      window.close();
    }
  }

  function confirmExit() {
    dialog('Exit PROtv?', '', [
      { label: 'Cancel' },
      { label: 'Exit', run: exitApp },
    ]);
  }

  /* ================= catalog loading ================= */
  function loadCatalog(quiet) {
    if (!quiet) state.catalogStatus = 'loading';
    return http('GET', config.apiBase + '/v1/catalog?view=all', {}).then(function (response) {
      if (response.status !== 200) {
        if (!quiet || !state.items.length) state.catalogStatus = 'error';
        return;
      }
      var result = C.normalizeCatalog(response.body, { previewAllowlist: config.previewAllowlist });
      if (result.error === 'policy') { state.items = []; state.catalogStatus = 'policy'; return; }
      if (result.error) { if (!quiet || !state.items.length) state.catalogStatus = 'error'; return; }
      state.items = result.items;
      state.catalogStatus = result.items.length ? 'ready' : 'empty';
      state.catalogLoadedAt = Date.now();
    });
  }

  function statusScreen(navId) {
    var status = state.catalogStatus;
    var node = el('div', 'screen');
    var box = el('div', 'state');
    var actions = el('div', 'actions');
    if (status === 'loading') {
      box.appendChild(el('div', 'spinner'));
    } else if (status === 'policy') {
      box.appendChild(el('h2', '', 'PROtv is almost here'));
      box.appendChild(el('p', '', 'Titles for Samsung TVs are being prepared. Please check back soon, or watch now at watchprotv.com.'));
      actions.appendChild(button('Try again', 'restart', retryCatalog, true));
    } else if (status === 'empty') {
      box.appendChild(el('h2', '', 'Nothing to watch yet'));
      box.appendChild(el('p', '', 'New titles are on the way. Please check back soon.'));
      actions.appendChild(button('Refresh', 'restart', retryCatalog, true));
    } else {
      box.appendChild(el('h2', '', online() ? 'We can’t reach PROtv right now' : 'You’re offline'));
      box.appendChild(el('p', '', online() ? 'Something went wrong loading the catalog. Please try again in a moment.' : 'Check your TV’s network connection. PROtv will try again when you’re back online.'));
      actions.appendChild(button('Try again', 'restart', retryCatalog, true));
    }
    box.appendChild(actions);
    node.appendChild(box);
    return { el: node, navId: navId, rebuild: function () { return buildRoot(navId); } };
  }

  function retryCatalog() {
    state.catalogStatus = 'loading';
    rebuildTop();
    loadCatalog(false).then(function () { goRoot(currentScreen() ? currentScreen().navId || 'home' : 'home', true); });
  }

  /* ================= home ================= */
  function homeScreen() {
    if (state.catalogStatus !== 'ready') return statusScreen('home');
    var node = el('div', 'screen');
    var scroller = el('div', 'scroller');
    var spot = C.spotlight(state.items);
    var hero = el('section', 'hero');
    var copy = el('div', 'hero-copy');
    var eyebrow = el('div', 'eyebrow');
    var title = el('div', 'hero-title');
    var meta = el('div', 'meta');
    var summary = el('div', 'summary');
    var actions = el('div', 'actions');
    var dots = el('div', 'hero-dots');
    var art = el('div', 'hero-art');
    copy.appendChild(eyebrow); copy.appendChild(title); copy.appendChild(meta); copy.appendChild(summary); copy.appendChild(actions); copy.appendChild(dots);
    hero.appendChild(copy);
    hero.appendChild(art);
    var current = null;
    var rotate = null;
    var browsing = false;

    function show(item) {
      current = item;
      eyebrow.textContent = C.isCreatorTitle(item) ? 'PROtv Creator Spotlight' : 'Featured on PROtv';
      title.textContent = item.title;
      meta.textContent = C.metadataLine(item);
      summary.textContent = C.synopsis(item);
      art.innerHTML = '';
      art.style.display = item.backdrop ? 'none' : '';
      if (!item.backdrop && item.artwork) { var img = new Image(); img.src = item.artwork; img.alt = item.title; art.appendChild(img); }
      var fav = isFavorite(item.id);
      myListLabel.textContent = fav ? 'In My List' : 'My List';
      myListBtn.replaceChild(icon(fav ? 'check' : 'mylist'), myListBtn.firstChild);
      Array.prototype.forEach.call(dots.children, function (dot, index) { dot.className = spot[index] === item ? 'on' : ''; });
      ambient(item);
    }

    // The spotlight rotates, so an OK pressed just as it changes would act on a title the viewer never read:
    // within the grace window the previous title is restored and used instead.
    var previous = null;
    var rotatedAt = 0;
    function syncPlayLabel() {
      playBtn.querySelector('span').textContent = P.progress.resumePosition(state.progress, current.id) ? 'Resume' : 'Play';
    }
    function chosen() {
      if (previous && Date.now() - rotatedAt < SPOTLIGHT_GRACE_MS) {
        state.spotlightIndex = spot.indexOf(previous);
        show(previous);
        syncPlayLabel();
      }
      previous = null;
      return current;
    }

    var resume = 0;
    var playBtn = button('Play', 'play', function () { playItem(chosen()); }, true);
    var infoBtn = button('More Info', 'info', function () { openItem(chosen()); });
    var myListBtn = button('My List', 'mylist', function () { var item = chosen(); toggleFavorite(item, function () { show(item); }); });
    var myListLabel = myListBtn.querySelector('span');
    [playBtn, infoBtn, myListBtn].forEach(function (b) { b._focus = function () { browsing = false; ambient(current); }; actions.appendChild(b); });
    spot.forEach(function () { dots.appendChild(el('b')); });
    if (!spot.length) hero.style.display = 'none';
    scroller.appendChild(hero);

    var rows = C.homeRows(state.items, {
      continueWatching: P.progress.continueWatching(state.items, state.progress),
      favorites: C.byIds(state.items, state.favorites),
    });
    rows.forEach(function (r) {
      scroller.appendChild(row(r.id, r.title, r.items, {
        wide: r.wide,
        continueRow: r.id === 'continue',
        onFocus: function (item) { browsing = true; ambient(item); },
      }));
    });
    node.appendChild(scroller);

    if (spot.length) {
      show(spot[state.spotlightIndex % spot.length]);
      resume = P.progress.resumePosition(state.progress, current.id);
      playBtn.querySelector('span').textContent = resume ? 'Resume' : 'Play';
    }
    if (spot.length > 1) {
      rotate = setInterval(function () {
        if (browsing || !document.body.contains(node) || !dom.dialog.classList.contains('hidden')) return;
        // Hold the spotlight while the viewer is using the remote; rotate only after they stop.
        if (Date.now() - lastKeyAt < SPOTLIGHT_HOLD_MS) return;
        previous = current;
        rotatedAt = Date.now();
        state.spotlightIndex = (state.spotlightIndex + 1) % spot.length;
        show(spot[state.spotlightIndex]);
        syncPlayLabel();
      }, SPOTLIGHT_INTERVAL_MS);
    }

    return {
      el: node,
      navId: 'home',
      initialFocus: function () { return spot.length ? playBtn : node.querySelector('.card'); },
      leave: function () { if (rotate) clearInterval(rotate); },
      rebuild: homeScreen,
      onBack: function () {
        if (focused && closest(focused, 'row')) { setFocus(spot.length ? playBtn : node.querySelector('.card')); return true; }
        confirmExit();
        return true;
      },
    };
  }

  /* ================= grids ================= */
  function gridScreen(navId, title, itemsFn, emptyText) {
    if (state.catalogStatus !== 'ready') return statusScreen(navId);
    var items = itemsFn();
    var node = el('div', 'screen');
    var scroller = el('div', 'scroller');
    scroller.appendChild(el('div', 'screen-title', title));
    scroller.appendChild(el('div', 'screen-sub', items.length ? items.length + (items.length === 1 ? ' title' : ' titles') : ''));
    if (!items.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('strong', '', 'Nothing here yet'));
      empty.appendChild(document.createTextNode(emptyText));
      scroller.appendChild(empty);
    }
    var grid = el('div', 'grid');
    items.forEach(function (item, index) {
      var c = card(item, { onFocus: ambient });
      if (index % 7 === 0) c.classList.add('scroll-anchor');
      grid.appendChild(c);
    });
    scroller.appendChild(grid);
    node.appendChild(scroller);
    return {
      el: node,
      navId: navId,
      initialFocus: function () { return grid.querySelector('.card'); },
      rebuild: function () { return gridScreen(navId, title, itemsFn, emptyText); },
    };
  }

  function categoriesScreen() {
    if (state.catalogStatus !== 'ready') return statusScreen('categories');
    var node = el('div', 'screen');
    var scroller = el('div', 'scroller');
    scroller.appendChild(el('div', 'screen-title', 'Categories'));
    scroller.appendChild(el('div', 'screen-sub', 'Browse PROtv by genre and collection'));
    var wrap = el('div', 'grid');
    C.categories(state.items).forEach(function (category) {
      var tile = el('div', 'tile focusable');
      tile.appendChild(el('strong', '', category.title));
      tile.appendChild(el('span', '', category.items.length + (category.items.length === 1 ? ' title' : ' titles')));
      tile._select = function () {
        push(gridScreen('categories', category.title, function () {
          var fresh = C.categories(state.items).filter(function (c) { return c.id === category.id; })[0];
          return fresh ? fresh.items : [];
        }, 'No titles in this category yet.'));
      };
      wrap.appendChild(tile);
    });
    scroller.appendChild(wrap);
    node.appendChild(scroller);
    return { el: node, navId: 'categories', initialFocus: function () { return wrap.querySelector('.tile'); }, rebuild: categoriesScreen };
  }

  function myListScreen() {
    if (!accountService.current()) {
      return messageScreen('mylist', 'My List', 'Sign in to keep a list of titles to watch on every screen.', [
        { label: 'Sign in with phone or computer', icon: 'account', run: startActivation },
      ]);
    }
    return gridScreen('mylist', 'My List', function () { return C.byIds(state.items, state.favorites).slice().reverse(); },
      'Titles you add with My List appear here.');
  }

  function messageScreen(navId, title, text, actions) {
    var node = el('div', 'screen');
    var box = el('div', 'state');
    box.appendChild(el('h2', '', title));
    box.appendChild(el('p', '', text));
    var row = el('div', 'actions');
    actions.forEach(function (a, index) { row.appendChild(button(a.label, a.icon, a.run, index === 0)); });
    box.appendChild(row);
    node.appendChild(box);
    return { el: node, navId: navId, rebuild: function () { return buildRoot(navId); } };
  }

  /* ================= details ================= */
  function openItem(item) {
    if (!item) return;
    if (item.contentType === 'SERIES') { push(seriesScreen(item, null)); return; }
    push(detailsScreen(item));
  }

  function detailsScreen(item) {
    var node = el('div', 'screen');
    var wrap = el('div', 'details');
    var episode = item.contentType === 'EPISODE';
    var art = el('div', 'details-art' + (episode ? ' wide' : ''));
    if (item.artwork) { var img = new Image(); img.src = item.artwork; img.alt = item.title; art.appendChild(img); }
    else { art.appendChild(wordmark(320)); art.style.display = 'flex'; art.style.alignItems = 'center'; art.style.justifyContent = 'center'; }
    var copy = el('div', 'details-copy');
    var series = episode ? C.seriesFor(state.items, item) : null;
    copy.appendChild(el('div', 'eyebrow', C.isCreatorTitle(item) ? 'PROtv Creator Original' : (episode ? (item.seriesTitle || 'Episode') : (item.category || 'Movie'))));
    copy.appendChild(el('div', 'hero-title', episode ? (item.episodeTitle || item.title) : item.title));
    copy.appendChild(el('div', 'meta', (episode ? C.episodeLabel(item).split('  ')[0] + '  •  ' : '') + C.metadataLine(item)));
    copy.appendChild(el('div', 'summary', C.synopsis(item)));
    var credit = C.rightsLine(item);
    if (credit) copy.appendChild(el('div', 'credit', credit));
    var actions = el('div', 'actions');
    var resume = P.progress.resumePosition(state.progress, item.id);
    var primary = button(resume ? 'Resume ' + P.player.clock(resume) : 'Play', 'play', function () { playItem(item, resume); }, true);
    actions.appendChild(primary);
    if (resume) actions.appendChild(button('Start Over', 'restart', function () { playItem(item, 0); }));
    var fav = button(isFavorite(item.id) ? 'In My List' : 'My List', isFavorite(item.id) ? 'check' : 'mylist', function () {
      toggleFavorite(item, function () {
        var on = isFavorite(item.id);
        fav.querySelector('span').textContent = on ? 'In My List' : 'My List';
        fav.replaceChild(icon(on ? 'check' : 'mylist'), fav.firstChild);
      });
    });
    actions.appendChild(fav);
    if (series) actions.appendChild(button('All Episodes', 'series', function () { push(seriesScreen(series, item)); }));
    copy.appendChild(actions);
    wrap.appendChild(art);
    wrap.appendChild(copy);
    node.appendChild(wrap);
    ambient(item);
    return { el: node, initialFocus: function () { return primary; }, rebuild: function () { return detailsScreen(item); }, hideNavFocus: true, navId: (currentScreen() || {}).navId };
  }

  function seriesScreen(series, focusEpisode) {
    var node = el('div', 'screen');
    var head = el('div', 'details');
    var copy = el('div', 'details-copy');
    copy.appendChild(el('div', 'eyebrow', 'Series'));
    copy.appendChild(el('div', 'hero-title', series.title));
    copy.appendChild(el('div', 'meta', seasonsMeta(series)));
    copy.appendChild(el('div', 'summary', C.synopsis(series.episodes[0])));
    var seasonRow = el('div', 'seasons');
    copy.appendChild(seasonRow);
    head.appendChild(copy);
    node.appendChild(head);
    var episodesHost = el('div', 'episodes');
    node.appendChild(episodesHost);
    var selected = 0;
    if (focusEpisode) {
      series.seasons.forEach(function (season, index) {
        if (season.episodes.some(function (e) { return e.id === focusEpisode.id; })) selected = index;
      });
    }
    var buttons = [];
    function showSeason(index) {
      selected = index;
      episodesHost.innerHTML = '';
      var season = series.seasons[index];
      episodesHost.appendChild(row('season-' + index, season.title, season.episodes, {
        wide: true,
        onFocus: ambient,
      }));
      Array.prototype.forEach.call(episodesHost.querySelectorAll('.card'), function (c) {
        var ep = c._item;
        c._select = function () { push(detailsScreen(ep)); };
      });
      buttons.forEach(function (b, i) { b.classList.toggle('primary', i === index); });
    }
    series.seasons.forEach(function (season, index) {
      var b = button(season.title, '', function () { showSeason(index); var first = episodesHost.querySelector('.card'); if (first) setFocus(first); });
      b.classList.add('small');
      buttons.push(b);
      seasonRow.appendChild(b);
    });
    showSeason(selected);
    ambient(series);
    return {
      el: node,
      navId: (currentScreen() || {}).navId,
      initialFocus: function () {
        if (focusEpisode) {
          var match = Array.prototype.filter.call(episodesHost.querySelectorAll('.card'), function (c) { return c._item.id === focusEpisode.id; })[0];
          if (match) return match;
        }
        return episodesHost.querySelector('.card') || buttons[0];
      },
      rebuild: function () { return seriesScreen(series, focusEpisode); },
    };
  }

  /* ================= search ================= */
  var KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('');
  var searchQuery = '';

  function searchScreen() {
    if (state.catalogStatus !== 'ready') return statusScreen('search');
    var node = el('div', 'screen');
    var wrap = el('div', 'search');
    var keyboard = el('div', 'keyboard');
    var query = el('div', 'query');
    var keys = el('div', 'keys');
    var results = el('div', 'results');
    keyboard.appendChild(el('div', 'screen-title', 'Search'));
    keyboard.appendChild(query);
    keyboard.appendChild(keys);
    function key(label, onSelect, wide) {
      var k = el('div', 'key focusable' + (wide ? ' wide' : ''), label);
      k._select = onSelect;
      keys.appendChild(k);
      return k;
    }
    KEYS.forEach(function (ch) { key(ch, function () { type(ch.toLowerCase()); }); });
    key('Space', function () { type(' '); }, true);
    key('Delete', function () { backspace(); }, true);
    key('Clear', function () { searchQuery = ''; update(); }, true);

    function type(ch) {
      if (searchQuery.length >= 60) return;
      if (ch === ' ' && (!searchQuery || /\s$/.test(searchQuery))) return;
      searchQuery += ch;
      update();
    }
    function backspace() { searchQuery = searchQuery.slice(0, -1); update(); }

    var pending = null;
    function update() {
      query.innerHTML = '';
      if (searchQuery) query.appendChild(document.createTextNode(searchQuery));
      else query.appendChild(el('span', 'placeholder', 'Titles, genres, creators'));
      query.appendChild(el('span', 'caret'));
      if (pending) clearTimeout(pending);
      pending = setTimeout(renderResults, 120);
    }

    function renderResults() {
      results.innerHTML = '';
      var q = searchQuery.trim();
      if (!q) {
        var hint = el('div', 'empty');
        hint.appendChild(el('strong', '', 'Find something to watch'));
        hint.appendChild(document.createTextNode('Search movies, series, genres and PROtv creators.'));
        results.appendChild(hint);
        return;
      }
      var found = C.search(state.items, q);
      if (!found.total) {
        var none = el('div', 'empty');
        none.appendChild(el('strong', '', 'No results for “' + q + '”'));
        none.appendChild(document.createTextNode('Try a different title, genre or creator.'));
        results.appendChild(none);
        return;
      }
      results.appendChild(el('div', 'screen-sub', found.total + (found.total === 1 ? ' result' : ' results')));
      var grid = el('div', 'grid');
      found.movies.concat(found.episodes).forEach(function (item) { grid.appendChild(card(item, { onFocus: ambient })); });
      results.appendChild(grid);
    }

    wrap.appendChild(keyboard);
    wrap.appendChild(results);
    node.appendChild(wrap);
    update();
    renderResults();
    ambient(null);
    return {
      el: node,
      navId: 'search',
      initialFocus: function () { return keys.querySelector('.key'); },
      rebuild: searchScreen,
      onText: function (ch) { type(ch); return true; },
      onDelete: function () { backspace(); return true; },
    };
  }

  /* ================= account ================= */
  function accountScreen() {
    var node = el('div', 'screen');
    var box = el('div', 'state');
    box.style.top = '150px';
    var panel = el('div', 'panel');
    var session = accountService.current();
    var actions = el('div', 'actions');
    if (session) {
      panel.appendChild(el('h2', '', 'You’re signed in'));
      panel.appendChild(el('p', '', (session.email ? 'Signed in as ' + session.email + '. ' : '') + 'My List and Continue Watching stay in sync with watchprotv.com and your other PROtv devices.'));
      actions.appendChild(button('Sync now', 'restart', function () { syncAccount(true); }, true));
      actions.appendChild(button('Sign out', 'account', function () {
        dialog('Sign out of PROtv?', 'This TV will stop syncing My List and Continue Watching. Your account is not affected.', [
          { label: 'Cancel' },
          { label: 'Sign out', run: signOut },
        ]);
      }));
    } else {
      panel.appendChild(el('h2', '', 'Sign in to PROtv'));
      panel.appendChild(el('p', '', accountService.configured()
        ? 'Use your phone or computer — no typing passwords with the remote. Keep My List and Continue Watching in sync everywhere you watch. It’s free.'
        : 'Account sign-in is not available in this build. You can keep watching as a guest.'));
      if (accountService.configured()) actions.appendChild(button('Sign in with phone or computer', 'account', startActivation, true));
      actions.appendChild(button('Clear history on this TV', 'restart', function () {
        dialog('Clear watch history on this TV?', 'Continue Watching for guests on this TV will be removed.', [
          { label: 'Cancel' },
          { label: 'Clear', run: function () { state.progress = {}; try { storage.removeItem(GUEST_PROGRESS_KEY); } catch (e) { /* ignore */ } toast('Watch history cleared.'); } },
        ]);
      }));
    }
    panel.appendChild(actions);
    var info = el('div', 'settings');
    [['Privacy policy', 'watchprotv.com/privacy'], ['Terms of use', 'watchprotv.com/terms'], ['Help & support', config.supportEmail + '  •  watchprotv.com/contact'],
      ['App version', config.version + (config.build && config.build !== 'release' ? ' (' + config.build + ')' : '')], ['Publisher', 'Prophecy Entertainment LLC']].forEach(function (pair) {
      var line = el('div');
      line.appendChild(el('b', '', pair[0] + ':  '));
      line.appendChild(document.createTextNode(pair[1]));
      info.appendChild(line);
    });
    panel.appendChild(info);
    box.appendChild(panel);
    node.appendChild(box);
    ambient(null);
    return { el: node, navId: 'account', rebuild: accountScreen };
  }

  var activation = null;
  function startActivation() {
    if (activation) activation.cancel();
    var node = el('div', 'screen');
    var box = el('div', 'state');
    box.style.top = '130px';
    var panel = el('div', 'panel');
    panel.appendChild(el('h2', '', 'Sign in with your phone or computer'));
    var steps = el('p', '', 'Getting your code…');
    panel.appendChild(steps);
    var code = el('div', 'code', '————-————');
    var url = el('div', 'url', '');
    var status = el('div', 'status-line');
    var statusText = el('span', '', 'Waiting for approval…');
    status.appendChild(el('div', 'spinner small'));
    status.appendChild(statusText);
    panel.appendChild(url);
    panel.appendChild(code);
    panel.appendChild(status);
    var actions = el('div', 'actions');
    var newCode = button('Get a new code', 'restart', function () { startActivation(); });
    actions.appendChild(button('Cancel', '', function () { cancelActivation(); pop(); }, true));
    actions.appendChild(newCode);
    panel.appendChild(actions);
    box.appendChild(panel);
    node.appendChild(box);
    var countdown = null;

    function begin() {
      activation = accountService.startActivation({
        onCode: function (pending) {
          var shown = pending.verificationUrl.replace(/^https:\/\//, '');
          steps.textContent = '1. On your phone or computer, go to the address below.  2. Sign in to PROtv (or create a free account).  3. Enter this code.';
          url.textContent = shown;
          code.textContent = pending.userCode;
          if (countdown) clearInterval(countdown);
          countdown = setInterval(function () {
            var left = Math.max(0, Math.round((pending.expiresAtMs - Date.now()) / 1000));
            statusText.textContent = 'Waiting for approval…  Code expires in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
          }, 1000);
        },
        onExpired: function () {
          if (countdown) clearInterval(countdown);
          statusText.textContent = 'This code expired. Get a new code to try again.';
          code.style.opacity = '.35';
          setFocus(newCode);
        },
        onError: function (kind) {
          if (countdown) clearInterval(countdown);
          var messages = {
            network: 'We can’t reach PROtv. Check your connection and get a new code.',
            'rate-limited': 'Too many sign-in attempts. Wait a minute, then get a new code.',
            consumed: 'This code was already used. Get a new code to sign in again.',
            firebase: 'Sign-in could not be completed. Get a new code to try again.',
            'not-configured': 'Account sign-in is not available in this build.',
          };
          statusText.textContent = messages[kind] || 'Sign-in could not be completed. Get a new code to try again.';
          setFocus(newCode);
        },
        onSignedIn: function (session) {
          if (countdown) clearInterval(countdown);
          activation = null;
          toast(session.email ? 'Signed in as ' + session.email : 'You’re signed in.');
          syncAccount(false).then(function () { goRoot('home', true); });
        },
      });
    }
    var screen = {
      el: node,
      navId: 'account',
      hideNav: true,
      isActivation: true,
      initialFocus: function () { return actions.querySelector('.focusable'); },
      leave: function () { if (countdown) clearInterval(countdown); },
      onBack: function () { cancelActivation(); pop(); return true; },
    };
    var top = currentScreen();
    if (top && top.isActivation) replaceTop(screen); else push(screen);
    begin();
    return screen;
  }

  function cancelActivation() {
    if (activation) { activation.cancel(); activation = null; }
  }

  function signOut() {
    flushAll();
    accountService.signOut();
    state.favorites = [];
    state.favoritesLoaded = false;
    state.progress = P.progress.parse(storageGet(GUEST_PROGRESS_KEY));
    toast('You’re signed out. You can keep watching as a guest.');
    goRoot('account', true);
  }

  function storageGet(key) { try { return storage.getItem(key); } catch (e) { return null; } }

  /* ================= account data: favorites + progress ================= */
  function isFavorite(id) { return state.favorites.indexOf(id) >= 0; }

  function toggleFavorite(item, after) {
    if (!item) return;
    if (!accountService.current()) {
      dialog('Sign in to use My List', 'Sign in with your phone or computer to save titles and watch them on any screen.', [
        { label: 'Sign in', icon: 'account', run: startActivation },
        { label: 'Not now' },
      ]);
      return;
    }
    var on = !isFavorite(item.id);
    var before = state.favorites.slice();
    state.favorites = on ? state.favorites.concat([item.id]) : state.favorites.filter(function (id) { return id !== item.id; });
    if (after) after();
    accountService.authorized('PUT', '/users/me/favorites/' + encodeURIComponent(item.id), { favorite: on }).then(function (response) {
      if (response.status === 200) { toast(on ? 'Added to My List' : 'Removed from My List', 2500); return; }
      state.favorites = before;
      if (after) after();
      toast('My List couldn’t be updated. Please try again.');
    }, function () {
      state.favorites = before;
      if (after) after();
      toast('My List couldn’t be updated. Please try again.');
    });
  }

  function syncAccount(announce) {
    if (!accountService.current()) return Promise.resolve();
    var viewer = accountService.current().uid;
    var favorites = accountService.authorized('GET', '/users/me/favorites').then(function (response) {
      if (!accountService.current() || accountService.current().uid !== viewer) return;
      if (response.status === 200 && Array.isArray(response.body)) {
        state.favorites = response.body.filter(function (id) { return typeof id === 'string'; });
        state.favoritesLoaded = true;
      }
    });
    var progress = accountService.authorized('GET', '/users/me/progress').then(function (response) {
      if (!accountService.current() || accountService.current().uid !== viewer) return;
      if (response.status === 200 && response.body && typeof response.body === 'object') {
        // Positions saved on this TV but not yet accepted by the server stay newer than the server copy.
        var merged = P.progress.parse(JSON.stringify(response.body));
        Object.keys(pendingProgress).forEach(function (id) { merged = P.progress.record(merged, id, pendingProgress[id], 100000); });
        state.progress = merged;
      }
    });
    return Promise.all([favorites, progress]).then(function () {
      state.accountSyncedAt = Date.now();
      if (announce) toast('Your PROtv account is up to date.', 3000);
    }, function () {
      if (announce) toast('We couldn’t sync right now. We’ll try again later.');
    });
  }

  // My List and Continue Watching change on the website and other devices too: refresh them (at most every
  // ACCOUNT_STALE_MS) when PROtv returns to the foreground or the viewer opens Home or My List, and redraw
  // only when something changed and the viewer is on that top-level screen.
  var ACCOUNT_STALE_MS = 30 * 1000;
  function refreshAccount() {
    if (!accountService.current() || Date.now() - state.accountSyncedAt < ACCOUNT_STALE_MS) return;
    state.accountSyncedAt = Date.now();
    var before = JSON.stringify([state.favorites, state.progress]);
    syncAccount(false).then(function () {
      if (JSON.stringify([state.favorites, state.progress]) === before) return;
      var top = currentScreen();
      if (top && state.stack.length === 1 && (top.navId === 'home' || top.navId === 'mylist') && !state.navOpen
        && dom.player.classList.contains('hidden') && dom.dialog.classList.contains('hidden')) rebuildTop();
    });
  }

  var pendingProgress = {};
  function saveProgress(item, position, duration, force) {
    var entry = P.progress.entry(position, duration, Date.now());
    if (!accountService.current()) {
      state.progress = P.progress.record(state.progress, item.id, entry, P.progress.GUEST_LIMIT);
      try { storage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(state.progress)); } catch (e) { /* storage full */ }
      return;
    }
    state.progress = P.progress.record(state.progress, item.id, entry, 100000);
    pendingProgress[item.id] = entry;
    var viewer = accountService.current().uid;
    accountService.authorized('PUT', '/users/me/progress/' + encodeURIComponent(item.id), {
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
    }).then(function (response) {
      if (response.status === 200 && pendingProgress[item.id] === entry) delete pendingProgress[item.id];
      else if (response.status !== 200 && force && accountService.current() && accountService.current().uid === viewer) {
        // Kept in pendingProgress and retried on the next sync/resume.
      }
    }, function () { /* retried later */ });
  }

  function flushPending() {
    if (!accountService.current()) return;
    Object.keys(pendingProgress).forEach(function (id) {
      var entry = pendingProgress[id];
      accountService.authorized('PUT', '/users/me/progress/' + encodeURIComponent(id), {
        positionSeconds: entry.positionSeconds, durationSeconds: entry.durationSeconds,
      }).then(function (response) { if (response.status === 200 && pendingProgress[id] === entry) delete pendingProgress[id]; }, function () {});
    });
  }

  function flushAll() {
    if (session.item()) session.pause();
  }

  /* ================= player ================= */
  var playerContext = null;
  var avplay = webapis && webapis.avplay ? webapis.avplay : null;
  var html5Video = null;

  var session = P.player.createSession({
    createAdapter: function (events) {
      if (avplay) return new P.player.AVPlayAdapter(avplay, events);
      if (!html5Video) {
        html5Video = document.createElement('video');
        html5Video.id = 'video';
        html5Video.setAttribute('playsinline', '');
        dom.player.insertBefore(html5Video, dom.osd);
        var object = document.getElementById('av-player');
        if (object) object.style.display = 'none';
      }
      return new P.player.Html5Adapter(html5Video, events);
    },
    authorize: function (item) {
      return http('GET', config.apiBase + '/v1/catalog/titles/' + encodeURIComponent(item.id) + '/playback', {}).then(function (response) {
        if (response.status === 404) return { error: 'unavailable' };
        if (response.status !== 200) return { error: response.status === 0 ? 'network' : 'authorize' };
        var policy = config.previewAllowlist && config.previewAllowlist.length && response.body && response.body.platformPolicy !== C.POLICY
          ? (config.previewAllowlist.indexOf(item.id) >= 0 ? null : C.POLICY)
          : C.POLICY;
        return P.player.streamUrl(response.body, policy);
      });
    },
    saveProgress: saveProgress,
    onState: function (s) { osd.render(s); },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimer: function (id) { clearTimeout(id); },
    isOnline: online,
  });

  function screenSaver(on) {
    try {
      webapis.appcommon.setScreenSaver(on ? webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON : webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (error) { /* not a Samsung TV */ }
  }

  function playItem(item, resumeSeconds) {
    if (!item) return;
    if (item.contentType === 'SERIES') { openItem(item); return; }
    var start = resumeSeconds === undefined ? P.progress.resumePosition(state.progress, item.id) : resumeSeconds;
    playerContext = { item: item, returnFocus: focused, next: nextEpisode(item) };
    dom.player.classList.remove('hidden');
    screenSaver(false);
    osd.build(item);
    session.start(item, start);
  }

  function nextEpisode(item) {
    if (item.contentType !== 'EPISODE') return null;
    var series = C.seriesFor(state.items, item);
    if (!series) return null;
    for (var i = 0; i < series.episodes.length - 1; i += 1) if (series.episodes[i].id === item.id) return series.episodes[i + 1];
    return null;
  }

  function closePlayer() {
    session.stop();
    screenSaver(true);
    dom.player.classList.add('hidden');
    osd.clear();
    var ctx = playerContext;
    playerContext = null;
    var top = currentScreen();
    var anchor = ctx && ctx.returnFocus && document.body.contains(ctx.returnFocus) ? ctx.returnFocus : null;
    if (top && top.rebuild) rebuildTop(anchor);
    else if (anchor) setFocus(anchor);
  }

  var osd = (function () {
    var parts = {};
    var hideTimer = null;
    var visible = true;

    function build(item) {
      dom.osd.innerHTML = '';
      var top = el('div', 'osd-top');
      top.appendChild(el('div', 'eyebrow', item.contentType === 'EPISODE' ? (item.seriesTitle || 'Episode') : (C.isCreatorTitle(item) ? 'PROtv Creator Original' : 'Now playing')));
      top.appendChild(el('div', 'osd-title', item.contentType === 'EPISODE' ? C.episodeLabel(item) : item.title));
      var center = el('div', 'osd-center');
      var bottom = el('div', 'osd-bottom');
      var scrub = el('div', 'scrub focusable');
      var track = el('div', 'scrub-track');
      var fill = el('div', 'scrub-fill');
      var head = el('div', 'scrub-head');
      var target = el('div', 'scrub-target hidden');
      track.appendChild(fill); track.appendChild(head); track.appendChild(target);
      scrub.appendChild(track);
      scrub._select = function () { session.toggle(); };
      var times = el('div', 'times');
      var elapsed = el('span', '', '0:00');
      var total = el('span', '', '');
      times.appendChild(elapsed); times.appendChild(total);
      var actions = el('div', 'actions');
      var toggleBtn = button('Pause', 'pause', function () { session.toggle(); }, true);
      actions.appendChild(button('Back 10s', 'back10', function () { session.seekBy(-10); }));
      actions.appendChild(toggleBtn);
      actions.appendChild(button('Forward 10s', 'fwd10', function () { session.seekBy(10); }));
      actions.appendChild(button('Start Over', 'restart', function () { session.seekTo(0); }));
      var nextBtn = null;
      if (playerContext && playerContext.next) {
        var upNext = playerContext.next;
        nextBtn = button('Next Episode', 'next', function () { session.stop(); playItem(upNext, P.progress.resumePosition(state.progress, upNext.id)); });
        actions.appendChild(nextBtn);
      }
      bottom.appendChild(scrub); bottom.appendChild(times); bottom.appendChild(actions);
      dom.osd.appendChild(top); dom.osd.appendChild(center); dom.osd.appendChild(bottom);
      parts = { scrub: scrub, fill: fill, head: head, target: target, elapsed: elapsed, total: total, center: center, toggle: toggleBtn, actions: actions, next: nextBtn, phase: '' };
      setFocus(scrub);
      show();
    }

    function render(s) {
      if (!parts.scrub) return;
      var duration = s.duration || 0;
      var shownPosition = s.seekTarget !== null && s.seekTarget !== undefined ? s.seekTarget : s.position;
      var pct = duration > 0 ? Math.min(100, (s.position / duration) * 100) : 0;
      parts.fill.style.width = pct + '%';
      var headPct = duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0;
      parts.head.style.left = headPct + '%';
      if (s.seekTarget !== null && s.seekTarget !== undefined) {
        parts.target.classList.remove('hidden');
        parts.target.style.left = headPct + '%';
        parts.target.textContent = P.player.clock(s.seekTarget);
      } else parts.target.classList.add('hidden');
      parts.elapsed.textContent = P.player.clock(shownPosition);
      parts.total.textContent = duration ? '-' + P.player.clock(Math.max(0, duration - shownPosition)) : '';
      var playing = s.phase === 'playing';
      parts.toggle.querySelector('span').textContent = playing || s.phase === 'buffering' ? 'Pause' : 'Play';
      parts.toggle.replaceChild(icon(playing || s.phase === 'buffering' ? 'pause' : 'play'), parts.toggle.firstChild);
      if (parts.phase !== s.phase) {
        parts.phase = s.phase;
        parts.center.innerHTML = '';
        if (s.phase === 'loading' || s.phase === 'buffering' || s.phase === 'recovering') {
          parts.center.appendChild(el('div', 'spinner'));
          if (s.phase === 'recovering') parts.center.appendChild(el('div', 'osd-message', online() ? 'Reconnecting…' : 'You’re offline. Playback resumes when you reconnect.'));
        } else if (s.phase === 'error') {
          var msg = el('div', 'osd-message');
          msg.appendChild(el('strong', '', s.error === 'unavailable' || s.error === 'policy' ? 'This title isn’t available' : 'We couldn’t play this title'));
          msg.appendChild(document.createTextNode(s.error === 'unavailable' || s.error === 'policy'
            ? 'It may no longer be offered on Samsung TVs.'
            : (online() ? 'Please try again in a moment.' : 'Check your TV’s network connection and try again.')));
          parts.center.appendChild(msg);
          setActionsForError(s.error);
        } else if (s.phase === 'ended') {
          parts.center.appendChild(el('div', 'osd-message', parts.next ? 'Up next: ' + C.episodeLabel(playerContext.next) : 'Thanks for watching'));
          if (parts.next) setFocus(parts.next);
        }
        if (s.phase === 'paused' || s.phase === 'ended' || s.phase === 'error') show(true);
        else if (s.phase === 'playing') show();
      }
    }

    function setActionsForError(code) {
      parts.actions.innerHTML = '';
      if (code !== 'unavailable' && code !== 'policy') parts.actions.appendChild(button('Try again', 'restart', function () { session.retry(); rebuildControls(); }, true));
      parts.actions.appendChild(button('Back', '', closePlayer, code === 'unavailable' || code === 'policy'));
      setFocus(parts.actions.querySelector('.focusable'));
    }

    function rebuildControls() { if (playerContext) { var item = playerContext.item; build(item); } }

    function show(sticky) {
      visible = true;
      dom.osd.classList.remove('idle');
      if (hideTimer) clearTimeout(hideTimer);
      if (!sticky && session.state().phase === 'playing') {
        hideTimer = setTimeout(function () { if (session.state().phase === 'playing') hide(); }, OSD_HIDE_MS);
      }
    }

    function hide() {
      visible = false;
      dom.osd.classList.add('idle');
      if (parts.scrub && focused !== parts.scrub && closest(focused, 'osd')) setFocus(parts.scrub);
    }

    function clear() {
      if (hideTimer) clearTimeout(hideTimer);
      dom.osd.innerHTML = '';
      parts = {};
    }

    function key(name) {
      var wasVisible = visible;
      if (name === 'back' || name === 'stop') { closePlayer(); return; }
      var phase = session.state().phase;
      if (name === 'playpause' || name === 'playpause_soft') { session.toggle(); show(); return; }
      if (name === 'play') { session.play(); show(); return; }
      if (name === 'pause') { session.pause(); show(true); return; }
      if (name === 'fastforward') { session.seekBy(30); show(); return; }
      if (name === 'rewind') { session.seekBy(-30); show(); return; }
      if (name === 'next' && parts.next) { parts.next._select(); return; }
      if (!wasVisible) {
        // First press only wakes the controls, except seeking which acts immediately.
        if (name === 'left' || name === 'right') { setFocus(parts.scrub); session.seekBy(name === 'right' ? 10 : -10); }
        show();
        return;
      }
      show(phase !== 'playing');
      if (focused === parts.scrub && (name === 'left' || name === 'right')) { session.seekBy(name === 'right' ? 10 : -10); return; }
      if (name === 'enter') { select(); return; }
      if (name === 'up' || name === 'down' || name === 'left' || name === 'right') move(name);
    }

    return { build: build, render: render, show: show, hide: hide, clear: clear, key: key };
  })();

  /* ================= key handling ================= */
  var SPOTLIGHT_INTERVAL_MS = 8000;
  var SPOTLIGHT_HOLD_MS = 8000;
  var SPOTLIGHT_GRACE_MS = 1200;
  var lastKeyAt = 0;

  function onKeyDown(event) {
    lastKeyAt = Date.now();
    var name = P.keys.name(event);
    var top = currentScreen();
    var playerOpen = !dom.player.classList.contains('hidden');
    var dialogOpen = !dom.dialog.classList.contains('hidden');
    var code = event.keyCode || 0;

    if (!dialogOpen && !playerOpen && top && top.onText) {
      if (code === 8) { event.preventDefault(); top.onDelete(); return; }
      var ch = event.key && event.key.length === 1 ? event.key : '';
      if (ch && /[a-z0-9 ]/i.test(ch) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); top.onText(ch.toLowerCase()); return; }
    }
    if (!name) return;
    event.preventDefault();

    if (dialogOpen) {
      if (name === 'back') { closeDialog(); return; }
      if (name === 'enter') { select(); return; }
      if (name === 'left' || name === 'right' || name === 'up' || name === 'down') move(name);
      return;
    }
    if (playerOpen) { osd.key(name); return; }

    if (name === 'enter') { select(); return; }
    if (name === 'left' || name === 'right' || name === 'up' || name === 'down') { move(name); return; }
    if (name === 'back') { back(); return; }
    if ((name === 'play' || name === 'playpause') && focused && focused._item) { playItem(focused._item); }
  }

  function back() {
    var top = currentScreen();
    if (dom.nav.contains(focused) && top) {
      var restore = top.lastFocus && document.body.contains(top.lastFocus) ? top.lastFocus : null;
      if (state.stack.length > 1) { pop(); return; }
      if (top.navId !== 'home') { goRoot('home'); return; }
      if (restore) { setFocus(restore); return; }
      confirmExit();
      return;
    }
    if (top && top.onBack && top.onBack()) return;
    if (pop()) return;
    if (top && top.navId !== 'home') { goRoot('home'); return; }
    confirmExit();
  }

  /* ================= lifecycle ================= */
  function onVisibility() {
    if (document.hidden) {
      if (!dom.player.classList.contains('hidden')) session.suspend();
      return;
    }
    if (!dom.player.classList.contains('hidden')) { session.resume(); osd.show(true); }
    accountService.ensureFresh().then(function () { flushPending(); refreshAccount(); }, function () {});
    if (state.catalogStatus === 'ready' && Date.now() - state.catalogLoadedAt > CATALOG_STALE_MS && dom.player.classList.contains('hidden')) {
      loadCatalog(true).then(function () { var top = currentScreen(); if (top && top.navId === 'home' && state.stack.length === 1) rebuildTop(); });
    }
  }

  function onOnline() {
    dom.offline.classList.add('hidden');
    flushPending();
    if (state.catalogStatus === 'error') retryCatalog();
  }

  function onOffline() { dom.offline.classList.remove('hidden'); }

  function boot() {
    P.keys.register(tizenApi);
    renderNav();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (!online()) onOffline();
    state.progress = P.progress.parse(storageGet(GUEST_PROGRESS_KEY));
    var restored = accountService.restore();
    var started = Date.now();
    var accountReady = restored
      ? accountService.ensureFresh().then(function () { return syncAccount(false); }, function () { /* offline: keep session, retry later */ })
      : Promise.resolve();
    Promise.all([loadCatalog(false), accountReady]).then(function () {
      var wait = Math.max(0, 1400 - (Date.now() - started));
      setTimeout(function () {
        goRoot('home');
        dom.splash.className = 'gone';
        setTimeout(function () { dom.splash.style.display = 'none'; }, 700);
      }, wait);
    });
    accountService.onChange(function (current) { if (!current) { state.favorites = []; } });
  }

  window.PROtvApp = { state: state, version: config.version };
  boot();
})();
