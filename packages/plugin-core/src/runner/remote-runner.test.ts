import { describe, it, expect } from 'vitest';
import { RemoteServiceRunner } from './remote-runner.js';
import { ServiceClient } from '../service/client.js';
import { FakeTransport } from '../service/__fixtures__/fake-transport.js';
import { FixtureConnector } from '../stream/__fixtures__/fixture-connector.js';
import { NoopHostAdapter } from '../host/__fixtures__/noop-host-adapter.js';
import { loadRecordedEvents } from '../__fixtures__/load-events.js';
import type { Run } from '../service/types.js';

const createdRun: Run = {
  investigationId: 'inv_1',
  status: 'created',
  createdAt: '2026-06-12T10:00:00Z',
  costUsd: 0,
};

function makeClient() {
  const transport = new FakeTransport().on('POST', '/v1/runs', () => ({
    status: 201,
    body: createdRun,
  }));
  return new ServiceClient({ transport, getAuthToken: () => 'tok', newIdempotencyKey: () => 'k1' });
}

describe('RemoteServiceRunner', () => {
  it('streams a full run to terminal and resolves with the report uri', async () => {
    const frames = loadRecordedEvents();
    const host = new NoopHostAdapter();
    const runner = new RemoteServiceRunner({
      client: makeClient(),
      host,
      connector: new FixtureConnector(frames),
      streamUrlFor: (id) => `sse://svc/${id}`,
      authHeader: () => 'tok',
    });

    const result = await runner.run({ ticket: 'INC-1' });

    expect(result.status).toBe('completed');
    expect(result.reportUri).toBe('https://svc.example/reports/inv_1.md');
    expect(result.costUsd).toBeCloseTo(0.15, 6);
  });

  it('renders the panel live — final view shows completed + pending action', async () => {
    const frames = loadRecordedEvents();
    const host = new NoopHostAdapter();
    const runner = new RemoteServiceRunner({
      client: makeClient(),
      host,
      connector: new FixtureConnector(frames),
      streamUrlFor: (id) => `sse://svc/${id}`,
    });

    await runner.run({ ticket: 'INC-1' });

    // renderPanel called once per event + the initial created frame.
    const renders = host.renderedViews;
    expect(renders.length).toBeGreaterThan(1);
    const last = renders[renders.length - 1];
    expect(last.runSummary.status).toBe('completed');
    expect(last.pendingActions).toHaveLength(1);
  });

  it('makes NO LLM/agent call — only client + host calls occur (thin client)', async () => {
    const frames = loadRecordedEvents();
    const host = new NoopHostAdapter();
    const runner = new RemoteServiceRunner({
      client: makeClient(),
      host,
      connector: new FixtureConnector(frames),
      streamUrlFor: (id) => `sse://svc/${id}`,
    });

    await runner.run({ ticket: 'INC-1' });

    // The only host methods the remote path is allowed to touch are renderPanel
    // (and, in mutation flows, showMutationPreview). It must NEVER register a
    // local agent or call anything LLM-shaped — there is no such seam here.
    const methods = new Set(host.calls.map((c) => c.method));
    expect([...methods].every((m) => m === 'renderPanel')).toBe(true);
  });

  it('survives a mid-stream drop and still reaches terminal (replay, no gaps)', async () => {
    const frames = loadRecordedEvents();
    const host = new NoopHostAdapter();
    const runner = new RemoteServiceRunner({
      client: makeClient(),
      host,
      connector: new FixtureConnector(frames, 6), // drop after 6 frames
      streamUrlFor: (id) => `sse://svc/${id}`,
    });

    const result = await runner.run({ ticket: 'INC-1' });
    expect(result.status).toBe('completed');
    expect(result.costUsd).toBeCloseTo(0.15, 6);
  });

  it('with presence: attaches on connect and detaches when the stream terminates', async () => {
    const frames = loadRecordedEvents();
    const host = new NoopHostAdapter();
    const snapshot = { investigationId: 'inv_1', entries: [] };
    const transport = new FakeTransport()
      .on('POST', '/v1/runs', () => ({ status: 201, body: createdRun }))
      .on('POST', '/v1/investigations/inv_1/presence', () => ({
        status: 200,
        body: snapshot,
      }))
      .on('DELETE', '/v1/investigations/inv_1/presence', () => ({
        status: 200,
        body: snapshot,
      }));
    const client = new ServiceClient({
      transport,
      getAuthToken: () => 'tok',
      newIdempotencyKey: () => 'k1',
    });
    const runner = new RemoteServiceRunner({
      client,
      host,
      connector: new FixtureConnector(frames),
      streamUrlFor: (id) => `sse://svc/${id}`,
    });

    const result = await runner.run(
      { ticket: 'INC-1' },
      // Large interval so the run terminates on replay before any timer beat —
      // we assert exactly one attach (on connect) + one detach (on finish).
      { presence: { surface: 'claude-code', intervalMs: 60_000 } },
    );

    expect(result.status).toBe('completed');
    const presenceReqs = transport.received.filter((r) =>
      r.path.endsWith('/presence'),
    );
    const attach = presenceReqs.find((r) => r.method === 'POST');
    const detach = presenceReqs.find((r) => r.method === 'DELETE');
    expect(attach?.body).toEqual({ surface: 'claude-code' });
    expect(detach?.body).toEqual({ surface: 'claude-code' });
  });
});
