#!/usr/bin/env node
/**
 * Guard the Claude Code plugin folder against the plugin-directory findings.
 *
 * THE REAL QUESTION -----------------------------------------------------
 * "Would the directory refuse or hold the folder we submit?" The portal scans
 * the plugin path given at submit time (`plugin/`), so every check runs
 * against that folder exactly as the portal sees it.
 *
 * ProductionMasterAI is not a Verified organization. For such an org the
 * directory accepts no local code at all (v0.1.2 was refused on 2026-11-08):
 *   LOCAL_CODE_BIN         no bin/ folder (Claude Code adds it to PATH)
 *   LOCAL_CODE_FILE_TYPE   only Markdown, text, JSON, YAML and PNG/JPEG/GIF/
 *                          WebP/ICO images; nothing starting with #!; no
 *                          package-manager config (package.json,
 *                          pnpm-workspace.yaml, ...); UTF-8, no NUL bytes;
 *                          an image's bytes must match its extension
 *   LOCAL_CODE_TOOL_GRANT  every allowed-tools / allowedTools entry is plain
 *                          Read, Grep, Glob or LS — no ${...}, no // or \\
 *                          path, no URL — and the list must be readable
 * Holds the directory raises for review:
 *   MCP_FORWARDS_CREDENTIAL_ENV  no credential-like env var anywhere; the only
 *                                credential is a sensitive userConfig value
 *   RUNTIME_FETCH_EXEC           no curl|sh, wget|sh, npx/bunx/uvx/pipx
 *   UNREAD_ASSET_REFERENCED      no text file other than plugin.json names an
 *                                image or font file
 *   ICON_MISSING                 icon -> square PNG/JPEG, 512-2048 px, < 2 MB
 *   PRIVACY_URL_MISSING          a remote MCP server needs an https privacyPolicyUrl
 * Guards of our own, for things that would be local code by another route:
 *   LOCAL_CODE_HOOK        no hooks (a hook runs a command on the user's machine;
 *                          mods load through hooks/hooks.json too)
 *   LOCAL_CODE_LSP         no LSP servers (.lsp.json or lspServers)
 *   LOCAL_CODE_MONITOR     no monitors (monitors/ or [experimental.]monitors)
 *   LOCAL_CODE_WORKFLOW    no workflows (workflows/ or workflows)
 *   LOCAL_CODE_SETTINGS    no status line in plugin.json settings or settings.json
 *                          (subagentStatusLine is a {type: "command"} entry)
 *   LOCAL_CODE_MCP         every MCP server is remote: type http/sse, an https
 *                          URL, no `command`, no `headersHelper`, no .mcpb/.dxt
 *                          bundle
 *   USER_CONFIG            every ${user_config.KEY} is declared, and a key used
 *                          in an MCP header is `sensitive: true`
 * And the plumbing that makes `plugin/` the submitted folder:
 *   MARKETPLACE            marketplace.json source is "./plugin"
 *
 * `claude plugin validate` covers only a subset, which is why this exists.
 *
 * Usage: node scripts/check-plugin-folder.mjs [pluginDir]   (default: plugin)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = resolve(ROOT, process.argv[2] ?? 'plugin');
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_FILES = 512;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.json', '.yaml', '.yml']);
// Extensionless files the directory names as allowed when they are UTF-8 text.
const TEXT_NAMES = new Set(['LICENSE', 'LICENCE', 'README', 'NOTICE', 'COPYING', '.gitignore']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const PACKAGE_MANAGER_FILES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc',
  'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'yarn.lock', '.yarnrc', '.yarnrc.yml',
  'bun.lock', 'bun.lockb', 'bunfig.toml', 'deno.json', 'deno.jsonc', 'deno.lock',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock', 'uv.toml', 'uv.lock',
  'composer.json', 'composer.lock', 'Gemfile', 'Gemfile.lock', 'Cargo.toml', 'go.mod',
]);
const PLAIN_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS']);

const errors = [];
const err = (code, msg) => errors.push(`${code}: ${msg}`);
const rel = (p) => relative(ROOT, p);

const MANIFEST = join(PLUGIN, '.claude-plugin/plugin.json');
let manifest;
if (!existsSync(MANIFEST)) err('MANIFEST', `${rel(MANIFEST)} not found`);
else {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    err('MANIFEST', `${rel(MANIFEST)} is not valid JSON: ${e.message}`);
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) {
      err('SYMLINK', `${rel(p)} is a symlink — ship real files only`);
      return [];
    }
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(PLUGIN);
if (files.length > MAX_FILES) err('FILE_COUNT', `${files.length} files in plugin/ (max ${MAX_FILES})`);
if (existsSync(join(PLUGIN, 'bin'))) {
  err('LOCAL_CODE_BIN', `${rel(join(PLUGIN, 'bin'))}/ exists — non-Verified orgs may not ship a bin/ folder`);
}

// --- file types, encodings, sizes ------------------------------------------
function imageMatches(ext, b) {
  if (ext === '.png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === '.jpg' || ext === '.jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === '.gif') return /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'));
  if (ext === '.webp') return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  if (ext === '.ico') return b.readUInt32BE(0) === 0x00000100;
  return false;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const textFiles = [];
for (const f of files) {
  const name = basename(f);
  const ext = extname(f).toLowerCase();
  const buf = readFileSync(f);
  if (PACKAGE_MANAGER_FILES.has(name)) {
    err('LOCAL_CODE_FILE_TYPE', `${rel(f)} is package-manager configuration`);
    continue;
  }
  if (IMAGE_EXT.has(ext)) {
    if (buf.length < 12 || !imageMatches(ext, buf)) err('LOCAL_CODE_FILE_TYPE', `${rel(f)} is not a real ${ext} image`);
    continue;
  }
  if (!TEXT_EXT.has(ext) && !TEXT_NAMES.has(name)) {
    err('LOCAL_CODE_FILE_TYPE', `${rel(f)} — only Markdown, text, JSON, YAML and images are accepted`);
    continue;
  }
  if (buf.includes(0)) {
    err('LOCAL_CODE_FILE_TYPE', `${rel(f)} holds a NUL byte`);
    continue;
  }
  let text;
  try {
    text = utf8.decode(buf);
  } catch {
    err('LOCAL_CODE_FILE_TYPE', `${rel(f)} is not valid UTF-8`);
    continue;
  }
  if (text.replace(/^﻿/, '').startsWith('#!')) err('LOCAL_CODE_FILE_TYPE', `${rel(f)} starts with #!`);
  if (buf.length >= MAX_TEXT_BYTES) err('FILE_TOO_LARGE', `${rel(f)} is ${buf.length} bytes (limit ${MAX_TEXT_BYTES})`);
  textFiles.push([f, text]);
}

// --- allowed-tools -----------------------------------------------------------
// A list is a YAML sequence or a space/comma-separated string; each entry is
// `Name` or `Name(rule)`. Anything we cannot split into such entries counts as
// unreadable, which the directory treats like a grant.
function toolEntries(value) {
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string') ? value : null;
  if (typeof value !== 'string') return null;
  const entries = value.match(/[A-Za-z]+(?:\([^)]*\))?/g) ?? [];
  const squash = (s) => s.replace(/[\s,]/g, '');
  return squash(entries.join('')) === squash(value) ? entries : null;
}
function checkToolList(where, value) {
  const entries = toolEntries(value);
  if (!entries) {
    err('LOCAL_CODE_TOOL_GRANT', `${where} has an allowed-tools list that cannot be read completely`);
    return;
  }
  for (const entry of entries) {
    const m = entry.trim().match(/^([A-Za-z]+)(?:\(([^)]*)\))?$/);
    const [tool, rule] = m ? [m[1], m[2] ?? ''] : [entry, ''];
    if (!m || !PLAIN_TOOLS.has(tool)) {
      err('LOCAL_CODE_TOOL_GRANT', `${where} pre-approves ${entry} — only Read, Grep, Glob and LS are accepted`);
    } else if (/\$\{/.test(rule) || /^\s*(\/\/|\\\\)/.test(rule) || /[a-z][a-z0-9+.-]*:\/\//i.test(rule)) {
      err('LOCAL_CODE_TOOL_GRANT', `${where} ${entry} uses a \${...} path, a // or \\\\ path, or a URL`);
    }
  }
}
for (const [f, text] of textFiles) {
  if (!/\.(md|markdown)$/i.test(f)) continue;
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) continue;
  let data;
  try {
    data = parseYaml(fm[1]);
  } catch (e) {
    err('LOCAL_CODE_TOOL_GRANT', `${rel(f)} frontmatter is not valid YAML (${e.message.split('\n')[0]})`);
    continue;
  }
  for (const key of ['allowed-tools', 'allowedTools']) {
    if (data && typeof data === 'object' && key in data) checkToolList(rel(f), data[key]);
  }
}
if (manifest && manifest.commands && typeof manifest.commands === 'object' && !Array.isArray(manifest.commands)) {
  for (const [name, cmd] of Object.entries(manifest.commands)) {
    if (cmd && typeof cmd === 'object' && 'allowedTools' in cmd) checkToolList(`plugin.json commands.${name}`, cmd.allowedTools);
  }
}

// --- components that run a command on the user's machine ----------------------
// Each component below is a process Claude Code starts locally, so a plugin
// from a non-Verified org may declare none of them — by default location or by
// manifest key (https://code.claude.com/docs/en/plugins-reference).
const declared = (v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
if (existsSync(join(PLUGIN, 'hooks')) || declared(manifest?.hooks)) {
  // Also covers mods: a mod is a hooks module named from hooks/hooks.json.
  err('LOCAL_CODE_HOOK', "the plugin declares hooks — a hook runs a command on the user's machine");
}
if (existsSync(join(PLUGIN, '.lsp.json')) || declared(manifest?.lspServers)) {
  err('LOCAL_CODE_LSP', 'the plugin declares LSP servers (.lsp.json or lspServers) — each one runs a local command');
}
if (existsSync(join(PLUGIN, 'monitors')) || declared(manifest?.monitors) || declared(manifest?.experimental?.monitors)) {
  err('LOCAL_CODE_MONITOR', 'the plugin declares monitors (monitors/ or experimental.monitors) — each one runs a background command');
}
if (existsSync(join(PLUGIN, 'workflows')) || declared(manifest?.workflows)) {
  err('LOCAL_CODE_WORKFLOW', 'the plugin declares workflows (workflows/ or workflows) — a workflow is a JavaScript program');
}
// `settings` (plugin.json) and settings.json at the root apply `agent` and
// `subagentStatusLine`; the status line is {type: "command", command}.
const COMMAND_SETTINGS = ['subagentStatusLine', 'statusLine'];
const settingsSources = [];
if (manifest?.settings && typeof manifest.settings === 'object') settingsSources.push(['plugin.json settings', manifest.settings]);
if (existsSync(join(PLUGIN, 'settings.json'))) {
  try {
    settingsSources.push([rel(join(PLUGIN, 'settings.json')), JSON.parse(readFileSync(join(PLUGIN, 'settings.json'), 'utf8'))]);
  } catch (e) {
    err('LOCAL_CODE_SETTINGS', `${rel(join(PLUGIN, 'settings.json'))} cannot be read: ${e.message}`);
  }
}
for (const [label, s] of settingsSources) {
  for (const key of COMMAND_SETTINGS) {
    if (s && typeof s === 'object' && declared(s[key])) err('LOCAL_CODE_SETTINGS', `${label} sets ${key} — a status line runs a local command`);
  }
}

// --- MCP servers -------------------------------------------------------------
function mcpServerMaps() {
  const maps = [];
  const load = (p, label) => {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      maps.push([label, j.mcpServers ?? j]);
    } catch (e) {
      err('LOCAL_CODE_MCP', `${label} cannot be read: ${e.message}`);
    }
  };
  if (existsSync(join(PLUGIN, '.mcp.json'))) load(join(PLUGIN, '.mcp.json'), rel(join(PLUGIN, '.mcp.json')));
  const m = manifest?.mcpServers;
  for (const ref of Array.isArray(m) ? m : [m]) {
    if (typeof ref === 'string' && /\.(mcpb|dxt)$/i.test(ref)) {
      err('LOCAL_CODE_MCP', `plugin.json mcpServers -> ${ref} is an MCP bundle — it unpacks and runs a local server`);
    } else if (typeof ref === 'string') load(join(PLUGIN, ref), `plugin.json mcpServers -> ${ref}`);
    else if (ref && typeof ref === 'object') maps.push(['plugin.json mcpServers', ref]);
  }
  return maps;
}
const userConfig = manifest?.userConfig ?? {};
const headerKeys = new Set();
const serverMaps = mcpServerMaps();
for (const [label, servers] of serverMaps) {
  for (const [name, s] of Object.entries(servers ?? {})) {
    const where = `${label}.${name}`;
    if (!s || typeof s !== 'object') {
      err('LOCAL_CODE_MCP', `${where} is not an object`);
      continue;
    }
    if ('command' in s) err('LOCAL_CODE_MCP', `${where} runs a local command — only remote servers are accepted`);
    if ('headersHelper' in s) err('LOCAL_CODE_MCP', `${where} has a headersHelper — it runs a local command to build headers`);
    if (!['http', 'streamable-http', 'sse'].includes(s.type)) err('LOCAL_CODE_MCP', `${where} type is ${JSON.stringify(s.type)}, expected "http"`);
    if (typeof s.url !== 'string' || !s.url.startsWith('https://')) err('LOCAL_CODE_MCP', `${where} url must be https://`);
    for (const v of Object.values(s.headers ?? {})) {
      for (const ref of String(v).matchAll(/\$\{([^}]*)\}/g)) {
        const key = ref[1].match(/^user_config\.([A-Za-z0-9_]+)$/)?.[1];
        if (!key) err('MCP_FORWARDS_CREDENTIAL_ENV', `${where} header reads \${${ref[1]}} — take it from \${user_config.KEY}`);
        else headerKeys.add(key);
      }
    }
  }
}

// A plugin that sends data to a remote server must say where its privacy policy is.
if (manifest && serverMaps.some(([, s]) => Object.keys(s ?? {}).length) && !/^https:\/\//.test(manifest.privacyPolicyUrl ?? '')) {
  err('PRIVACY_URL_MISSING', 'plugin.json declares a remote MCP server but no https privacyPolicyUrl');
}

// --- userConfig --------------------------------------------------------------
for (const [f, text] of textFiles) {
  for (const ref of text.matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)) {
    if (!(ref[1] in userConfig)) err('USER_CONFIG', `${rel(f)} references undeclared \${user_config.${ref[1]}}`);
  }
}
for (const key of headerKeys) {
  if (userConfig[key] && userConfig[key].sensitive !== true) {
    err('USER_CONFIG', `userConfig.${key} is sent as an MCP header but is not "sensitive": true`);
  }
}

// --- credentials from the environment, download-and-run, asset references ----
const CRED_ENV = /process\.env(?:\.|\[['"])([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY))\b|os\.environ(?:\.get)?[[(]['"]([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY))['"]|\$\{?([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))\}?/g;
const FETCH_EXEC = /\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z|da)?sh\b|\b(?:npx|bunx|uvx|pipx run)\s+[^\s`]|\birm\b[^\n|]*\|\s*iex\b/;
const ASSET_REF = /[\w./-]+\.(?:png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf)\b/i;
for (const [f, text] of textFiles) {
  for (const m of text.matchAll(CRED_ENV)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name && !name.startsWith('CLAUDE_PLUGIN')) {
      err('MCP_FORWARDS_CREDENTIAL_ENV', `${rel(f)} reads credential-like env var ${name} — use userConfig (sensitive: true) instead`);
    }
  }
  const fe = text.match(FETCH_EXEC);
  if (fe) err('RUNTIME_FETCH_EXEC', `${rel(f)} contains a download-and-run command: ${fe[0].trim()}`);
  if (f !== MANIFEST) {
    const a = text.match(ASSET_REF);
    if (a) err('UNREAD_ASSET_REFERENCED', `${rel(f)} names an image/font file (${a[0]}) — only plugin.json may`);
  }
}

// --- icon --------------------------------------------------------------------
if (!manifest) {
  // Already reported as MANIFEST; the icon and marketplace checks need it.
} else if (!manifest.icon) {
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

// --- marketplace points at this folder --------------------------------------
if (manifest) {
  const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = marketplace.plugins?.find((p) => p.name === manifest.name);
  const expected = `./${relative(ROOT, PLUGIN)}`;
  if (!entry) err('MARKETPLACE', `marketplace.json lists no plugin named ${manifest.name}`);
  else if (entry.source !== expected) err('MARKETPLACE', `marketplace.json source is ${JSON.stringify(entry.source)}, expected "${expected}"`);
}

// exitCode, not process.exit(): on macOS a piped stderr is asynchronous and
// exit() can truncate the list of findings.
if (errors.length) {
  console.error(`check-plugin-folder: ${errors.length} problem(s) in ${rel(PLUGIN)}/`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exitCode = 1;
} else {
  console.log(`check-plugin-folder: ${rel(PLUGIN)}/ clean — ${files.length} files, no directory findings.`);
}
