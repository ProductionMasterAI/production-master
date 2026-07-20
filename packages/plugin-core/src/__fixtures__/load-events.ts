import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { InvestigationEventEnvelope } from '../types.js';

/** Load the recorded events.jsonl fixture from tests/fixtures/sse. */
export function loadRecordedEvents(): InvestigationEventEnvelope[] {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/__fixtures__ -> repo packages/plugin-core -> repo root tests/fixtures/sse
  const path = resolve(here, '../../../../tests/fixtures/sse/events.jsonl');
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as InvestigationEventEnvelope);
}
