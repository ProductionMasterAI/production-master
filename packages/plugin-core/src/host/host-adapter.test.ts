import { describe, it, expect, vi } from 'vitest';
import { NoopHostAdapter } from './__fixtures__/noop-host-adapter.js';
import type { McpServerConfig } from './host-adapter.js';
import type { MutationPreviewV1, PanelView } from '../types.js';

const sampleCfg: McpServerConfig = {
  endpoint: 'https://mcp.example/sess',
  audience: 'pm-mcp',
  sessionJwt: 'jwt.scoped.token',
  scopes: ['read-investigation', 'write-investigation'],
};

const samplePreview: MutationPreviewV1 = {
  schemaVersion: 'mutation-preview.v1',
  tool: 'investigation.add_evidence',
  investigationId: 'inv_1',
  summary: 'Add evidence: log excerpt',
};

const samplePanel: PanelView = {
  runSummary: {
    investigationId: 'inv_1',
    status: 'running',
    costUsd: 0,
  },
  pipeline: { investigationId: 'inv_1', steps: [] },
  logs: [],
  pendingActions: [],
};

describe('NoopHostAdapter', () => {
  it('records registerMcpServer calls', async () => {
    const host = new NoopHostAdapter();
    await host.registerMcpServer(sampleCfg);
    expect(host.calls).toEqual([{ method: 'registerMcpServer', arg: sampleCfg }]);
  });

  it('returns the configured mutation decision and captures the preview', async () => {
    const host = new NoopHostAdapter('reject');
    const decision = await host.showMutationPreview(samplePreview);
    expect(decision).toBe('reject');
    expect(host.mutationPreviews).toEqual([samplePreview]);
  });

  it('can flip the mutation decision', async () => {
    const host = new NoopHostAdapter('reject');
    host.setMutationDecision('approve');
    expect(await host.showMutationPreview(samplePreview)).toBe('approve');
  });

  it('captures rendered panel views', () => {
    const host = new NoopHostAdapter();
    host.renderPanel(samplePanel);
    expect(host.renderedViews).toEqual([samplePanel]);
  });

  it('delivers and unsubscribes UI events', () => {
    const host = new NoopHostAdapter();
    const cb = vi.fn();
    const unsubscribe = host.subscribeUi(cb);
    host.emitUi({ type: 'refresh' });
    expect(cb).toHaveBeenCalledWith({ type: 'refresh' });
    unsubscribe();
    host.emitUi({ type: 'refresh' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('records openExternalUrl calls', async () => {
    const host = new NoopHostAdapter();
    await host.openExternalUrl('https://verify.example/device');
    expect(host.calls.some((c) => c.method === 'openExternalUrl')).toBe(true);
  });
});
