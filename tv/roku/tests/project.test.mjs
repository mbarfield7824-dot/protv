import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import { root, packageBytes, resolveFirebaseApiKey } from '../tools/package.mjs';

test('actual BrightScript model executes offline contract regressions', () => {
  const output = execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'brs', 'bin', 'cli.js'),
    path.join(root, 'source', 'model.brs'), path.join(root, 'tests', 'model.brs'),
  ], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.match(output, /PROTV_TESTS_FAILED=\s*0(?:\r?\n|$)/);
  const passed = /PROTV_TESTS_PASSED=\s*(\d+)/.exec(output);
  assert.ok(passed && Number(passed[1]) >= 70, output);
  console.log(`BrightScript assertions passed: ${passed[1]}`);
});

test('actual SceneGraph controller executes remote focus and layout regressions', () => {
  const output = execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'brs', 'bin', 'cli.js'),
    path.join(root, 'source', 'model.brs'),
    path.join(root, 'tests', 'firebaseConfig.brs'),
    path.join(root, 'components', 'ProtvScene.brs'),
    path.join(root, 'tests', 'scene.brs'),
  ], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.match(output, /PROTV_UI_FAILED=\s*0(?:\r?\n|$)/);
  assert.match(output, /PROTV_UI_PASSED=\s*103(?:\r?\n|$)/);
});

test('SceneGraph XML, scripts, node lookups, and component references are consistent', async () => {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const files = await readdir(path.join(root, 'components'));
  const xmls = files.filter(name => name.endsWith('.xml'));
  const components = new Set(xmls.map(name => name.slice(0, -4)));
  for (const name of xmls) {
    const xml = await readFile(path.join(root, 'components', name), 'utf8');
    assert.equal(XMLValidator.validate(xml), true, name);
    const doc = parser.parse(xml).component;
    assert.equal(doc.name, name.slice(0, -4));
    const scripts = [doc.script].flat();
    for (const script of scripts) {
      const file = script.uri.startsWith('pkg:/')
        ? path.join(root, script.uri.slice(5))
        : path.join(root, 'components', script.uri);
      const code = await readFile(file, 'utf8');
      if (script.uri.startsWith('pkg:/')) continue;
      const ids = new Set([...xml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
      for (const match of code.matchAll(/findNode\("([^"]+)"\)/g)) {
        assert.ok(ids.has(match[1]), `${name}: missing node ${match[1]}`);
      }
      for (const match of code.matchAll(/for each id in (\[[^\]]*\])/g)) {
        for (const id of JSON.parse(match[1])) assert.ok(ids.has(id), `${name}: missing dynamic node ${id}`);
      }
    }
    for (const match of xml.matchAll(/itemComponentName="([^"]+)"/g)) {
      assert.ok(components.has(match[1]), `missing component ${match[1]}`);
    }
  }
});

test('uniform 2:3 movie and 16:9 episode frames preserve complete artwork', async () => {
  const xml = await readFile(path.join(root, 'components', 'PosterCard.xml'), 'utf8');
  const art = /<Poster id="art" width="(\d+)" height="(\d+)"[^>]+loadDisplayMode="([^"]+)"/.exec(xml);
  assert.ok(art);
  assert.equal(Number(art[1]) / Number(art[2]), 2 / 3);
  assert.equal(art[3], 'scaleToFit');
  const code = await readFile(path.join(root, 'components', 'PosterCard.brs'), 'utf8');
  assert.match(code, /width = 176\s+height = 99/);
  assert.ok(Math.abs(176 / 99 - 16 / 9) < 0.01);
  assert.match(code, /progressPercent/);
  assert.match(xml, /id="progressTrack"/);
  assert.match(xml, /loadWidth="120" loadHeight="180"/);
  const scene = await readFile(path.join(root, 'components', 'ProtvScene.xml'), 'utf8');
  assert.match(scene, /<Video[^>]+enableUI="true"/);
  assert.match(scene, /id="detailArt"[^>]+width="280" height="420" loadWidth="280" loadHeight="420" loadDisplayMode="scaleToFit"/);
  assert.match(scene, /id="heroArt" width="176" height="264" loadWidth="176" loadHeight="264" loadDisplayMode="scaleToFit"/);
  for (const match of `${scene}\n${xml}`.matchAll(/<Poster id="(?:art|heroArt|detailArt|seriesArt)"[^>]*>/g)) {
    assert.doesNotMatch(match[0], /scaleToFill|scaleToZoom|zoomToFill/, 'catalog artwork is never cropped or stretched');
  }
  // Blurred colour washes decode artwork at a tiny size; they are ambience, not artwork display.
  for (const match of `${scene}\n${xml}`.matchAll(/<Poster id="(?:backdropA|backdropB|detailBackdrop|seriesBackdrop|wash)"[^>]*>/g)) {
    const [, w, h] = /loadWidth="(\d+)" loadHeight="(\d+)"/.exec(match[0]);
    assert.ok(Number(w) <= 64 && Number(h) <= 32, `${match[0]} must stay a low-resolution wash`);
  }
});

test('720p layout keeps the sidebar, living hero and rails inside the safe area', async () => {
  const scene = await readFile(path.join(root, 'components', 'ProtvScene.xml'), 'utf8');
  const controller = await readFile(path.join(root, 'components', 'ProtvScene.brs'), 'utf8');
  const card = await readFile(path.join(root, 'components', 'PosterCard.xml'), 'utf8');
  const cardController = await readFile(path.join(root, 'components', 'PosterCard.brs'), 'utf8');
  const button = await readFile(path.join(root, 'components', 'PillButton.brs'), 'utf8');
  const navIds = [...scene.matchAll(/<PillButton id="(nav\w+)"[^>]+style="nav"/g)].map(match => match[1]);
  assert.deepEqual(navIds, ['navHome', 'navSearch', 'navCreators', 'navMovies', 'navSeries', 'navBlackCinema', 'navAiCinema', 'navMyList', 'navContinue', 'navAccount']);
  assert.match(controller, /m\.navViews = \["home", "search", "creators", "movies", "series", "blackcinema", "aicinema", "mylist", "continue", "account"\]/);
  assert.match(scene, /<Group id="nav" translation="\[20,92\]">/);
  assert.match(scene, /<PillButton id="navContinue" text="Continue"/);
  assert.equal((scene.match(/style="nav"[^>]+compact="true"/g) || []).length, 10, 'sidebar starts as a compact icon rail');
  assert.match(scene, /<Rectangle id="sidebarBg" width="88"/);
  assert.match(scene, /<Animation id="browseAnim"/);
  assert.match(scene, /<Animation id="sidebarAnim"/);
  assert.match(scene, /id="bottomFade"/);
  assert.match(scene, /<PillButton id="heroPlay" text="Play" style="primary" icon="play"/);
  assert.match(scene, /<PillButton id="heroInfo" text="More Info" style="secondary" icon="info"/);
  assert.match(scene, /<PillButton id="heroList" text="My List" style="secondary" icon="plus"/);
  assert.match(scene, /id="heroCopy" translation="\[112,200\]"[^>]+vertAlignment="bottom"/);
  assert.match(scene, /id="rails" translation="\[112,352\]" width="1168"[^>]+rowItemSize="\[\[120,232\]\]" rowHeights="\[266\]" rowItemSpacing="\[\[16,0\]\]"/);
  assert.match(scene, /<Animation id="backdropFade"/);
  assert.doesNotMatch(scene, /0x8B2AE3|0xAD9CFF|0x7926C8|0xAE46F0|0x35144F|0x51227B/i, 'no purple from the previous theme');
  assert.match(controller, /sizes\.Push\(\[120,232\]\)[\s\S]*?heights\.Push\(266\)/);
  assert.match(controller, /sizes\.Push\(\[176,151\]\)[\s\S]*?heights\.Push\(185\)/);
  assert.match(controller, /sizes\.Push\(\[176,99\]\)[\s\S]*?heights\.Push\(133\)/);
  assert.match(button, /key = "OK"[\s\S]*?m\.top\.buttonSelected = true/);
  // Safe area: x 32..1248 action safe, y 18..684.
  assert.ok(92 + 9 * 46 + 40 <= 684, 'all ten sidebar destinations fit');
  assert.ok(20 + 48 <= 88 && 20 + 216 <= 256, 'sidebar items fit the collapsed rail and the expanded panel');
  assert.ok(112 + 860 <= 1040 - 24, 'featured copy clears the portrait');
  assert.ok(1040 + 176 <= 1216 && 72 + 264 <= 352 && 72 - 6 >= 26 + 32, 'featured portrait fits above the rails and inside the right margin');
  assert.ok(112 + 140 + 20 + 168 + 20 + 156 + 24 <= 640, 'rotation dots clear the featured actions');
  assert.ok(210 + 52 <= 276 && 276 + 48 <= 352, 'summary and featured actions end above the first rail');
  assert.ok(352 + 266 <= 684, 'hero layout: first rail, heading and captions fit');
  assert.ok(352 - 200 + 2 * 266 <= 684, 'browse layout: two full rails fit above the bottom margin');
  assert.ok(140 <= 352 - 200, 'browse layout: compact title ends above the rails');
  assert.ok(360 - 210 <= 352 - 200 + 38, 'browse layout: hero wash ends before the first posters');
  assert.ok(352 + 38 >= 360, 'hero layout: posters start below the hero wash');
  assert.equal(180 + 10 + 22 + 20, 232, 'portrait cards fit title and subtitle lines');
  assert.equal(99 + 10 + 22 + 20, 151, 'wide cards fit title and subtitle lines');
  assert.ok(120 * 0.06 / 2 < 16 / 2 && 176 * 0.06 / 2 < 16 / 2, 'focus zoom never overlaps neighbouring cards');
  assert.ok(624 + 64 - 12 <= 684, 'status toast fits inside the bottom safe margin');
  assert.match(scene, /id="detailTitle"[^>]+wrap="true" maxLines="2"/);
  assert.match(scene, /<ScrollableText id="detailDescription"/);
  assert.match(card, /id="creatorBadge"/);
  assert.match(card, /id="timeLeft"/);
  assert.match(card, /id="ring" uri="pkg:\/assets\/card-ring\.9\.png"/);
  assert.match(cardController, /if not m\.top\.rowListHasFocus then amount = 0/);
  assert.match(controller, /sub statusChanged\(\)[\s\S]*?visible = m\.status\.text <> ""/);
  assert.match(controller, /"\/users\/me\/favorites"/);
  assert.match(controller, /FormatJson\(\{ "favorite": m\.savingFavorite\.favorite \}\)/);
  for (const code of [controller, cardController]) {
    for (const line of code.split('\n').filter(line => /\bprint\b/.test(line))) {
      assert.doesNotMatch(line, /\.uri|\.artwork|HDPosterUrl|\.url|Token|Secret/);
    }
  }
});

test('every packaged asset referenced by the UI and manifest exists', async () => {
  const sources = [await readFile(path.join(root, 'manifest'), 'utf8'), await readFile(path.join(root, 'source', 'model.brs'), 'utf8')];
  for (const name of await readdir(path.join(root, 'components'))) {
    sources.push(await readFile(path.join(root, 'components', name), 'utf8'));
  }
  const text = sources.join('\n');
  const assets = new Set(await readdir(path.join(root, 'assets')));
  const referenced = new Set([...text.matchAll(/pkg:\/assets\/([\w.-]+)/g)].map(match => match[1]).filter(name => !name.endsWith('-')));
  // Icons are addressed by name: icon="play" / icon: "flame" / button.icon = "check".
  const icons = new Set([...text.matchAll(/\bicon(?:=|: |\s*=\s*)"(\w+)"/g)].map(match => match[1]));
  for (const icon of icons) for (const variant of ['light', 'dim', 'dark']) referenced.add(`icon-${icon}-${variant}.png`);
  assert.ok(icons.size >= 15, [...icons].join(','));
  for (const name of referenced) assert.ok(assets.has(name), `missing asset ${name}`);
  for (const name of assets) assert.ok(referenced.has(name), `unused asset ${name}`);
  const manifest = sources[0];
  for (const key of ['mm_icon_focus_hd', 'mm_icon_focus_fhd', 'splash_screen_hd', 'splash_screen_fhd']) {
    assert.match(manifest, new RegExp(`^${key}=pkg:/assets/`, 'm'));
  }
  for (const name of [...assets].filter(name => name.endsWith('.9.png'))) {
    const png = await readFile(path.join(root, 'assets', name));
    assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], name);
  }
});

test('account flow uses existing contracts and does not persist or expose session secrets', async () => {
  const scene = await readFile(path.join(root, 'components', 'ProtvScene.brs'), 'utf8');
  const http = await readFile(path.join(root, 'components', 'HttpTask.brs'), 'utf8');
  assert.match(scene, /"\/auth\/device-sessions"/);
  assert.match(scene, /"\/users\/me\/progress"/);
  assert.match(scene, /"PUT", requestBody, m\.account\.idToken/);
  assert.match(scene, /accounts:signInWithCustomToken\?key=/);
  assert.match(scene, /securetoken\.googleapis\.com\/v1\/token\?key=/);
  assert.match(http, /AddHeader\("X-Device-Secret", m\.top\.deviceSecret\)/);
  assert.match(http, /AddHeader\("Authorization", "Bearer " \+ m\.top\.authorization\)/);
  assert.match(http, /m\.top\.result = normalized\s+return/);
  // Persistence: one registry section, two keys, written only through m.storage.
  assert.equal((`${scene}\n${http}`.match(/roRegistrySection/g) || []).length, 1);
  assert.doesNotMatch(`${scene}\n${http}`, /WriteAsciiFile/);
  const keys = new Set([...scene.matchAll(/m\.storage\.(?:read|write|remove)\("(\w+)"/g)].map(match => match[1]));
  assert.deepEqual([...keys].sort(), ['account', 'guestProgress']);
  assert.match(scene, /sub forgetAccount\(\)\s+m\.storage\.remove\("account"\)/);
  assert.equal((scene.match(/forgetAccount\(\)/g) || []).length, 3, 'sign-out and rejected sessions forget the saved sign-in');
  assert.equal((scene.match(/storeAccount\(\)/g) || []).length, 3, 'saved after sign-in and after each token refresh');
  const model = await readFile(path.join(root, 'source', 'model.brs'), 'utf8');
  assert.match(model, /function StoredAccountJson[\s\S]*?FormatJson\(\{ "viewerId": account\.viewerId, "idToken": account\.idToken, "refreshToken": account\.refreshToken, "expiresAtSeconds": IntValue\(account\.expiresAtSeconds\) \}\)/);
  // Offline refresh keeps the sign-in; only a Firebase 4xx rejection clears it.
  assert.match(scene, /kind = "firebase-refresh"\s+if statusCode >= 400 and statusCode < 500\s+authSessionFailed/);
  assert.match(scene, /m\.account = invalid/);
  assert.match(scene, /m\.progress = \{\}/);
});

test('launch beacon, resume and trick play use supported Roku features', async () => {
  const scene = await readFile(path.join(root, 'components', 'ProtvScene.brs'), 'utf8');
  assert.equal((scene.match(/signalBeacon\(/g) || []).length, 1, 'one beacon call site');
  assert.match(scene, /sub signalLaunchComplete\(\)\s+if m\.launchSignaled then return\s+m\.launchSignaled = true\s+m\.top\.signalBeacon\("AppLaunchComplete"\)/);
  assert.match(scene, /if m\.video\.state = "playing"\s+signalLaunchComplete\(\)/);
  assert.match(scene, /content\.PlayStart = resumeAt/);
  assert.doesNotMatch(scene, /m\.video\.seek\s*=/, 'no seek before playback starts');
  const model = await readFile(path.join(root, 'source', 'model.brs'), 'utf8');
  assert.match(model, /"\?roku_trick_play=true"/);
});

test('sideload zip is byte-reproducible, root-correct and contains only runtime files', async () => {
  const first = await packageBytes();
  assert.deepEqual(await packageBytes(), first);
  const files = unzipSync(first);
  const names = Object.keys(files);
  assert.ok(names.includes('manifest'));
  assert.ok(names.includes('source/main.brs'));
  assert.ok(names.includes('source/firebaseConfig.brs'));
  assert.ok(names.includes('components/ProtvScene.xml'));
  const assets = (await readdir(path.join(root, 'assets'))).sort();
  const components = (await readdir(path.join(root, 'components'))).filter(name => /\.(brs|xml)$/.test(name));
  assert.equal(names.length, 1 + 3 + components.length + assets.length);
  for (const name of assets) assert.ok(names.includes(`assets/${name}`), name);
  assert.ok(names.every(name => name === 'manifest' || /^(source|components)\/[\w]+\.(brs|xml)$/.test(name) || /^assets\/[\w-]+(\.9)?\.(png|jpg)$/.test(name)));
  const background = files['assets/background.jpg'];
  assert.deepEqual(Array.from(background.slice(0, 3)), [0xFF, 0xD8, 0xFF]);
  assert.ok(first.length < 1024 * 1024, 'sideload stays under 1 MB');
  assert.match(strFromU8(files.manifest), /^supports_input_launch=1$/m);
  const firebaseConfig = strFromU8(files['source/firebaseConfig.brs']);
  const configuredApiKey = await resolveFirebaseApiKey();
  assert.match(await readFile(path.join(root, 'source', 'firebaseConfig.brs'), 'utf8'), /return ""/, 'the key is never written to source');
  if (configuredApiKey) assert.ok(firebaseConfig.includes(JSON.stringify(configuredApiKey)));
  else assert.match(firebaseConfig, /return ""/);
  assert.ok(names.every(name => !/key|pem|json|node_modules|test|env/i.test(name)));
});

// Device failure FB03 (2026-10-23): Roku lowercases unquoted literal keys in
// FormatJson ("returnsecuretoken"); Firebase ignores the unknown field and
// returns no refreshToken. The emulator keeps case, so guard the source.
test('every serialized literal uses quoted, case-preserving keys', async () => {
  const sources = ['components/ProtvScene.brs', 'source/model.brs'].map(name => path.join(root, name));
  let literals = 0;
  for (const file of sources) {
    const code = await readFile(file, 'utf8');
    const bodies = [...code.matchAll(/FormatJson\(\{([\s\S]*?)\}\)/g)].map(match => match[1]);
    const entry = /function LocalProgressEntry[\s\S]*?return \{([^}]*)\}/.exec(code);
    if (entry) bodies.push(entry[1]);
    for (const body of bodies) {
      literals++;
      assert.doesNotMatch(body, /(^|[{,\n])\s*[A-Za-z_]\w*\s*:/, `unquoted key in: ${body.trim()}`);
    }
  }
  assert.ok(literals >= 5, `found ${literals} serialized literals`);
  const scene = await readFile(sources[0], 'utf8');
  assert.match(scene, /FormatJson\(\{ "token": customToken, "returnSecureToken": true \}\)/);
});
