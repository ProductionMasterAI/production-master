#!/usr/bin/env node
/**
 * Assert every bullet under `## [Unreleased]` in CHANGELOG.md sits beneath a
 * Keep a Changelog category header (`### Added`/`Changed`/`Deprecated`/
 * `Removed`/`Fixed`/`Security`).
 *
 * dev#726 instance 2: plugin#37 (merged as 33fd39b) landed a bullet directly
 * under `## [Unreleased]` with no category header above it — a Keep a
 * Changelog structure violation nothing checked for. Fixed in cfe0c64.
 *
 * A missing `## [Unreleased]` heading is a hard STRUCTURE failure (the check
 * cannot run, not "nothing to compare"); an EMPTY `[Unreleased]` section
 * (no bullets at all — the normal state right after a release cut) is not a
 * failure, since there is nothing to attach a header to.
 *
 * Usage: node scripts/check-changelog-structure.mjs [repo_root]
 * Exit 0 = every bullet is categorized. Exit 1 = an orphaned bullet or a
 * structural failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG_REL = 'CHANGELOG.md';
const CATEGORIES = new Set(['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']);

function main() {
  const full = path.join(root, CHANGELOG_REL);
  if (!existsSync(full)) {
    console.log(`STRUCTURE: ${CHANGELOG_REL} not found at ${full} — the check cannot run.`);
    process.exitCode = 1;
    return;
  }
  const lines = readFileSync(full, 'utf8').split('\n');

  const startIdx = lines.findIndex((ln) => /^##\s+\[Unreleased\]/i.test(ln.trim()));
  if (startIdx === -1) {
    console.log(`STRUCTURE: ${CHANGELOG_REL}: no \`## [Unreleased]\` heading found — the check cannot run.`);
    process.exitCode = 1;
    return;
  }
  // End of the section: the next level-2 heading (a `##` line that is not a
  // `###` subheading), or end of file.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i]) && !/^###/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  const problems = [];
  let currentCategory = null;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const ln = lines[i];
    const headerM = ln.match(/^###\s+(.+?)\s*$/);
    if (headerM) {
      currentCategory = headerM[1].trim();
      continue;
    }
    if (/^\s*-\s+\S/.test(ln)) {
      if (!currentCategory || !CATEGORIES.has(currentCategory)) {
        const snippet = ln.trim().slice(0, 70);
        const where = currentCategory
          ? `sits under \`### ${currentCategory}\`, which is not a Keep a Changelog category ` +
            `(${[...CATEGORIES].join('/')})`
          : 'sits directly under `## [Unreleased]` with no category header above it';
        problems.push(`line ${i + 1}: bullet ${JSON.stringify(snippet)}… ${where}.`);
      }
    }
  }

  if (problems.length > 0) {
    console.log('CHANGELOG.md: bullets under [Unreleased] without a Keep a Changelog category header:\n');
    for (const p of problems) console.log(`  ${p}`);
    console.log(
      '\nAdd a `### Added`/`Changed`/`Deprecated`/`Removed`/`Fixed`/`Security` header above each bullet.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('CHANGELOG.md: [Unreleased] bullets are all under a Keep a Changelog category header.');
}

main();
