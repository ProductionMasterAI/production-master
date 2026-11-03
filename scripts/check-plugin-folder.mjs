#!/usr/bin/env node
/**
 * Guard the Claude Code plugin folder against the plugin-directory findings
 * that held v0.1.1 (5f553e2) in review.
 *
 * THE REAL QUESTION -----------------------------------------------------
 * "Would the directory raise a finding on the folder we submit?" The portal
 * reads and scans ONLY the plugin path given at submit time (`plugin/`), so
 * every check below runs against that folder exactly as the portal sees it —
 * not against the repo, and not against a file list someone remembered.
 *
 * Each check names the finding code it prevents:
 *   LOCKFILE_AUTO_INSTALL        no package.json / lockfile anywhere in plugin/
 *   ALLOWED_TOOLS_BROAD          every Bash rule is pinned to a file under
 *                                ${CLAUDE_PLUGIN_ROOT}; no bare Bash/Bash(*)
 *   MCP_FORWARDS_CREDENTIAL_ENV  no TOKEN/SECRET/KEY/PASSWORD env read in plugin/
 *   RUNTIME_FETCH_EXEC           no curl|sh, wget|sh, npx/bunx/uvx/pipx launchers
 *   ICON_MISSING                 plugin.json icon -> square PNG/JPEG, 512-2048 px, < 2 MB
 *   (size/type holds)            non-image files < 256 KiB; <= 512 files; text,
 *                                PNG, JPEG, GIF, WebP and fonts only
 * And the plumbing that makes `plugin/` the submitted folder:
 *   marketplace.json source is "./plugin"
 *
 * `claude plugin validate` covers only a subset (it reports ICON_MISSING but
 * none of the policy holds), which is why this script exists.
 *
 * Usage: node scripts/check-plugin-folder.mjs [pluginDir]   (default: plugin)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = resolve(ROOT, process.argv[2] ?? 'plugin');
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_FILES = 512;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const FONT_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf']);
const LOCKFILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'bun.lock',
  'bun.lockb',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const errors = [];
const err = (code, msg) => errors.push(`${code}: ${msg}`);

if (!existsSync(join(PLUGIN, '.claude-plugin/plugin.json'))) {
  console.error(`check-plugin-folder: ${relative(ROOT, PLUGIN)}/.claude-plugin/plugin.json not found`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) {
      err('SYMLINK', `${relative(ROOT, p)} is a symlink — ship real files only`);
      return [];
    }
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(PLUGIN);
const rel = (p) => relative(ROOT, p);

// --- file count, types, sizes, lockfiles ----------------------------------
if (files.length > MAX_FILES) err('FILE_COUNT', `${files.length} files in plugin/ (max ${MAX_FILES})`);

const textFiles = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (LOCKFILES.has(basename(f))) {
    err('LOCKFILE_AUTO_INSTALL', `${rel(f)} — Claude Code runs an install when the plugin carries package.json + a lockfile`);
  }
  if (IMAGE_EXT.has(ext) || FONT_EXT.has(ext)) continue;
  const buf = readFileSync(f);
  if (buf.includes(0)) {
    err('BINARY_FILE', `${rel(f)} is binary — only text, images and fonts are accepted`);
    continue;
  }
  if (buf.length >= MAX_TEXT_BYTES) err('FILE_TOO_LARGE', `${rel(f)} is ${buf.length} bytes (limit ${MAX_TEXT_BYTES})`);
  textFiles.push([f, buf.toString('utf8')]);
}

// --- allowed-tools ---------------------------------------------------------
// Accept only Bash rules pinned to a concrete file under ${CLAUDE_PLUGIN_ROOT},
// optionally run by `node`, with at most a trailing `:*` / ` *` wildcard.
const PINNED_BASH = /^(node )?\$\{CLAUDE_PLUGIN_ROOT\}\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+( [A-Za-z0-9_-]+)?(:\*| \*)?$/;
for (const [f, text] of textFiles) {
  if (!/\.md$/i.test(f)) continue;
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const line = fm[1].split('\n').find((l) => /^allowed-tools\s*:/.test(l));
  if (!line) continue;
  const value = line.replace(/^allowed-tools\s*:\s*/, '');
  // Tool entries: `Name` or `Name(rule)`, separated by spaces/commas.
  for (const m of value.matchAll(/([A-Za-z]+)(?:\(([^)]*)\))?/g)) {
    const [, tool, rule] = m;
    if (tool !== 'Bash') continue;
    if (rule === undefined || rule.trim() === '*' || rule.trim() === '') {
      err('ALLOWED_TOOLS_BROAD', `${rel(f)} pre-approves unrestricted Bash`);
    } else if (!PINNED_BASH.test(rule.trim())) {
      err('ALLOWED_TOOLS_BROAD', `${rel(f)} Bash(${rule}) is not pinned to a file under \${CLAUDE_PLUGIN_ROOT}`);
    }
  }
}

// --- credentials from the environment & download-and-run ------------------
const CRED_ENV = /process\.env(?:\.|\[['"])([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY))\b|os\.environ(?:\.get)?[[(]['"]([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY))['"]|\$\{?([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))\}?/g;
const FETCH_EXEC = /\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z|da)?sh\b|\b(?:npx|bunx|uvx|pipx run)\s+[^\s`]|\birm\b[^\n|]*\|\s*iex\b/;
for (const [f, text] of textFiles) {
  for (const m of text.matchAll(CRED_ENV)) {
    const name = m[1] ?? m[2] ?? m[3];
    // ${CLAUDE_PLUGIN_ROOT}-style plugin variables are not credentials.
    if (name && !name.startsWith('CLAUDE_PLUGIN')) {
      err('MCP_FORWARDS_CREDENTIAL_ENV', `${rel(f)} reads credential-like env var ${name} — use userConfig (sensitive: true) instead`);
    }
  }
  const fe = text.match(FETCH_EXEC);
  if (fe) err('RUNTIME_FETCH_EXEC', `${rel(f)} contains a download-and-run command: ${fe[0].trim()}`);
}

// --- icon -----------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
if (!manifest.icon) {
  err('ICON_MISSING', 'plugin.json has no "icon"');
} else {
  const icon = join(PLUGIN, manifest.icon);
  if (!existsSync(icon)) {
    err('ICON_MISSING', `plugin.json icon ${manifest.icon} does not exist`);
  } else {
    const buf = readFileSync(icon);
    let w;
    let h;
    if (buf.subarray(1, 4).toString('latin1') === 'PNG') {
      w = buf.readUInt32BE(16);
      h = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      // JPEG: scan for a start-of-frame marker.
      for (let i = 2; i < buf.length - 9; ) {
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          h = buf.readUInt16BE(i + 5);
          w = buf.readUInt16BE(i + 7);
          break;
        }
        i += 2 + len;
      }
    } else {
      err('ICON_MISSING', `${manifest.icon} is not a PNG or JPEG (SVG/WebP are not accepted)`);
    }
    if (w !== undefined) {
      if (w !== h || w < 512 || w > 2048) err('ICON_MISSING', `${manifest.icon} is ${w}x${h}; needs square, 512-2048 px`);
    }
    if (statSync(icon).size >= MAX_ICON_BYTES) err('ICON_MISSING', `${manifest.icon} is over 2 MB`);
  }
}

// --- marketplace points at this folder ------------------------------------
const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
const entry = marketplace.plugins?.find((p) => p.name === manifest.name);
const expected = `./${relative(ROOT, PLUGIN)}`;
if (!entry) err('MARKETPLACE', `marketplace.json lists no plugin named ${manifest.name}`);
else if (entry.source !== expected) err('MARKETPLACE', `marketplace.json source is ${JSON.stringify(entry.source)}, expected "${expected}"`);

if (errors.length) {
  console.error(`check-plugin-folder: ${errors.length} problem(s) in ${rel(PLUGIN)}/`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`check-plugin-folder: ${rel(PLUGIN)}/ clean — ${files.length} files, no directory findings.`);
