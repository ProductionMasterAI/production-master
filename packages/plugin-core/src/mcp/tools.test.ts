import { describe, it, expect, vi } from 'vitest';
import { McpTools } from './tools.js';
import { McpSessionManager } from './session-manager.js';
import { FakeMcpTransport } from './__fixtures__/fake-mcp-transport.js';
import { NoopHostAdapter } from '../host/__fixtures__/noop-host-adapter.js';
import { ToolError } from './types.js';
import type { McpSessionGrant } from './types.js';
import { SessionTrustGrantStore } from '../trust/session-grants.js';
import { InsufficientScopeError } from '../service/types.js';

const grant: McpSessionGrant = { endpoint: 'https://mcp/s', audience: 'pm-mcp', sessionJwt: 'jwt-1', ttlSeconds: 600 };

async function setup(decision: 'approve' | 'reject' = 'approve') {
  const host = new NoopHostAdapter(decision);
  const sessions = new McpSessionManager({
    client: {} as any,
    host,
    createServiceSession: async () => grant,
  });
  await sessions.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
  const transport = new FakeMcpTransport();
  const audit = vi.fn();
  const tools = new McpTools({ sessions, host, transport, audit, newIdempotencyKey: () => 'idem-1' });
  return { host, sessions, transport, audit, tools };
}

describe('McpTools', () => {
  it('read tool calls carry the session JWT and need no confirmation', async () => {
    const { tools, transport, host } = await setup();
    await tools.invoke('investigation.get_summary', { investigationId: 'inv_1' });
    expect(transport.calls[0].sessionJwt).toBe('jwt-1');
    // No mutation preview shown for a read.
    expect(host.mutationPreviews).toHaveLength(0);
  });

  it('mutation tool shows a preview and proceeds on approve with an idempotency key', async () => {
    const { tools, transport, host } = await setup('approve');
    await tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'log' });
    expect(host.mutationPreviews[0].tool).toBe('investigation.add_evidence');
    expect(transport.calls[0].idempotencyKey).toBe('idem-1');
  });

  it('a rejected mutation never reaches the service and emits an audit event', async () => {
    const { tools, transport, audit } = await setup('reject');
    await expect(
      tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'log' }),
    ).rejects.toMatchObject({ code: 'USER_REJECTED_CONFIRMATION' });
    expect(transport.calls).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith({ type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_1' });
  });

  it('out-of-scope investigationId is PERMISSION_DENIED before any wire call', async () => {
    const { tools, transport } = await setup();
    await expect(
      tools.invoke('investigation.get_summary', { investigationId: 'inv_OTHER' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(transport.calls).toHaveLength(0);
  });

  it('maps service 403 to PERMISSION_DENIED and 409 to IDEMPOTENCY_CONFLICT', async () => {
    const { tools, transport } = await setup();
    transport.on('investigation.get_summary', 403, { message: 'no' });
    await expect(tools.invoke('investigation.get_summary', { investigationId: 'inv_1' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    transport.on('investigation.create_snapshot', 409, { message: 'dup' });
    await expect(tools.invoke('investigation.create_snapshot', { investigationId: 'inv_1' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects an unknown tool name', async () => {
    const { tools } = await setup();
    await expect(tools.invoke('investigation.frobnicate', { investigationId: 'inv_1' })).rejects.toBeInstanceOf(ToolError);
  });

  it('throws PERMISSION_DENIED when there is no active session', async () => {
    const host = new NoopHostAdapter();
    const sessions = new McpSessionManager({ client: {} as any, host, createServiceSession: async () => grant });
    const tools = new McpTools({ sessions, host, transport: new FakeMcpTransport() });
    await expect(tools.invoke('investigation.get_summary', { investigationId: 'inv_1' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

describe('McpTools trust-grant gating (Q9)', () => {
  async function trustSetup(decision: 'approve' | 'reject' = 'approve') {
    const host = new NoopHostAdapter(decision);
    const sessions = new McpSessionManager({ client: {} as any, host, createServiceSession: async () => grant });
    // Read-only connect: no baseline grant is minted, so mutations must expand.
    await sessions.createSession(['inv_1'], ['read-investigation']);
    const transport = new FakeMcpTransport();
    const audit = vi.fn();
    const trust = new SessionTrustGrantStore();
    const emitTrustExpansion = vi.fn();
    const tools = new McpTools({
      sessions,
      host,
      transport,
      audit,
      trust,
      emitTrustExpansion,
      newIdempotencyKey: () => 'idem-1',
      newGrantId: () => 'grant-test-1',
    });
    return { host, transport, audit, trust, emitTrustExpansion, tools };
  }

  it('an uncovered mutation prompts, records a grant, and mirrors the expansion to the service', async () => {
    const { tools, host, transport, trust, emitTrustExpansion } = await trustSetup('approve');
    await tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'log' });

    // The user was prompted (trust expansion) and the wire call went through.
    expect(host.mutationPreviews).toHaveLength(1);
    expect(transport.calls).toHaveLength(1);
    // The grant is now tracked and audited locally...
    expect(trust.match({ investigationId: 'inv_1', riskClass: 'low', reversibility: 'reversible' })?.grantId).toBe('grant-test-1');
    expect(trust.drainAudit().map((e) => e.type)).toEqual(['trust-grant-issued']);
    // ...and mirrored to the authoritative service ledger.
    expect(emitTrustExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trust-grant-issued', grant: expect.objectContaining({ grantId: 'grant-test-1', investigationId: 'inv_1' }) }),
    );
  });

  it('a mutation covered by an active grant proceeds without a fresh prompt', async () => {
    const { tools, host, transport, trust, emitTrustExpansion } = await trustSetup('approve');
    trust.issue({
      grantId: 'pre',
      investigationId: 'inv_1',
      riskClass: 'low',
      reversibility: 'reversible',
      sessionLabel: 's',
      grantedAt: '2026-07-08T00:00:00Z',
    });
    await tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'log' });

    expect(host.mutationPreviews).toHaveLength(0); // no re-prompt
    expect(transport.calls).toHaveLength(1); // still executes
    expect(emitTrustExpansion).not.toHaveBeenCalled(); // no new expansion
  });

  it('a higher-risk mutation still expands even after a low baseline grant', async () => {
    const { tools, host, trust } = await trustSetup('approve');
    trust.issue({
      grantId: 'baseline',
      investigationId: 'inv_1',
      riskClass: 'low',
      reversibility: 'reversible',
      sessionLabel: 's',
      grantedAt: '2026-07-08T00:00:00Z',
    });
    // rerun_from_phase is high/compensable — outside the low/reversible baseline.
    await tools.invoke('investigation.rerun_from_phase', { investigationId: 'inv_1', phase: 'gather' });
    expect(host.mutationPreviews.map((p) => p.tool)).toEqual(['investigation.rerun_from_phase']);
  });

  it('a denied trust expansion never reaches the service and mints no grant', async () => {
    const { tools, transport, audit, trust, emitTrustExpansion } = await trustSetup('reject');
    await expect(
      tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'log' }),
    ).rejects.toMatchObject({ code: 'USER_REJECTED_CONFIRMATION' });

    expect(transport.calls).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith({ type: 'user.mutation_rejected', tool: 'investigation.add_evidence', investigationId: 'inv_1' });
    expect(trust.listActive('inv_1')).toHaveLength(0);
    expect(emitTrustExpansion).not.toHaveBeenCalled();
  });
});

describe('McpTools session expiry and read-only fallback', () => {
  function mkSessions(host: NoopHostAdapter, clock: { t: number }, create?: (scopes: string[]) => Promise<McpSessionGrant>) {
    let n = 0;
    return new McpSessionManager({
      client: {} as any,
      host,
      now: () => clock.t,
      notify: () => {},
      createServiceSession: async (_ids, scopes) =>
        create ? create(scopes) : { ...grant, sessionJwt: `jwt-${++n}`, ttlSeconds: 300 },
    });
  }

  it('re-mints before exp so the call carries the fresh session JWT', async () => {
    const host = new NoopHostAdapter();
    const clock = { t: 0 };
    const sessions = mkSessions(host, clock);
    await sessions.createSession(['inv_1'], ['read-investigation']);
    const transport = new FakeMcpTransport();
    const tools = new McpTools({ sessions, host, transport });
    clock.t = 290_000;
    await tools.invoke('investigation.get_summary', { investigationId: 'inv_1' });
    expect(transport.calls.map((c) => c.sessionJwt)).toEqual(['jwt-2']);
  });

  it('on a 401 re-mints once and retries with the new JWT and the same idempotency key', async () => {
    const host = new NoopHostAdapter('approve');
    const sessions = mkSessions(host, { t: 0 });
    await sessions.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
    const calls: Array<{ jwt: string; key?: string }> = [];
    const transport = {
      async call(o: { sessionJwt: string; idempotencyKey?: string }) {
        calls.push({ jwt: o.sessionJwt, key: o.idempotencyKey });
        return o.sessionJwt === 'jwt-1'
          ? { status: 401, body: { message: 'expired' } }
          : { status: 200, body: { ok: true } };
      },
    };
    const tools = new McpTools({ sessions, host, transport, newIdempotencyKey: () => 'idem-1' });
    const out = await tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'x' });
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([
      { jwt: 'jwt-1', key: 'idem-1' },
      { jwt: 'jwt-2', key: 'idem-1' },
    ]);
    // The user was asked once, not once per attempt.
    expect(host.mutationPreviews).toHaveLength(1);
  });

  it('a 401 that survives the re-mint is surfaced (not retried forever, not "not found")', async () => {
    const host = new NoopHostAdapter();
    const sessions = mkSessions(host, { t: 0 });
    await sessions.createSession(['inv_1'], ['read-investigation']);
    const transport = new FakeMcpTransport().on('investigation.get_summary', 401, { message: 'bad token' });
    const tools = new McpTools({ sessions, host, transport });
    await expect(
      tools.invoke('investigation.get_summary', { investigationId: 'inv_1' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', message: expect.stringMatching(/\/login/) });
    expect(transport.calls).toHaveLength(2);
  });

  it('refuses a mutation locally once the service has refused the write scope, without prompting', async () => {
    const host = new NoopHostAdapter('approve');
    const sessions = mkSessions(host, { t: 0 }, async (scopes) => {
      if (scopes.includes('write-investigation')) throw new InsufficientScopeError('runs:write', 'x');
      return grant;
    });
    await sessions.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
    const transport = new FakeMcpTransport();
    const tools = new McpTools({ sessions, host, transport });
    await expect(
      tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'x' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', message: expect.stringMatching(/engineer role/) });
    expect(host.mutationPreviews).toHaveLength(0);
    expect(transport.calls).toHaveLength(0);
    // Reads still work on the same session.
    await tools.invoke('investigation.get_summary', { investigationId: 'inv_1' });
    expect(transport.calls).toHaveLength(1);
  });
});

describe('McpTools 401 retry stays bound to the original investigation', () => {
  /** A mint that tags each JWT with its investigation and a running count. */
  function mkManager(host: NoopHostAdapter, extra?: (ids: string[], scopes: string[], n: number) => void) {
    const mints: Array<{ ids: string[]; scopes: string[] }> = [];
    const sessions = new McpSessionManager({
      client: {} as any,
      host,
      notify: () => {},
      createServiceSession: async (ids, scopes) => {
        mints.push({ ids, scopes });
        extra?.(ids, scopes, mints.length);
        return { ...grant, sessionJwt: `jwt-${ids[0]}-${mints.length}`, ttlSeconds: 600 };
      },
    });
    return { sessions, mints };
  }

  function deferredTransport() {
    const calls: Array<{ jwt: string; investigationId: unknown }> = [];
    let release: ((r: { status: number; body: unknown }) => void) | undefined;
    const transport = {
      call(o: { sessionJwt: string; args: Record<string, unknown> }) {
        calls.push({ jwt: o.sessionJwt, investigationId: o.args.investigationId });
        if (calls.length === 1) return new Promise<{ status: number; body: unknown }>((r) => (release = r));
        return Promise.resolve({ status: 200, body: { ok: true } });
      },
    };
    return { transport, calls, release: (r: { status: number; body: unknown }) => release?.(r) };
  }

  it.each([
    ['explicit investigationId', { investigationId: 'inv_A' }],
    ['investigationId omitted (bound to the session default)', {}],
  ])('a 401 after a switch to another investigation aborts, never retrying with its JWT (%s)', async (_n, args) => {
    const host = new NoopHostAdapter();
    const { sessions, mints } = mkManager(host);
    await sessions.createSession(['inv_A'], ['read-investigation']);
    const { transport, calls, release } = deferredTransport();
    const tools = new McpTools({ sessions, host, transport });

    const inflight = tools.invoke('investigation.get_summary', args);
    const settled = inflight.then(
      () => ({ ok: true as const }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    await new Promise((r) => setImmediate(r));
    await sessions.createSession(['inv_B'], ['read-investigation']); // switch while A is in flight
    release({ status: 401, body: { message: 'expired' } });

    const out = await settled;
    expect(out.ok).toBe(false);
    expect((out as { e: ToolError }).e).toMatchObject({
      code: 'PERMISSION_DENIED',
      message: expect.stringMatching(/switched/),
    });
    // One wire call only, with A's JWT; B's credentials never carried A's call.
    expect(calls).toEqual([{ jwt: 'jwt-inv_A-1', investigationId: (args as { investigationId?: string }).investigationId }]);
    // No re-mint was performed on A's behalf either (only A's create and B's create).
    expect(mints.map((m) => m.ids)).toEqual([['inv_A'], ['inv_B']]);
  });

  it('a mutation retry re-runs the checks: a refresh that comes back read-only is refused, not re-sent', async () => {
    const host = new NoopHostAdapter('approve');
    let mintCount = 0;
    const trust = new SessionTrustGrantStore();
    const sessionsWithTrust = new McpSessionManager({
      client: {} as any,
      host,
      trust,
      notify: () => {},
      newGrantId: () => 'g1',
      createServiceSession: async (_ids, scopes) => {
        mintCount++;
        if (mintCount > 1 && scopes.includes('write-investigation')) throw new InsufficientScopeError('runs:write', 'x');
        return { ...grant, sessionJwt: `jwt-${mintCount}`, ttlSeconds: 600 };
      },
    });
    await sessionsWithTrust.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
    const transport = new FakeMcpTransport().on('investigation.add_evidence', 401, { message: 'expired' });
    const tools = new McpTools({ sessions: sessionsWithTrust, host, transport, trust });

    await expect(
      tools.invoke('investigation.add_evidence', { investigationId: 'inv_1', text: 'x' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', message: expect.stringMatching(/read-only/) });
    // The first (401) attempt went out; the retry was refused locally.
    expect(transport.calls).toHaveLength(1);
  });

  it('with no switch, a 401 still re-mints once and retries with the new JWT', async () => {
    const host = new NoopHostAdapter();
    const { sessions } = mkManager(host);
    await sessions.createSession(['inv_A'], ['read-investigation']);
    const { transport, calls, release } = deferredTransport();
    const tools = new McpTools({ sessions, host, transport });
    const inflight = tools.invoke('investigation.get_summary', { investigationId: 'inv_A' });
    await new Promise((r) => setImmediate(r));
    release({ status: 401, body: { message: 'expired' } });
    await expect(inflight).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.jwt)).toEqual(['jwt-inv_A-1', 'jwt-inv_A-2']);
  });
});
