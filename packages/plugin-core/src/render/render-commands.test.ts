import { describe, it, expect } from 'vitest';
import { renderPanelCommands, statuslineText, LOG_TAIL } from './render-commands.js';
import { fold, toPanelView } from '../projections/index.js';
import { loadRecordedEvents } from '../__fixtures__/load-events.js';
import type { PanelView } from '../types.js';

function emptyView(): PanelView {
  return {
    runSummary: { investigationId: 'inv_1', status: 'created', costUsd: 0 },
    pipeline: { investigationId: 'inv_1', steps: [] },
    logs: [],
    pendingActions: [],
  };
}

describe('renderPanelCommands', () => {
  it('emits the canonical command order: statusline, pipeline, log-tail, actions', () => {
    const cmds = renderPanelCommands(emptyView());
    expect(cmds.map((c) => c.kind)).toEqual(['statusline', 'pipeline', 'log-tail', 'actions']);
  });

  it('is deterministic — identical view yields identical commands', () => {
    const view = toPanelView(fold('inv_1', loadRecordedEvents()));
    expect(renderPanelCommands(view)).toEqual(renderPanelCommands(structuredClone(view)));
  });

  it('appends a report link only when a reportUri is present', () => {
    const view = toPanelView(fold('inv_1', loadRecordedEvents()));
    const cmds = renderPanelCommands(view);
    const link = cmds.find((c) => c.kind === 'link');
    if (view.runSummary.reportUri) {
      expect(link).toBeTruthy();
      expect((link as { url: string }).url).toBe(view.runSummary.reportUri);
    } else {
      expect(link).toBeUndefined();
    }
  });

  it('caps the log tail at LOG_TAIL lines', () => {
    const view = emptyView();
    for (let i = 0; i < LOG_TAIL + 20; i++) {
      view.logs.push({ sequence: i, timestamp: '', level: 'info', text: `line ${i}` });
    }
    const tail = renderPanelCommands(view).find((c) => c.kind === 'log-tail') as { lines: unknown[] };
    expect(tail.lines.length).toBe(LOG_TAIL);
  });

  it('marks only proposed actions as actionable', () => {
    const view = emptyView();
    view.pendingActions = [
      { actionId: 'a1', kind: 'resume', summary: 's', status: 'proposed' },
      { actionId: 'a2', kind: 'resume', summary: 's', status: 'approved' },
      { actionId: 'a3', kind: 'resume', summary: 's', status: 'executed' },
    ];
    const cmd = renderPanelCommands(view).find((c) => c.kind === 'actions') as {
      actions: Array<{ actionId: string; actionable: boolean }>;
    };
    expect(cmd.actions.map((a) => a.actionable)).toEqual([true, false, false]);
  });

  it('statuslineText returns the compact one-line summary', () => {
    const view = toPanelView(fold('inv_1', loadRecordedEvents()));
    const text = statuslineText(view);
    expect(text).toContain('PM ');
    expect(text).toContain('steps');
    expect(text).toMatch(/\$\d+\.\d{4}/);
  });
});
