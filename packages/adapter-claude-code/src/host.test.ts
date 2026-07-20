import { describe, it, expect } from 'vitest';
import { runConformanceScenario, RECORDED_EVENTS } from '@production-master/plugin-core/testing';
import { fold, toPanelView, renderPanelCommands } from '@production-master/plugin-core';
import { ClaudeCodeHostAdapter } from './host.js';
import { CapturingSinks } from './__fixtures__/capturing-sinks.js';

describe('ClaudeCodeHostAdapter', () => {
  it('streams a run from fixtures into the statusline (terminal completed)', async () => {
    const sinks = new CapturingSinks('reject');
    const host = new ClaudeCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(result.status).toBe('completed');
    // Statusline was painted at least once per rendered frame.
    expect(sinks.statuslines.length).toBeGreaterThan(0);
    const lastStatus = sinks.statuslines.at(-1)!;
    expect(lastStatus).toContain('PM completed');
    // A side-panel batch was rendered with the canonical command order.
    const lastBatch = sinks.panelBatches.at(-1)!;
    expect(lastBatch[0].kind).toBe('statusline');
    expect(lastBatch.map((c) => c.kind)).toContain('pipeline');
    expect(lastBatch.map((c) => c.kind)).toContain('actions');
  });

  it('registers the scoped MCP server without leaking the session JWT to render sinks', async () => {
    const sinks = new CapturingSinks('reject');
    const host = new ClaudeCodeHostAdapter(sinks);
    await runConformanceScenario(host);

    expect(sinks.mcpConfigs.length).toBe(1);
    expect(host.getRegisteredEndpoint()).toBe('mcp://fixture/inv_demo');
    // The JWT must never appear in any statusline or panel render.
    const allRendered = JSON.stringify(sinks.statuslines) + JSON.stringify(sinks.panelBatches);
    expect(allRendered).not.toContain('fixture-session-jwt');
  });

  it('modal-gates a mutation and a reject never reaches the service', async () => {
    const sinks = new CapturingSinks('reject');
    const host = new ClaudeCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(sinks.modalPreviews.length).toBe(1);
    expect(sinks.modalPreviews[0].tool).toBe('investigation.add_evidence');
    expect(result.rejectedMutationCode).toBe('USER_REJECTED_CONFIRMATION');
    expect(result.audit).toEqual([
      { type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_demo' },
    ]);
    expect(result.mcpCallsReachingService).toEqual([]);
  });

  it('renders the host-neutral commands identical to a direct fold of the stream', async () => {
    const sinks = new CapturingSinks('reject');
    const host = new ClaudeCodeHostAdapter(sinks);
    await runConformanceScenario(host);

    const expected = renderPanelCommands(toPanelView(fold('inv_demo', RECORDED_EVENTS)));
    expect(sinks.panelBatches.at(-1)).toEqual(expected);
  });

  it('approves a mutation when the modal returns approve (reaches service)', async () => {
    const sinks = new CapturingSinks('approve');
    const host = new ClaudeCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    // With approve, the add_evidence call reaches the fake transport.
    expect(result.mcpCallsReachingService).toEqual(['investigation.add_evidence']);
    expect(result.audit).toEqual([]);
  });

  it('fans UI events out to plugin-core subscribers and unsubscribes cleanly', () => {
    const sinks = new CapturingSinks();
    const host = new ClaudeCodeHostAdapter(sinks);
    const seen: string[] = [];
    const unsub = host.subscribeUi((e) => seen.push(e.type));
    host.emitUi({ type: 'approve-action', actionId: 'act1' });
    host.emitUi({ type: 'open-report' });
    unsub();
    host.emitUi({ type: 'refresh' });
    expect(seen).toEqual(['approve-action', 'open-report']);
  });

  it('openExternalUrl forwards to the host sink', async () => {
    const sinks = new CapturingSinks();
    const host = new ClaudeCodeHostAdapter(sinks);
    await host.openExternalUrl('https://device.example/verify');
    expect(sinks.openedUrls).toEqual(['https://device.example/verify']);
  });
});
