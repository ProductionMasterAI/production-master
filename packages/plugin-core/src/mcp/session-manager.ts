/**
 * McpSessionManager — mints per-investigation scoped MCP sessions and registers
 * them with the host. On investigation switch the prior session is discarded and
 * never reused (a hard requirement). Tool calls carry the session JWT.
 *
 * No LLM/provider SDK.
 */
import type { HostAdapter } from '../host/host-adapter.js';
import type { ServiceClient } from '../service/client.js';
import type {
  SessionTrustGrantRef,
  SessionTrustGrantStore,
  TrustExpansionAuditEvent,
} from '../trust/session-grants.js';
import { BASELINE_WRITE_TRUST } from '../trust/tool-trust.js';
import type { Scope } from '../types.js';
import type { McpSessionGrant } from './types.js';

/** Scopes that expand capability past read-only and so require a trust grant. */
const WRITE_SCOPES: readonly Scope[] = ['write-investigation', 'approve-action'];

export interface CreateSessionDeps {
  client: ServiceClient;
  host: HostAdapter;
  /** Calls the service CreatePluginMcpSession; injectable for tests. */
  createServiceSession: (investigationIds: string[], scopes: Scope[]) => Promise<McpSessionGrant>;
  /** Session trust grants (Q9). When set, a write-scoped connect is grant-backed. */
  trust?: SessionTrustGrantStore;
  /** Emits an issued/revoked grant to the authoritative service ledger. */
  emitTrustExpansion?: (event: TrustExpansionAuditEvent) => void | Promise<void>;
  /** Injectable grant-id generator (deterministic in tests). */
  newGrantId?: () => string;
  /** Label recorded on grants minted in this session. */
  sessionLabel?: string;
}

export interface ActiveSession {
  grant: McpSessionGrant;
  investigationIds: string[];
  scopes: Scope[];
}

export class McpSessionManager {
  private active: ActiveSession | undefined;

  constructor(private readonly deps: CreateSessionDeps) {}

  getActiveSession(): ActiveSession | undefined {
    return this.active;
  }

  /**
   * Create (or switch to) a scoped session for the given investigation(s).
   * Any prior session is discarded first so it can never be reused. A session
   * requesting a write scope expands capability past read-only, so it is backed
   * by a baseline trust grant (audited locally and mirrored to the service).
   */
  async createSession(investigationIds: string[], scopes: Scope[]): Promise<ActiveSession> {
    // Discard the previous session (and revoke its grants) BEFORE the new one.
    if (this.active) this.discard();
    const grant = await this.deps.createServiceSession(investigationIds, scopes);
    await this.deps.host.registerMcpServer({
      endpoint: grant.endpoint,
      audience: grant.audience,
      sessionJwt: grant.sessionJwt,
      scopes,
    });
    this.active = { grant, investigationIds, scopes };
    if (this.deps.trust && scopes.some((s) => WRITE_SCOPES.includes(s))) {
      for (const investigationId of investigationIds) {
        void this.issueGrant(investigationId);
      }
    }
    return this.active;
  }

  /** Discard the active session and revoke any grants it minted (on exit). */
  discard(): void {
    const investigationIds = this.active?.investigationIds ?? [];
    this.active = undefined;
    const { trust } = this.deps;
    if (!trust) return;
    for (const investigationId of investigationIds) {
      for (const g of trust.listActive(investigationId)) {
        trust.revoke(g.grantId);
        void this.deps.emitTrustExpansion?.({
          type: 'trust-grant-revoked',
          grant: g,
          at: new Date().toISOString(),
        });
      }
    }
  }

  private issueGrant(investigationId: string): void {
    const { trust } = this.deps;
    if (!trust) return;
    const at = new Date().toISOString();
    const grant: SessionTrustGrantRef = {
      grantId: this.deps.newGrantId?.() ?? `grant-${investigationId}-connect`,
      investigationId,
      riskClass: BASELINE_WRITE_TRUST.riskClass,
      reversibility: BASELINE_WRITE_TRUST.reversibility,
      sessionLabel: this.deps.sessionLabel ?? 'mcp-session',
      grantedAt: at,
    };
    trust.issue(grant);
    void this.deps.emitTrustExpansion?.({ type: 'trust-grant-issued', grant, at });
  }

  /** True when the given investigationId is in the active session's scope. */
  isInScope(investigationId: string): boolean {
    return this.active?.investigationIds.includes(investigationId) ?? false;
  }
}
