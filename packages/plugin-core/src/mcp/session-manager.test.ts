import { describe, it, expect, vi } from 'vitest';
import { McpSessionManager } from './session-manager.js';
import { NoopHostAdapter } from '../host/__fixtures__/noop-host-adapter.js';
import { SessionTrustGrantStore } from '../trust/session-grants.js';
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
});
