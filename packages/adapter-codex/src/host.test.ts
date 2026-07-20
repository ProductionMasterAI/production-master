import { describe, it, expect } from 'vitest';
import { runConformanceScenario, RECORDED_EVENTS } from '@production-master/plugin-core/testing';
import { fold, toPanelView, renderPanelCommands } from '@production-master/plugin-core';
import { CodexHostAdapter } from './host.js';
import { CapturingCodexSinks } from './__fixtures__/capturing-sinks.js';

describe('CodexHostAdapter', () => {
  it('streams a run from fixtures into the Codex panel (terminal completed)', async () => {
    const sinks = new CapturingCodexSinks('reject');
    const host = new CodexHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(result.status).toBe('completed');
    expect(sinks.panels.length).toBeGreaterThan(0);
    const last = sinks.panels.at(-1)!;
    expect(last.schemaVersion).toBe('codex-panel.v1');
    expect(last.commands[0].kind).toBe('statusline');
    expect((last.commands[0] as { text: string }).text).toContain('PM completed');
  });

  it('registers the scoped MCP server and never leaks the session JWT to the panel', async () => {
    const sinks = new CapturingCodexSinks('reject');
    const host = new CodexHostAdapter(sinks);
    await runConformanceScenario(host);

    expect(sinks.mcpConfigs.length).toBe(1);
    expect(host.getRegisteredEndpoint()).toBe('mcp://fixture/inv_demo');
    expect(JSON.stringify(sinks.panels)).not.toContain('fixture-session-jwt');
  });

  it('modal-gates a mutation; a reject never reaches the service', async () => {
    const sinks = new CapturingCodexSinks('reject');
    const host = new CodexHostAdapter(sinks);
    const result = await runConformanceScenario(host);

    expect(sinks.modalPreviews.map((p) => p.tool)).toEqual(['investigation.add_evidence']);
    expect(result.rejectedMutationCode).toBe('USER_REJECTED_CONFIRMATION');
    expect(result.audit).toEqual([
      { type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_demo' },
    ]);
    expect(result.mcpCallsReachingService).toEqual([]);
  });

  it('renders host-neutral commands identical to a direct fold of the stream', async () => {
    const sinks = new CapturingCodexSinks('reject');
    const host = new CodexHostAdapter(sinks);
    await runConformanceScenario(host);
    const expected = renderPanelCommands(toPanelView(fold('inv_demo', RECORDED_EVENTS)));
    expect(sinks.panels.at(-1)!.commands).toEqual(expected);
  });

  it('approve reaches the service; subscribeUi fans out then unsubscribes', async () => {
    const sinks = new CapturingCodexSinks('approve');
    const host = new CodexHostAdapter(sinks);
    const result = await runConformanceScenario(host);
    expect(result.mcpCallsReachingService).toEqual(['investigation.add_evidence']);

    const seen: string[] = [];
    const unsub = host.subscribeUi((e) => seen.push(e.type));
    host.emitUi({ type: 'refresh' });
    unsub();
    host.emitUi({ type: 'open-report' });
    expect(seen).toEqual(['refresh']);
  });
});
