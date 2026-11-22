import { describe, it, expect } from 'vitest';
import { runConformanceScenario, RECORDED_EVENTS } from '@production-master/plugin-core/testing';
import { fold, toPanelView, renderPanelCommands } from '@production-master/plugin-core';
import { CursorHostAdapter } from './host.js';
import { CapturingCursorSinks } from './__fixtures__/capturing-sinks.js';

describe('CursorHostAdapter', () => {
  it('registers the MCP server and streams a run into the side panel (completed)', async () => {
    const sinks = new CapturingCursorSinks('reject');
    const host = new CursorHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(result.status).toBe('completed');
    expect(sinks.mcpConfigs.length).toBe(1);
    expect(host.getRegisteredEndpoint()).toBe('mcp://fixture/inv_demo');
    expect(sinks.sidePanels.length).toBeGreaterThan(0);
    const last = sinks.sidePanels.at(-1)!;
    expect(last.schemaVersion).toBe('cursor-side-panel.v1');
    expect((last.commands[0] as { text: string }).text).toContain('PM completed');
  });

  it('never leaks the session JWT to the side panel', async () => {
    const sinks = new CapturingCursorSinks('reject');
    const host = new CursorHostAdapter(sinks);
    await runConformanceScenario(host);
    expect(JSON.stringify(sinks.sidePanels)).not.toContain('fixture-session-jwt');
  });

  it('modal-gates a mutation; a reject never reaches the service', async () => {
    const sinks = new CapturingCursorSinks('reject');
    const host = new CursorHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(sinks.modalPreviews.map((p) => p.tool)).toEqual(['investigation.add_evidence']);
    expect(result.rejectedMutationCode).toBe('USER_REJECTED_CONFIRMATION');
    expect(result.audit).toEqual([
      { type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_demo' },
    ]);
    expect(result.mcpCallsReachingService).toEqual([]);
  });

  it('renders host-neutral commands identical to a direct fold of the stream', async () => {
    const sinks = new CapturingCursorSinks('reject');
    const host = new CursorHostAdapter(sinks);
    await runConformanceScenario(host);
    const expected = renderPanelCommands(toPanelView(fold('inv_demo', RECORDED_EVENTS)));
    expect(sinks.sidePanels.at(-1)!.commands).toEqual(expected);
  });

  it('approve reaches the service; openExternalUrl forwards to the sink', async () => {
    const sinks = new CapturingCursorSinks('approve');
    const host = new CursorHostAdapter(sinks);
    const result = await runConformanceScenario(host);
    expect(result.mcpCallsReachingService).toEqual(['investigation.add_evidence']);
    await host.openExternalUrl('https://device.example/verify');
    expect(sinks.openedUrls).toEqual(['https://device.example/verify']);
  });

  it('fans UI events out to every subscriber; unsubscribing detaches only that one', () => {
    const host = new CursorHostAdapter(new CapturingCursorSinks());
    const first: unknown[] = [];
    const second: unknown[] = [];
    const unsubFirst = host.subscribeUi((e) => first.push(e));
    host.subscribeUi((e) => second.push(e));

    host.emitUi({ type: 'approve-action', actionId: 'act1' });
    unsubFirst();
    host.emitUi({ type: 'reject-action', actionId: 'act2' });

    expect(first).toEqual([{ type: 'approve-action', actionId: 'act1' }]);
    expect(second).toEqual([
      { type: 'approve-action', actionId: 'act1' },
      { type: 'reject-action', actionId: 'act2' },
    ]);
  });

  it('emitUi with no subscribers is a no-op, and a repeat unsubscribe is harmless', () => {
    const host = new CursorHostAdapter(new CapturingCursorSinks());
    host.emitUi({ type: 'refresh' });
    const seen: string[] = [];
    const unsub = host.subscribeUi((e) => seen.push(e.type));
    unsub();
    unsub();
    host.emitUi({ type: 'open-report' });
    expect(seen).toEqual([]);
  });
});
