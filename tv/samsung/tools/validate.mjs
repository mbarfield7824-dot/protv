// Validates a Tizen widget directory (default: app/) against the rules this project can check
// without the Samsung SDK: config.xml structure, referenced files, ES2017 syntax for Chromium 56
// (Tizen 4.0), CSS features unsupported there, PNG icon, and forbidden secrets/files.
// This is NOT the Samsung certification validator; run `tizen package` / Seller Office checks too.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const here = dirname(fileURLToPath(import.meta.url));

const ALLOWED_PRIVILEGES = new Set([
  'http://tizen.org/privilege/internet',
  'http://tizen.org/privilege/tv.inputdevice',
]);

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}

function attr(tag, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function validateWidget(root, { release = false } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);

  const configPath = join(root, 'config.xml');
  if (!existsSync(configPath)) return { errors: ['config.xml is missing'], warnings };
  const xml = readFileSync(configPath, 'utf8');
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail('config.xml must start with an XML declaration (UTF-8)');
  const widget = /<widget\s[^>]*>/.exec(xml)?.[0] || '';
  if (attr(widget, 'xmlns') !== 'http://www.w3.org/ns/widgets') fail('widget xmlns must be http://www.w3.org/ns/widgets');
  if (attr(widget, 'xmlns:tizen') !== 'http://tizen.org/ns/widgets') fail('widget xmlns:tizen must be http://tizen.org/ns/widgets');
  const version = attr(widget, 'version') || '';
  const parts = version.split('.').map(Number);
  if (!/^\d+\.\d+\.\d+$/.test(version) || parts[0] > 255 || parts[1] > 255 || parts[2] > 65535) fail(`widget version "${version}" must be x.y.z (<=255.255.65535)`);
  if (!/^https?:\/\/\S+$/.test(attr(widget, 'id') || '')) fail('widget id must be a URI');
  const app = /<tizen:application\s[^>]*\/>/.exec(xml)?.[0] || '';
  const pkg = attr(app, 'package') || '';
  const appId = attr(app, 'id') || '';
  if (!/^[0-9a-zA-Z]{10}$/.test(pkg)) fail(`tizen:application package "${pkg}" must be exactly 10 alphanumeric characters`);
  if (!new RegExp(`^${pkg}\\.[0-9a-zA-Z]{1,52}$`).test(appId)) fail(`tizen:application id "${appId}" must be <package>.<name>`);
  const required = attr(app, 'required_version') || '';
  if (!/^\d+\.\d+$/.test(required)) fail('tizen:application required_version must be like 4.0');
  if (!/<tizen:profile name="tv-samsung"\/>/.test(xml)) fail('tizen:profile must be tv-samsung');
  const contentSrc = attr(/<content\s[^>]*\/>/.exec(xml)?.[0] || '', 'src');
  if (!contentSrc || !existsSync(join(root, contentSrc))) fail('content src must reference an existing start page');
  const iconSrc = attr(/<icon\s[^>]*\/>/.exec(xml)?.[0] || '', 'src');
  if (!iconSrc || !existsSync(join(root, iconSrc))) fail('icon src must reference an existing PNG');
  else {
    const size = pngSize(readFileSync(join(root, iconSrc)));
    if (!size) fail('icon must be a PNG');
    else if (size.width !== 512 || size.height !== 423) warnings.push(`icon is ${size.width}x${size.height}; Samsung TV app icons are 512x423`);
  }
  if (!/<name>[^<]{1,50}<\/name>/.test(xml)) fail('name is required (1-50 characters)');
  for (const match of xml.matchAll(/<tizen:privilege name="([^"]+)"\/>/g)) {
    if (!ALLOWED_PRIVILEGES.has(match[1])) fail(`privilege not reviewed for this app: ${match[1]}`);
  }
  if (!/<tizen:setting [^>]*hwkey-event="enable"/.test(xml)) fail('tizen:setting hwkey-event must be enable (Back key)');

  // Start page references.
  if (contentSrc && existsSync(join(root, contentSrc))) {
    const html = readFileSync(join(root, contentSrc), 'utf8');
    for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
      const ref = match[1];
      if (ref.startsWith('$WEBAPIS/')) continue;
      if (/^https?:/.test(ref)) { fail(`start page loads remote code: ${ref}`); continue; }
      if (!existsSync(join(root, ref))) fail(`start page references a missing file: ${ref}`);
    }
  }

  const files = walk(root);
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/');
    const ext = extname(file).toLowerCase();
    const base = rel.split('/').pop();
    if (/^\.env/.test(base) || ['.p12', '.pem', '.key', '.cer', '.crt', '.keystore', '.jks'].includes(ext) || base === 'profiles.xml') {
      fail(`forbidden file in package: ${rel}`);
    }
    if (['.js', '.json', '.html', '.css', '.xml'].includes(ext)) {
      const source = readFileSync(file, 'utf8');
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"\s*:|sk_live_|MUX_TOKEN_SECRET/.test(source)) fail(`secret material in ${rel}`);
      if (ext === '.js') {
        try {
          acorn.parse(source, { ecmaVersion: 2017, sourceType: 'script' });
        } catch (error) {
          fail(`${rel}: not valid ES2017 for Tizen 4.0 / Chromium 56 (${error.message})`);
        }
      }
      if (ext === '.css') {
        const banned = [[/(^|[;\s{])inset\s*:/, 'inset'], [/(^|[;\s{])gap\s*:/, 'flex/grid gap'], [/aspect-ratio\s*:/, 'aspect-ratio'],
          [/:is\(|:where\(|:has\(/, ':is/:where/:has'], [/\bclamp\(|[^-]\bmin\(|[^-]\bmax\(/, 'clamp/min/max']];
        for (const [pattern, label] of banned) if (pattern.test(source)) fail(`${rel}: ${label} is not supported on Chromium 56`);
      }
    }
  }
  if (release) {
    const configJs = join(root, 'js/config.js');
    const text = existsSync(configJs) ? readFileSync(configJs, 'utf8') : '';
    if (!/previewAllowlist:\s*\[\]/.test(text)) fail('release builds must not carry a preview allowlist');
    if (!/build:\s*"release"/.test(text)) fail('release builds must be built as the "release" flavor');
    if (!/apiBase:\s*"https:\/\/watchprotv\.com\/api"/.test(text)) fail('release builds must use the production API');
  }
  return { errors, warnings, files: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || join(here, '..', 'app'));
  const result = validateWidget(root, { release: process.argv.includes('--release') });
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
  for (const error of result.errors) console.log(`error:   ${error}`);
  console.log(`${result.errors.length ? 'INVALID' : 'VALID'}: ${relative(process.cwd(), root) || '.'} (${result.files || 0} files, ${result.errors.length} errors, ${result.warnings.length} warnings)`);
  process.exit(result.errors.length ? 1 : 0);
}
