/**
 * Session-scoped trust grant tracking for plugin hosts (Q9).
 *
 * The service is authoritative; this module tracks grant ids minted in the
 * current IDE session so adapters can audit trust expansion and revoke on exit.
 */

export type TrustRiskClass = 'read_only' | 'low' | 'high' | 'irreversible';
export type TrustReversibility = 'reversible' | 'compensable' | 'irreversible';

/** Ascending blast radius — a grant covers any request at or below its class. */
const RISK_ORDER: Record<TrustRiskClass, number> = {
  read_only: 0,
  low: 1,
  high: 2,
  irreversible: 3,
};

/** Ascending difficulty of undo — a grant covers requests no harder to undo. */
const REV_ORDER: Record<TrustReversibility, number> = {
  reversible: 0,
  compensable: 1,
  irreversible: 2,
};

export interface SessionTrustGrantRef {
  grantId: string;
  investigationId: string;
  riskClass: TrustRiskClass;
  reversibility: TrustReversibility;
  sessionLabel: string;
  grantedAt: string;
}

export interface TrustExpansionAuditEvent {
  type: 'trust-grant-issued' | 'trust-grant-revoked';
  grant: SessionTrustGrantRef;
  at: string;
}

/** A capability request tested against the active grants (mirrors the service). */
export interface TrustCapabilityQuery {
  investigationId: string;
  riskClass?: TrustRiskClass;
  reversibility?: TrustReversibility;
}

export class SessionTrustGrantStore {
  private readonly grants = new Map<string, SessionTrustGrantRef>();
  private readonly audit: TrustExpansionAuditEvent[] = [];

  issue(ref: SessionTrustGrantRef): void {
    this.grants.set(ref.grantId, ref);
    this.audit.push({ type: 'trust-grant-issued', grant: ref, at: new Date().toISOString() });
  }

  revoke(grantId: string): void {
    const grant = this.grants.get(grantId);
    if (!grant) return;
    this.grants.delete(grantId);
    this.audit.push({ type: 'trust-grant-revoked', grant, at: new Date().toISOString() });
  }

  listActive(investigationId?: string): SessionTrustGrantRef[] {
    return [...this.grants.values()].filter(
      (g) => !investigationId || g.investigationId === investigationId,
    );
  }

  /**
   * The active grant covering a capability request, or undefined if none.
   * A grant covers the request when it targets the same investigation and its
   * risk/reversibility are at least as broad as the request's (unspecified
   * request fields match any grant). Mirrors the service's grant matching so a
   * covered mutation auto-approves instead of re-prompting.
   */
  match(query: TrustCapabilityQuery): SessionTrustGrantRef | undefined {
    return [...this.grants.values()].find(
      (g) =>
        g.investigationId === query.investigationId &&
        (query.riskClass === undefined || RISK_ORDER[g.riskClass] >= RISK_ORDER[query.riskClass]) &&
        (query.reversibility === undefined ||
          REV_ORDER[g.reversibility] >= REV_ORDER[query.reversibility]),
    );
  }

  drainAudit(): TrustExpansionAuditEvent[] {
    const out = [...this.audit];
    this.audit.length = 0;
    return out;
  }

  clear(): void {
    this.grants.clear();
    this.audit.length = 0;
  }
}
