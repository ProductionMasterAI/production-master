import { describe, it, expect } from 'vitest';
import { fold, toPanelView } from './index.js';
import { loadRecordedEvents } from '../__fixtures__/load-events.js';

describe('projection reducers', () => {
  it('folds the recorded stream into a completed run summary', () => {
    const events = loadRecordedEvents();
    const state = fold('inv_1', events);
    expect(state.runSummary.status).toBe('completed');
    expect(state.runSummary.title).toBe('Checkout 500s');
    expect(state.runSummary.reportUri).toBe('https://svc.example/reports/inv_1.md');
  });

  it('is deterministic — folding twice yields identical projections', () => {
    const events = loadRecordedEvents();
    const a = toPanelView(fold('inv_1', events));
    const b = toPanelView(fold('inv_1', events));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is order-independent — shuffled input yields the same projection', () => {
    const events = loadRecordedEvents();
    const shuffled = [...events].reverse();
    const a = toPanelView(fold('inv_1', events));
    const b = toPanelView(fold('inv_1', shuffled));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('accumulates cost from every cost.consumed event (E6)', () => {
    const state = fold('inv_1', loadRecordedEvents());
    // 0.12 + 0.03
    expect(state.runSummary.costUsd).toBeCloseTo(0.15, 6);
    // Each cost event yields a log line.
    const costLogs = state.logs.filter((l) => l.text.startsWith('cost +'));
    expect(costLogs.length).toBe(2);
  });

  it('tracks pipeline steps and pending actions', () => {
    const view = toPanelView(fold('inv_1', loadRecordedEvents()));
    expect(view.pipeline.steps.find((s) => s.stepId === 'gather')?.status).toBe('completed');
    expect(view.pendingActions).toHaveLength(1);
    expect(view.pendingActions[0]).toMatchObject({ actionId: 'act1', status: 'proposed' });
  });

  it('records agent invocation detail with tool-call count and cost', () => {
    const state = fold('inv_1', loadRecordedEvents());
    const a1 = state.agents.get('a1');
    expect(a1?.status).toBe('completed');
    expect(a1?.toolCalls).toBe(1);
    expect(a1?.costUsd).toBeCloseTo(0.12, 6);
  });

  it('normalizes the agent id to its canonical role (service-schema parity, #25)', () => {
    // The recorded fixture emits the deprecated local-pipeline name
    // `production-analyzer`; the reducer must fold it to the canonical
    // `change-analyzer` so every IDE panel shows the canonical taxonomy.
    const state = fold('inv_1', loadRecordedEvents());
    const a1 = state.agents.get('a1');
    expect(a1?.agentId).toBe('change-analyzer');
    // The cost log line carries the same canonical id.
    const costLog = state.logs.find((l) => l.text.startsWith('cost +'));
    expect(costLog?.agentId).toBe('change-analyzer');
  });
});
