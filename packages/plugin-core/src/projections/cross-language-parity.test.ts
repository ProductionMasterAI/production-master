/**
 * Cross-language projection parity (TS side, #118).
 *
 * The projection fold in this package (`fold` + `toPanelView`) and the Python
 * SDK's `production_master.projection.project` must derive the SAME canonical
 * digest from the SAME recorded stream (`tests/fixtures/sse/events.jsonl`).
 * Both sides assert against ONE committed golden:
 * `tests/fixtures/sse/expected-projection.json`.
 *
 * This test folds the recorded events, reduces the projection state to the
 * digest shape, and asserts it deep-equals the golden. The Python counterpart
 * (`sdk/python/tests/test_projection_parity.py`) asserts the same golden, so if
 * either reducer drifts the two suites disagree with the committed file.
 *
 * Scope: this pins the shared fold itself, not any one renderer. Every surface
 * that displays an investigation is expected to wrap `fold`/`toPanelView`
 * rather than re-implement the reducer, so pinning it here covers those
 * surfaces transitively and none of them need to be dragged into this test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { fold, type ProjectionState } from './index.js';
import { loadRecordedEvents } from '../__fixtures__/load-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/plugin-core/src/projections -> repo root is four levels up.
const GOLDEN = resolve(HERE, '../../../../tests/fixtures/sse/expected-projection.json');

/** The canonical, language-neutral projection digest. */
interface ProjectionDigest {
  status: string;
  title: string | null;
  reportUri: string | null;
  costUsd: number;
  stepCount: number;
  stepsCompleted: number;
  agentCount: number;
  agentsCompleted: number;
  pendingActionCount: number;
  logCount: number;
}

/** Reduce a full projection state to the stable cross-language digest. */
function toDigest(state: ProjectionState): ProjectionDigest {
  const steps = state.pipeline.steps;
  const agents = [...state.agents.values()];
  const actions = [...state.pendingActions.values()];
  return {
    status: state.runSummary.status,
    title: state.runSummary.title ?? null,
    reportUri: state.runSummary.reportUri ?? null,
    // Same 6dp rounding the reducer already applies (round6); toFixed keeps the
    // JSON number stable regardless of float representation.
    costUsd: Number(state.runSummary.costUsd.toFixed(6)),
    stepCount: steps.length,
    stepsCompleted: steps.filter((s) => s.status === 'completed').length,
    agentCount: agents.length,
    agentsCompleted: agents.filter((a) => a.status === 'completed').length,
    pendingActionCount: actions.length,
    logCount: state.logs.length,
  };
}

describe('cross-language projection parity (TS)', () => {
  it('computes the golden digest from the recorded stream', () => {
    const digest = toDigest(fold('inv_1', loadRecordedEvents()));
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as ProjectionDigest;
    expect(digest).toEqual(golden);
  });
});
