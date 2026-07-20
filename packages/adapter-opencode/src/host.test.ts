import { describe, it, expect } from 'vitest';
import { runConformanceScenario, RECORDED_EVENTS } from '@production-master/plugin-core/testing';
import { fold, toPanelView, renderPanelCommands } from '@production-master/plugin-core';
import { OpenCodeHostAdapter } from './host.js';
import { CapturingOpenCodeSinks } from './__fixtures__/capturing-sinks.js';

describe('OpenCodeHostAdapter', () => {
  it('registers the MCP server and streams a run into the TUI panel (completed)', async () => {
    const sinks = new CapturingOpenCodeSinks('reject');
    const host = new OpenCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(result.status).toBe('completed');
    expect(sinks.mcpConfigs.length).toBe(1);
    expect(host.getRegisteredEndpoint()).toBe('mcp://fixture/inv_demo');
    expect(sinks.tuiPanels.length).toBeGreaterThan(0);
    const last = sinks.tuiPanels.at(-1)!;
    expect(last.schemaVersion).toBe('opencode-tui-panel.v1');
    expect((last.commands[0] as { text: string }).text).toContain('PM completed');
  });

  it('never leaks the session JWT to the TUI panel', async () => {
    const sinks = new CapturingOpenCodeSinks('reject');
    const host = new OpenCodeHostAdapter(sinks);
    await runConformanceScenario(host);
    expect(JSON.stringify(sinks.tuiPanels)).not.toContain('fixture-session-jwt');
  });

  it('modal-gates a mutation; a reject never reaches the service', async () => {
    const sinks = new CapturingOpenCodeSinks('reject');
    const host = new OpenCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(sinks.modalPreviews.map((p) => p.tool)).toEqual(['investigation.add_evidence']);
    expect(result.rejectedMutationCode).toBe('USER_REJECTED_CONFIRMATION');
    expect(result.audit).toEqual([
      { type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_demo' },
    ]);
    expect(result.mcpCallsReachingService).toEqual([]);
  });

  it('renders host-neutral commands identical to a direct fold of the stream', async () => {
    const sinks = new CapturingOpenCodeSinks('reject');
    const host = new OpenCodeHostAdapter(sinks);
    await runConformanceScenario(host);
    const expected = renderPanelCommands(toPanelView(fold('inv_demo', RECORDED_EVENTS)));
    expect(sinks.tuiPanels.at(-1)!.commands).toEqual(expected);
  });

  it('approve reaches the service; openExternalUrl forwards to the sink', async () => {
    const sinks = new CapturingOpenCodeSinks('approve');
    const host = new OpenCodeHostAdapter(sinks);
    const result = await runConformanceScenario(host);
    expect(result.mcpCallsReachingService).toEqual(['investigation.add_evidence']);
    await host.openExternalUrl('https://device.example/verify');
    expect(sinks.openedUrls).toEqual(['https://device.example/verify']);
  });
});
