import { describe, it, expect } from 'vitest';
import { SessionTrustGrantStore, type SessionTrustGrantRef } from './session-grants.js';

function grant(over: Partial<SessionTrustGrantRef> = {}): SessionTrustGrantRef {
  return {
    grantId: 'g1',
    investigationId: 'inv-1',
    riskClass: 'low',
    reversibility: 'reversible',
    sessionLabel: 'cursor-session',
    grantedAt: '2026-07-07T12:00:00Z',
    ...over,
  };
}

describe('SessionTrustGrantStore', () => {
  it('audits issue and revoke for the compromised-host threat model', () => {
    const store = new SessionTrustGrantStore();
    store.issue(grant());
    store.revoke('g1');
    const events = store.drainAudit();
    expect(events.map((e) => e.type)).toEqual(['trust-grant-issued', 'trust-grant-revoked']);
  });

  describe('match', () => {
    it('covers a request of the same class on the same investigation', () => {
      const store = new SessionTrustGrantStore();
      store.issue(grant());
      expect(store.match({ investigationId: 'inv-1', riskClass: 'low', reversibility: 'reversible' })?.grantId).toBe('g1');
    });

    it('does not cross investigations', () => {
      const store = new SessionTrustGrantStore();
      store.issue(grant());
      expect(store.match({ investigationId: 'inv-2', riskClass: 'low', reversibility: 'reversible' })).toBeUndefined();
    });

    it('a broader grant covers a narrower request but not vice versa', () => {
      const store = new SessionTrustGrantStore();
      store.issue(grant({ grantId: 'g-high', riskClass: 'high', reversibility: 'compensable' }));
      // low/reversible request is within a high/compensable grant.
      expect(store.match({ investigationId: 'inv-1', riskClass: 'low', reversibility: 'reversible' })?.grantId).toBe('g-high');
      // an irreversible request exceeds it.
      expect(store.match({ investigationId: 'inv-1', riskClass: 'irreversible', reversibility: 'irreversible' })).toBeUndefined();
    });

    it('a low/reversible baseline does not cover a compensable request', () => {
      const store = new SessionTrustGrantStore();
      store.issue(grant());
      expect(store.match({ investigationId: 'inv-1', riskClass: 'low', reversibility: 'compensable' })).toBeUndefined();
    });

    it('a revoked grant no longer matches', () => {
      const store = new SessionTrustGrantStore();
      store.issue(grant());
      store.revoke('g1');
      expect(store.match({ investigationId: 'inv-1', riskClass: 'low', reversibility: 'reversible' })).toBeUndefined();
    });
  });
});
