#!/usr/bin/env node
/**
 * Assert the version-pin DOC says the same thing the root PIN FILES hold.
 *
 * THE REAL QUESTION -----------------------------------------------------
 * For every root pin (`.claude-code-version`, `.codex-version`,
 * `.cursor-version`) and every value `docs/user/platform-support.md`
 * attributes to that pin: is the value the doc attaches to THIS pin the
 * value THIS pin file actually holds? That is a pairwise pin -> claimed
 * value comparison, and nothing weaker answers it.
 *
 * THE QUESTION A NAIVE CHECK ASKS INSTEAD --------------------------------
 * "Does the doc mention this version/date string anywhere?" — membership.
 * That is a PROXY: dev#726's instance 1 (cockpit repo, dev#718, merged as
 * 0c37b0f) wrote its new date onto the `.claude-code-version` line instead
 * of the `.cursor-version` line — both dates were present in the doc, both
 * were present in the pin files, just attached to the wrong pin. A
 * membership test is green on that swap. This script never asks the first
 * question: it builds {pin -> {field -> value}} from the pin files and from
 * each doc surface independently, then diffs them key by key, per pin.
 *
 * WHAT IT COMPARES --------------------------------------------------------
 *   1. The platform table's "Latest known" column (Claude Code / Codex /
 *      Cursor rows) against each pin's `__version__` — Cursor's cell also
 *      carries a `(+ changelog <date>)` suffix compared against that pin's
 *      `changelog_date` field.
 *   2. The narrative paragraph naming the Codex/Cursor releases this repo
 *      targets (version, changelog-covered-through date, desktop CLI
 *      build) against the same pins.
 *
 * FAILING TO RUN IS A FAILURE ---------------------------------------------
 * A check that cannot ask its question must say so loudly, never return a
 * pass: a missing file, an unparseable pin, an absent table/paragraph, or a
 * platform row that is gone are all hard errors here — reported as
 * STRUCTURE, exit 1 — not "nothing to compare, looks fine".
 *
 * Usage: node scripts/check-version-pin-docs.mjs [repo_root]
 * Exit 0 = every claim matches. Exit 1 = a mismatch or a structural failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// pin file -> human name used in the platform table
const PINS = {
  '.claude-code-version': 'Claude Code',
  '.codex-version': 'Codex',
  '.cursor-version': 'Cursor',
};

const DOC_REL = 'docs/user/platform-support.md';

const problems = [];
function fail(kind, msg) {
  problems.push(`${kind}: ${msg}`);
}

function readText(relPath, label) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) {
    fail('STRUCTURE', `${label} not found at ${relPath} — the check cannot run.`);
    return null;
  }
  return readFileSync(full, 'utf8');
}

function fieldLabel(field) {
  return field === '__version__' ? 'version' : field;
}

/** First non-empty line is the version; every later line is `key: value`. */
function parsePinFile(pinName) {
  const text = readText(pinName, `root pin ${pinName}`);
  if (text === null) return null;
  const lines = text
    .split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => ln.length > 0);
  if (lines.length === 0) {
    fail('STRUCTURE', `root pin ${pinName} is empty — no version to compare against.`);
    return null;
  }
  if (lines[0].includes(':')) {
    fail(
      'STRUCTURE',
      `root pin ${pinName}: first line ${JSON.stringify(lines[0])} looks like a key/value ` +
        'pair, but the version is expected on line 1.',
    );
    return null;
  }
  const fields = { __version__: lines[0] };
  for (const ln of lines.slice(1)) {
    const idx = ln.indexOf(':');
    if (idx === -1) {
      fail('STRUCTURE', `root pin ${pinName}: unparseable line ${JSON.stringify(ln)} (expected \`key: value\`).`);
      return null;
    }
    fields[ln.slice(0, idx).trim()] = ln.slice(idx + 1).trim();
  }
  return fields;
}

/** The pairwise assertion. `field` is a pin-file key, or `__version__`. */
function compare(surface, pin, field, claimed, actual) {
  if (!(field in actual)) {
    fail(
      'MISMATCH',
      `${surface} claims ${pin} has \`${fieldLabel(field)}: ${claimed}\`, but ${pin} holds no ` +
        `\`${fieldLabel(field)}\` field at all.`,
    );
    return;
  }
  if (actual[field] !== claimed) {
    fail(
      'MISMATCH',
      `${pin} ${fieldLabel(field)}: ${surface} claims ${JSON.stringify(claimed)}, but the pin ` +
        `file holds ${JSON.stringify(actual[field])}.`,
    );
  }
}

// --------------------------------------------------------------------------
// platform-support.md — the platform table
// --------------------------------------------------------------------------
function checkPlatformTable(doc, pins) {
  const surface = `${DOC_REL} platform table`;
  const lines = doc.split('\n');
  const headerIdx = lines.findIndex(
    (ln) => ln.trim().startsWith('|') && ln.includes('Platform') && ln.includes('Latest known'),
  );
  if (headerIdx === -1) {
    fail('STRUCTURE', `${surface} not found (no table header row with both 'Platform' and 'Latest known').`);
    return;
  }
  const header = lines[headerIdx]
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
  const nameCol = header.indexOf('Platform');
  const knownCol = header.indexOf('Latest known');
  if (nameCol === -1 || knownCol === -1) {
    fail('STRUCTURE', `${surface}: header ${JSON.stringify(header)} lacks an expected column.`);
    return;
  }

  // Only the table CONTIGUOUS with the matched header — stop at the first
  // line that no longer opens with `|`, so a later, unrelated table cannot
  // donate a row here.
  const claimedByName = {};
  for (const ln of lines.slice(headerIdx + 1)) {
    if (!ln.trim().startsWith('|')) break;
    const cells = ln
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length <= Math.max(nameCol, knownCol)) continue;
    if (/^[-:\s]*$/.test(cells[nameCol])) continue; // the ---|--- separator row
    const name = cells[nameCol];
    if (name in claimedByName) {
      fail(
        'STRUCTURE',
        `${surface}: duplicate row for ${JSON.stringify(name)} — a platform must be claimed ` +
          'exactly once, or one row silently overrides the other.',
      );
      continue;
    }
    claimedByName[name] = cells[knownCol];
  }

  for (const [pin, display] of Object.entries(PINS)) {
    if (!(pin in pins)) continue; // pin file itself failed to parse — already reported
    const actual = pins[pin];
    if (!(display in claimedByName)) {
      fail(
        'STRUCTURE',
        `${surface}: no row for ${display} (${pin}) — rows present: ` +
          `${JSON.stringify(Object.keys(claimedByName).sort())}.`,
      );
      continue;
    }
    const cell = claimedByName[display];
    // Bare version ("2.1.236") or version + changelog suffix
    // ("3.11 (+ changelog 2026-08-19)") — Cursor is the only pin that
    // carries a changelog_date field today, so it's the only cell with the
    // suffix.
    const m = cell.match(/^([^\s(]+)(?:\s*\(\+\s*changelog\s+([^)]+)\))?$/);
    if (!m) {
      fail(
        'STRUCTURE',
        `${surface}: ${display} row cell ${JSON.stringify(cell)} doesn't match the expected ` +
          '`<version>` or `<version> (+ changelog <date>)` shape.',
      );
      continue;
    }
    compare(`${surface} (${display} row)`, pin, '__version__', m[1], actual);
    if (m[2] !== undefined) {
      compare(`${surface} (${display} row)`, pin, 'changelog_date', m[2].trim(), actual);
    }
  }
}

// --------------------------------------------------------------------------
// platform-support.md — the narrative paragraph naming Codex/Cursor targets
// --------------------------------------------------------------------------
function checkNarrativeParagraph(doc, pins) {
  const surface = `${DOC_REL} narrative paragraph`;
  const blocks = doc.split(/\n\s*\n/);
  const block = blocks.find((b) => b.includes('targets is') && b.includes('release is'));
  if (block === undefined) {
    fail('STRUCTURE', `${surface} not found (no paragraph containing 'targets is' and 'release is').`);
    return;
  }
  const text = block.split('\n').join(' ').replace(/\s+/g, ' ');

  const codexM = text.match(/Codex release this repo targets is \*\*([^*]+)\*\*/);
  if (!codexM) {
    fail('STRUCTURE', `${surface}: no Codex \`targets is **<version>**\` claim found.`);
  } else if ('.codex-version' in pins) {
    compare(surface, '.codex-version', '__version__', codexM[1].trim(), pins['.codex-version']);
  }

  const cursorM = text.match(
    /Cursor\s+release is \*\*([^*]+)\*\*\s*\(changelog covered through ([^;]+);\s*desktop CLI observed at \*\*([^*]+)\*\*\)/,
  );
  if (!cursorM) {
    fail(
      'STRUCTURE',
      `${surface}: no Cursor \`release is **<version>** (changelog covered through <date>; ` +
        'desktop CLI observed at **<value>**)` claim found.',
    );
  } else if ('.cursor-version' in pins) {
    const actual = pins['.cursor-version'];
    compare(surface, '.cursor-version', '__version__', cursorM[1].trim(), actual);
    compare(surface, '.cursor-version', 'changelog_date', cursorM[2].trim(), actual);
    compare(surface, '.cursor-version', 'desktop_cli', cursorM[3].trim(), actual);
  }
}

function main() {
  const pins = {};
  for (const pinName of Object.keys(PINS)) {
    const parsed = parsePinFile(pinName);
    if (parsed !== null) pins[pinName] = parsed;
  }

  const doc = readText(DOC_REL, 'platform-support.md');
  if (doc !== null) {
    checkPlatformTable(doc, pins);
    checkNarrativeParagraph(doc, pins);
  }

  if (problems.length > 0) {
    console.log('Version-pin docs contradict the pin files they describe:\n');
    for (const p of problems) console.log(`  ${p}`);
    console.log(
      '\nThe root pin files are the fact; the doc is the claim. Fix whichever is wrong — and ' +
        "check that a value wasn't written onto the WRONG pin's line, which is the failure " +
        'this guard exists for.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Version pins agree with their docs (${Object.keys(pins).sort().join(', ')}).`);
}

main();
