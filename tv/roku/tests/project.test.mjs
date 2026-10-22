import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import { root, packageBytes } from '../tools/package.mjs';

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
  const art = /<Poster id="art" width="(\d+)" height="(\d+)" loadDisplayMode="([^"]+)"/.exec(xml);
  assert.ok(art);
  assert.equal(Number(art[1]) / Number(art[2]), 2 / 3);
  assert.equal(art[3], 'scaleToFit');
  const code = await readFile(path.join(root, 'components', 'PosterCard.brs'), 'utf8');
  assert.match(code, /width = 256\s+height = 144/);
  assert.match(code, /progressPercent/);
  assert.match(xml, /id="progressTrack"/);
  const scene = await readFile(path.join(root, 'components', 'ProtvScene.xml'), 'utf8');
  assert.match(scene, /<Video[^>]+enableUI="true"/);
  assert.match(scene, /translation="\[64,350\]"/);
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
  assert.doesNotMatch(`${scene}\n${http}`, /roRegistrySection|registrySection|WriteAsciiFile/);
  assert.match(scene, /m\.account = invalid/);
  assert.match(scene, /m\.progress = \{\}/);
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
  assert.equal(names.length, 10);
  assert.ok(names.every(name => name === 'manifest' || /^(source|components)\/[\w]+\.(brs|xml)$/.test(name)));
  assert.match(strFromU8(files.manifest), /^supports_input_launch=1$/m);
  const firebaseConfig = strFromU8(files['source/firebaseConfig.brs']);
  const configuredApiKey = process.env.ROKU_FIREBASE_API_KEY || '';
  if (configuredApiKey) assert.ok(firebaseConfig.includes(JSON.stringify(configuredApiKey)));
  else assert.match(firebaseConfig, /return ""/);
  assert.ok(names.every(name => !/key|pem|json|node_modules|test|env/i.test(name)));
});
