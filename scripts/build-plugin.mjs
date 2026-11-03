#!/usr/bin/env node
// Build the Claude Code plugin's runtime: bundle packages/adapter-claude-code
// (+ the plugin-core it imports) into ONE readable ESM file inside the plugin
// folder, plugin/bin/production-master.mjs.
//
// Why a committed bundle instead of `dist/` + npm:
//   - Claude Code runs `npm ci` whenever package.json + a lockfile sit in the
//     plugin root, and that install can't be turned off. The plugin folder
//     therefore carries NO package.json — so it can't build itself either, and
//     must ship the code it runs. (Directory finding LOCKFILE_AUTO_INSTALL.)
//   - The directory scan holds minified/packed code and any non-image file over
//     256 KiB, so the bundle is NOT minified and is size-checked here.
//   - The runtime imports only `node:*` built-ins, so one file is the whole
//     program — no node_modules at run time.
//
// Usage:
//   node scripts/build-plugin.mjs           # write plugin/bin/production-master.mjs
//   node scripts/build-plugin.mjs --check   # fail if the committed file is stale or too big
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'packages/adapter-claude-code/src/cli.ts');
const OUT = join(ROOT, 'plugin/bin/production-master.mjs');
// Directory policy: every file that isn't an image or font stays under 256 KiB.
const MAX_BYTES = 256 * 1024;

const BANNER = [
  '// GENERATED FILE — do not edit by hand.',
  '// Built by scripts/build-plugin.mjs from packages/adapter-claude-code/src/cli.ts',
  '// and packages/plugin-core/src. Rebuild with `npm run build:plugin`; CI fails',
  '// when this file drifts from its sources (`npm run check:plugin`).',
].join('\n');

async function bundle() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: false,
    sourcemap: false,
    legalComments: 'inline',
    charset: 'utf8',
    banner: { js: BANNER },
    // Bundle plugin-core from source so no workspace build is needed first.
    alias: { '@production-master/plugin-core': join(ROOT, 'packages/plugin-core/src/index.ts') },
    logLevel: 'warning',
  });
  const [file] = result.outputFiles;
  return file.text;
}

// Failures throw and the top level sets process.exitCode instead of calling
// process.exit(): on macOS a piped stderr is asynchronous, so exit() can
// truncate the very message that says why the build failed.
class BuildPluginError extends Error {}
function fail(msg) {
  throw new BuildPluginError(msg);
}

async function run() {
  const check = process.argv.includes('--check');
  const text = await bundle();
  const bytes = Buffer.byteLength(text, 'utf8');
  const rel = relative(ROOT, OUT);

  if (bytes >= MAX_BYTES) {
    fail(`${rel} would be ${bytes} bytes — over the ${MAX_BYTES}-byte plugin directory limit.`);
  }
  // The bundle must stay dependency-free: any bare import left in it would need
  // node_modules at run time, which the plugin folder deliberately does not have.
  const bare = [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)]
    .map((m) => m[1])
    .filter((spec) => !spec.startsWith('node:'));
  if (bare.length) fail(`bundle has non-builtin imports: ${[...new Set(bare)].join(', ')}`);

  if (check) {
    if (!existsSync(OUT)) fail(`${rel} is missing — run \`npm run build:plugin\` and commit it.`);
    if (readFileSync(OUT, 'utf8') !== text) {
      fail(`${rel} is stale — run \`npm run build:plugin\` and commit the result.`);
    }
    process.stdout.write(`build-plugin: ${rel} is up to date (${bytes} bytes).\n`);
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    process.stdout.write(`build-plugin: wrote ${rel} (${bytes} bytes).\n`);
  }
}

try {
  await run();
} catch (e) {
  if (!(e instanceof BuildPluginError)) throw e;
  process.stderr.write(`build-plugin: ${e.message}\n`);
  process.exitCode = 1;
}
