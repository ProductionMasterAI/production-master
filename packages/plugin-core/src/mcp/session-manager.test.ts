import { describe, it, expect, vi } from 'vitest';
import { McpSessionManager } from './session-manager.js';
import { NoopHostAdapter } from '../host/__fixtures__/noop-host-adapter.js';
import { SessionTrustGrantStore } from '../trust/session-grants.js';
import { InsufficientScopeError } from '../service/types.js';
import type { Scope } from '../types.js';
import type { McpSessionGrant } from './types.js';

function grant(jwt: string): McpSessionGrant {
  return { endpoint: 'https://mcp.example/s', audience: 'pm-mcp', sessionJwt: jwt, ttlSeconds: 600 };
}

describe('McpSessionManager', () => {
  it('registers an MCP server with the host on createSession', async () => {
    const host = new NoopHostAdapter();
    const mgr = new McpSessionManager({
      client: {} as any,
      host,
      createServiceSession: async () => grant('jwt-1'),
    });
    await mgr.createSession(['inv_1'], ['read-investigation']);
    expect(host.calls.some((c) => c.method === 'registerMcpServer')).toBe(true);
    expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-1');
  });

  it('discards the prior session on switch — never reused', async () => {
    const host = new NoopHostAdapter();
    let n = 0;
    const mgr = new McpSessionManager({
      client: {} as any,
      host,
      createServiceSession: async () => grant(`jwt-${++n}`),
    });
    await mgr.createSession(['inv_1'], ['read-investigation']);
    await mgr.createSession(['inv_2'], ['read-investigation']);
    expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-2');
    expect(mgr.isInScope('inv_1')).toBe(false);
    expect(mgr.isInScope('inv_2')).toBe(true);
  });

  it('discard() clears the active session', async () => {
    const mgr = new McpSessionManager({
      client: {} as any,
      host: new NoopHostAdapter(),
      createServiceSession: async () => grant('j'),
    });
    await mgr.createSession(['inv_1'], []);
    mgr.discard();
    expect(mgr.getActiveSession()).toBeUndefined();
  });

  describe('trust grants on connect (Q9)', () => {
    function trustMgr(trust: SessionTrustGrantStore, emit = vi.fn()) {
      let n = 0;
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        createServiceSession: async () => grant(`jwt-${++n}`),
        trust,
        emitTrustExpansion: emit,
        newGrantId: () => `g-${n}`,
      });
      return { mgr, emit };
    }

    it('a write-scoped connect mints and audits a baseline grant, mirrored to the service', async () => {
      const trust = new SessionTrustGrantStore();
      const { mgr, emit } = trustMgr(trust);
      await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']);

      const active = trust.listActive('inv_1');
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ riskClass: 'low', reversibility: 'reversible' });
      expect(trust.drainAudit().map((e) => e.type)).toEqual(['trust-grant-issued']);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'trust-grant-issued' }));
    });

    it('a read-only connect mints no grant — no capability expansion', async () => {
      const trust = new SessionTrustGrantStore();
      const { mgr, emit } = trustMgr(trust);
      await mgr.createSession(['inv_1'], ['read-investigation']);
      expect(trust.listActive('inv_1')).toHaveLength(0);
      expect(emit).not.toHaveBeenCalled();
    });

    it('discard revokes the session grants on exit and audits the revocation', async () => {
      const trust = new SessionTrustGrantStore();
      const { mgr, emit } = trustMgr(trust);
      await mgr.createSession(['inv_1'], ['write-investigation']);
      emit.mockClear();
      trust.drainAudit();

      mgr.discard();
      expect(trust.listActive('inv_1')).toHaveLength(0);
      expect(trust.drainAudit().map((e) => e.type)).toEqual(['trust-grant-revoked']);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'trust-grant-revoked' }));
    });

    it('switching investigations revokes the prior session grant', async () => {
      const trust = new SessionTrustGrantStore();
      const { mgr } = trustMgr(trust);
      await mgr.createSession(['inv_1'], ['write-investigation']);
      await mgr.createSession(['inv_2'], ['write-investigation']);
      expect(trust.listActive('inv_1')).toHaveLength(0);
      expect(trust.listActive('inv_2')).toHaveLength(1);
    });
  });

  describe('mint by what the caller holds (read-only fallback)', () => {
    const refuse = (scope: string) =>
      new InsufficientScopeError(scope, `missing ${scope}`);

    it('retries ONCE read-only on insufficient_scope/runs:write and tells the user', async () => {
      const host = new NoopHostAdapter();
      const calls: Scope[][] = [];
      const notify = vi.fn();
      const mgr = new McpSessionManager({
        client: {} as any,
        host,
        notify,
        createServiceSession: async (_ids, scopes) => {
          calls.push(scopes);
          if (scopes.includes('write-investigation')) throw refuse('runs:write');
          return grant('jwt-ro');
        },
      });
      const s = await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation', 'approve-action']);
      expect(calls).toEqual([
        ['read-investigation', 'write-investigation', 'approve-action'],
        ['read-investigation'],
      ]);
      expect(s.scopes).toEqual(['read-investigation']);
      expect(s.readOnly).toBe(true);
      expect(s.readOnlyFallback).toBe(true);
      // The host is registered with what was actually granted, not what was asked.
      const reg = host.calls.find((c) => c.method === 'registerMcpServer')?.arg as { scopes: Scope[] };
      expect(reg.scopes).toEqual(['read-investigation']);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toMatch(/read-only/);
      expect(notify.mock.calls[0][0]).toMatch(/runs:write/);
      expect(notify.mock.calls[0][0]).toMatch(/engineer role/);
    });

    it('issues no write trust grant for a read-only fallback session', async () => {
      const trust = new SessionTrustGrantStore();
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        trust,
        notify: () => {},
        createServiceSession: async (_ids, scopes) => {
          if (scopes.includes('write-investigation')) throw refuse('runs:write');
          return grant('j');
        },
      });
      await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
      expect(trust.listActive('inv_1')).toHaveLength(0);
    });

    it('does not retry when the refusal is runs:read (nothing weaker to ask for)', async () => {
      const create = vi.fn(async () => {
        throw refuse('runs:read');
      });
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        createServiceSession: create,
      });
      await expect(
        mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']),
      ).rejects.toMatchObject({ requiredScope: 'runs:read' });
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('does not retry other errors, and surfaces a second refusal from the retry', async () => {
      const boom = vi.fn(async () => {
        throw new Error('boom');
      });
      await expect(
        new McpSessionManager({ client: {} as any, host: new NoopHostAdapter(), createServiceSession: boom })
          .createSession(['inv_1'], ['write-investigation']),
      ).rejects.toThrow('boom');
      expect(boom).toHaveBeenCalledTimes(1);

      let n = 0;
      const both = vi.fn(async () => {
        throw refuse(++n === 1 ? 'runs:write' : 'runs:read');
      });
      await expect(
        new McpSessionManager({ client: {} as any, host: new NoopHostAdapter(), notify: () => {}, createServiceSession: both })
          .createSession(['inv_1'], ['read-investigation', 'write-investigation']),
      ).rejects.toMatchObject({ requiredScope: 'runs:read' });
      expect(both).toHaveBeenCalledTimes(2);
    });

    it('does not fall back (or notify) when only read was requested', async () => {
      const notify = vi.fn();
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        notify,
        createServiceSession: async () => grant('j'),
      });
      const s = await mgr.createSession(['inv_1'], ['read-investigation']);
      expect(s.readOnlyFallback).toBe(false);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('session expiry', () => {
    function expiring(ttlSeconds: number, extra: Record<string, unknown> = {}) {
      let t = 1_000_000;
      let n = 0;
      const calls: Scope[][] = [];
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        now: () => t,
        notify: () => {},
        createServiceSession: async (_ids, scopes) => {
          calls.push(scopes);
          return { ...grant(`jwt-${++n}`), ttlSeconds };
        },
        ...extra,
      });
      return { mgr, calls, advance: (ms: number) => (t += ms) };
    }

    it('re-mints shortly before expiry, not before', async () => {
      const { mgr, calls, advance } = expiring(300);
      await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
      advance(200_000); // 100 s left, outside the 30 s skew
      await mgr.ensureFresh();
      expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-1');
      advance(75_000); // 25 s left, inside the skew
      await mgr.ensureFresh();
      expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-2');
      // Same investigations and the ORIGINALLY requested scopes.
      expect(calls[1]).toEqual(['read-investigation', 'write-investigation']);
      expect(mgr.isInScope('inv_1')).toBe(true);
    });

    it('trusts the JWT exp when it is sooner than the returned ttl', async () => {
      const exp = Math.floor(1_000_000 / 1000) + 60;
      const jwt = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        now: () => 1_000_000,
        createServiceSession: async () => ({ ...grant(jwt), ttlSeconds: 3600 }),
      });
      const s = await mgr.createSession(['inv_1'], ['read-investigation']);
      expect(s.expiresAtMs).toBe(exp * 1000);
    });

    it('never extends past the granted ttl (uses grant ttl, not the requested one)', async () => {
      const { mgr } = expiring(120);
      const s = await mgr.createSession(['inv_1'], ['read-investigation']);
      expect(s.expiresAtMs).toBe(1_000_000 + 120_000);
    });

    it('shares one in-flight re-mint between concurrent callers', async () => {
      const { mgr, calls, advance } = expiring(300);
      await mgr.createSession(['inv_1'], ['read-investigation']);
      advance(290_000);
      await Promise.all([mgr.ensureFresh(), mgr.ensureFresh(), mgr.refresh()]);
      expect(calls).toHaveLength(2);
    });

    it('keeps approved trust grants across a refresh, and does not re-announce read-only', async () => {
      const trust = new SessionTrustGrantStore();
      const notify = vi.fn();
      let t = 0;
      let n = 0;
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        trust,
        now: () => t,
        notify,
        newGrantId: () => `g-${++n}`,
        createServiceSession: async () => ({ ...grant('j'), ttlSeconds: 300 }),
      });
      await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
      expect(trust.listActive('inv_1')).toHaveLength(1);
      t += 290_000;
      await mgr.ensureFresh();
      expect(trust.listActive('inv_1')).toHaveLength(1);
      expect(notify).not.toHaveBeenCalled();
    });

    it('revokes write trust grants when a refresh comes back read-only (role demoted)', async () => {
      const trust = new SessionTrustGrantStore();
      let t = 0;
      let demoted = false;
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        trust,
        now: () => t,
        notify: () => {},
        createServiceSession: async (_ids, scopes) => {
          if (demoted && scopes.includes('write-investigation')) {
            throw new InsufficientScopeError('runs:write', 'x');
          }
          return { ...grant('j'), ttlSeconds: 300 };
        },
      });
      await mgr.createSession(['inv_1'], ['read-investigation', 'write-investigation']);
      expect(trust.listActive('inv_1')).toHaveLength(1);
      demoted = true;
      t += 290_000;
      const next = await mgr.ensureFresh();
      expect(next?.readOnly).toBe(true);
      expect(trust.listActive('inv_1')).toHaveLength(0);
    });

    it('a refresh that resolves after a switch never registers the stale session with the host', async () => {
      const host = new NoopHostAdapter();
      let release: ((g: McpSessionGrant) => void) | undefined;
      let deferNext = false;
      const mgr = new McpSessionManager({
        client: {} as any,
        host,
        createServiceSession: (ids) => {
          if (deferNext) {
            deferNext = false;
            return new Promise<McpSessionGrant>((resolve) => (release = resolve));
          }
          return Promise.resolve(grant(`jwt-${ids[0]}`));
        },
      });
      await mgr.createSession(['inv_A'], ['read-investigation']);
      deferNext = true;
      const staleRefresh = mgr.refresh(); // A's re-mint is now in flight
      await mgr.createSession(['inv_B'], ['read-investigation']); // switch to B
      release?.(grant('jwt-inv_A-refreshed')); // A's mint resolves late
      await staleRefresh;

      const registered = host.calls
        .filter((c) => c.method === 'registerMcpServer')
        .map((c) => (c.arg as { sessionJwt: string }).sessionJwt);
      expect(registered).toEqual(['jwt-inv_A', 'jwt-inv_B']);
      expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-inv_B');
      expect(mgr.getActiveSession()?.investigationIds).toEqual(['inv_B']);
    });

    it('an older createSession() that resolves after a newer one is discarded (B stays active)', async () => {
      const host = new NoopHostAdapter();
      const trust = new SessionTrustGrantStore();
      const release: Record<string, (g: McpSessionGrant) => void> = {};
      const mgr = new McpSessionManager({
        client: {} as any,
        host,
        trust,
        newGrantId: () => 'g',
        createServiceSession: (ids) =>
          new Promise<McpSessionGrant>((resolve) => (release[ids[0]!] = resolve)),
      });
      const scopes: Scope[] = ['read-investigation', 'write-investigation'];
      const createA = mgr.createSession(['inv_A'], scopes); // A still minting...
      const createB = mgr.createSession(['inv_B'], scopes); // ...when B starts
      release.inv_B!(grant('jwt-inv_B')); // B's mint resolves first
      const b = await createB;
      release.inv_A!(grant('jwt-inv_A')); // A's (older) mint resolves last
      await expect(createA).rejects.toThrow(/superseded/);

      const registered = host.calls
        .filter((c) => c.method === 'registerMcpServer')
        .map((c) => (c.arg as { sessionJwt: string }).sessionJwt);
      expect(registered).toEqual(['jwt-inv_B']);
      expect(mgr.getActiveSession()).toBe(b);
      expect(mgr.getActiveSession()?.investigationIds).toEqual(['inv_B']);
      // The stale create issues no trust grant for the investigation it lost.
      expect(trust.listActive('inv_A')).toHaveLength(0);
      expect(trust.listActive('inv_B')).toHaveLength(1);
    });

    it('a createSession() superseded while its host registration is in flight issues no grants', async () => {
      const host = new NoopHostAdapter();
      const trust = new SessionTrustGrantStore();
      const register = host.registerMcpServer.bind(host);
      let releaseRegister: (() => void) | undefined;
      host.registerMcpServer = async (cfg) => {
        await register(cfg);
        if (cfg.sessionJwt === 'jwt-inv_A') await new Promise<void>((r) => (releaseRegister = r));
      };
      const mgr = new McpSessionManager({
        client: {} as any,
        host,
        trust,
        newGrantId: () => 'g',
        createServiceSession: async (ids) => grant(`jwt-${ids[0]}`),
      });
      const scopes: Scope[] = ['read-investigation', 'write-investigation'];
      const createA = mgr.createSession(['inv_A'], scopes);
      await vi.waitFor(() => expect(releaseRegister).toBeDefined()); // A is registering...
      const b = await mgr.createSession(['inv_B'], scopes); // ...when B starts and wins
      releaseRegister!();
      await expect(createA).rejects.toThrow(/superseded/);

      expect(mgr.getActiveSession()).toBe(b);
      expect(trust.listActive('inv_A')).toHaveLength(0);
      expect(trust.listActive('inv_B')).toHaveLength(1);
    });

    it('refresh(expectedGeneration) refuses to refresh a session the manager has moved past', async () => {
      const mgr = new McpSessionManager({
        client: {} as any,
        host: new NoopHostAdapter(),
        createServiceSession: async (ids) => grant(`jwt-${ids[0]}`),
      });
      const a = await mgr.createSession(['inv_A'], ['read-investigation']);
      await mgr.createSession(['inv_B'], ['read-investigation']);
      expect(await mgr.refresh(a.generation)).toBeUndefined();
      expect(mgr.getActiveSession()?.grant.sessionJwt).toBe('jwt-inv_B');
    });

    it('refresh() and ensureFresh() are no-ops without an active session', async () => {
      const { mgr, calls } = expiring(300);
      expect(await mgr.refresh()).toBeUndefined();
      expect(await mgr.ensureFresh()).toBeUndefined();
      expect(calls).toHaveLength(0);
    });
  });
});
