/**
 * McpSessionManager — mints per-investigation scoped MCP sessions and registers
 * them with the host. On investigation switch the prior session is discarded and
 * never reused (a hard requirement). Tool calls carry the session JWT.
 *
 * No LLM/provider SDK.
 */
import type { HostAdapter } from '../host/host-adapter.js';
import type { ServiceClient } from '../service/client.js';
import { InsufficientScopeError } from '../service/types.js';
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

/** Re-mint this long before the session expires (capped at half its TTL). */
const DEFAULT_REFRESH_SKEW_MS = 30_000;

/** The role-and-permission wording shown when a login can only read. */
const READ_ONLY_NOTICE =
  'Production Master: your account is read-only (it does not hold runs:write), so this ' +
  'session can read investigations but not change them. The engineer role or above grants ' +
  'write access; ask an org admin if you need it.';

/**
 * Read the `exp` claim (ms since epoch) from a JWT without verifying it. This
 * only decides WHEN to re-mint; the service remains the authority on whether a
 * session is valid. Returns undefined for anything that is not a decodable JWT.
 */
function jwtExpiryMs(jwt: string): number | undefined {
  const part = jwt.split('.')[1];
  if (!part) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

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
  /** Tells the user something they must know (e.g. the login is read-only). */
  notify?: (message: string) => void;
  /** Injectable clock (ms since epoch). */
  now?: () => number;
  /** Re-mint this many ms before expiry (default 30 s, capped at half the TTL). */
  refreshSkewMs?: number;
}

export interface ActiveSession {
  /**
   * Which createSession() this session belongs to. A refresh keeps the value;
   * a switch (or re-create) takes a new one. Callers bind work to it so they
   * can tell "my session, re-minted" from "a different investigation's session".
   */
  generation: number;
  grant: McpSessionGrant;
  investigationIds: string[];
  /** Scopes the service actually granted (read-only after a write refusal). */
  scopes: Scope[];
  /** Scopes the plugin asked for; re-used when the session is re-minted. */
  requestedScopes: Scope[];
  /** True when the session holds no write scope. */
  readOnly: boolean;
  /** True when write was requested but the service refused it. */
  readOnlyFallback: boolean;
  /** When the session stops being valid (JWT `exp` / granted TTL, whichever is sooner). */
  expiresAtMs: number | undefined;
  /** When to re-mint it. */
  refreshAtMs: number | undefined;
}

export class McpSessionManager {
  private active: ActiveSession | undefined;
  private refreshing: { prev: ActiveSession; promise: Promise<ActiveSession | undefined> } | undefined;
  private lastGeneration = 0;

  constructor(private readonly deps: CreateSessionDeps) {}

  getActiveSession(): ActiveSession | undefined {
    return this.active;
  }

  /**
   * Create (or switch to) a scoped session for the given investigation(s).
   * Any prior session is discarded first so it can never be reused. A session
   * requesting a write scope expands capability past read-only, so it is backed
   * by a baseline trust grant (audited locally and mirrored to the service).
   *
   * Mint by what the caller holds: if the service refuses the write scope
   * (`insufficient_scope` / `runs:write`) the mint is retried ONCE read-only and
   * the user is told. Any other refusal propagates.
   */
  async createSession(investigationIds: string[], scopes: Scope[]): Promise<ActiveSession> {
    // Discard the previous session (and revoke its grants) BEFORE the new one.
    if (this.active) this.discard();
    const session = await this.mint(investigationIds, scopes, true, ++this.lastGeneration);
    this.active = session;
    try {
      await this.register(session);
    } catch (err) {
      if (this.active === session) this.active = undefined;
      throw err;
    }
    this.issueGrantsFor(session);
    return session;
  }

  /**
   * Re-mint the active session if it is within the refresh skew of expiry.
   * Returns the (possibly new) active session. Cheap when nothing is due.
   */
  async ensureFresh(): Promise<ActiveSession | undefined> {
    const active = this.active;
    if (!active) return undefined;
    if (active.refreshAtMs !== undefined && this.now() >= active.refreshAtMs) {
      return this.refresh();
    }
    return active;
  }

  /**
   * Re-mint the active session for the same investigations and the originally
   * requested scopes (e.g. after a 401, or shortly before `exp`). Concurrent
   * callers share one mint. The trust grants the user already approved are kept
   * across a refresh; they are revoked only if the refresh comes back read-only.
   *
   * A refresh only ever acts for the session it started from. The minted result
   * is registered with the host only if that session is STILL the active one;
   * if the active investigation switched meanwhile, the result is discarded and
   * the host configuration is left alone. Pass `expectedGeneration` to refuse to
   * refresh at all (returns undefined) when the active session is not the one
   * the caller is working for.
   */
  async refresh(expectedGeneration?: number): Promise<ActiveSession | undefined> {
    const prev = this.active;
    if (!prev) return undefined;
    if (expectedGeneration !== undefined && prev.generation !== expectedGeneration) return undefined;
    if (this.refreshing?.prev === prev) return this.refreshing.promise;
    const entry: { prev: ActiveSession; promise: Promise<ActiveSession | undefined> } = {
      prev,
      promise: (async () => {
        try {
          const next = await this.mint(
            prev.investigationIds,
            prev.requestedScopes,
            !prev.readOnlyFallback,
            prev.generation,
          );
          // Another createSession/discard won the race: drop this result, never
          // register it, and do not resurrect old state.
          if (this.active !== prev) return this.active;
          this.active = next;
          try {
            await this.register(next);
          } catch (err) {
            if (this.active === next) this.active = prev;
            throw err;
          }
          if (next.readOnly && !prev.readOnly) this.revokeGrantsFor(prev.investigationIds);
          return next;
        } finally {
          if (this.refreshing?.prev === prev) this.refreshing = undefined;
        }
      })(),
    };
    this.refreshing = entry;
    return entry.promise;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /**
   * Mint a grant (with the read-only fallback). Minting has no side effect on
   * the host: the caller registers the result only once it knows it still owns
   * the active session (see register()).
   */
  private async mint(
    investigationIds: string[],
    requested: Scope[],
    announce: boolean,
    generation: number,
  ): Promise<ActiveSession> {
    let scopes = requested;
    let grant: McpSessionGrant;
    try {
      grant = await this.deps.createServiceSession(investigationIds, requested);
    } catch (err) {
      const refusedWrite =
        err instanceof InsufficientScopeError &&
        err.requiredScope === 'runs:write' &&
        requested.some((s) => WRITE_SCOPES.includes(s));
      if (!refusedWrite) throw err;
      scopes = requested.filter((s) => !WRITE_SCOPES.includes(s));
      if (scopes.length === 0) scopes = ['read-investigation'];
      if (announce) this.deps.notify?.(READ_ONLY_NOTICE);
      // One retry only: a second refusal (e.g. runs:read) propagates as-is.
      grant = await this.deps.createServiceSession(investigationIds, scopes);
    }

    // Expiry is what the SERVER granted (JWT exp / returned ttlSeconds), never
    // what we asked for; the sooner of the two wins.
    const issuedAt = this.now();
    const candidates = [
      grant.ttlSeconds > 0 ? issuedAt + grant.ttlSeconds * 1000 : undefined,
      jwtExpiryMs(grant.sessionJwt),
    ].filter((v): v is number => v !== undefined);
    const expiresAtMs = candidates.length > 0 ? Math.min(...candidates) : undefined;
    const skew = Math.min(
      this.deps.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS,
      expiresAtMs !== undefined ? (expiresAtMs - issuedAt) / 2 : Infinity,
    );
    return {
      generation,
      grant,
      investigationIds,
      scopes,
      requestedScopes: requested,
      readOnly: !scopes.some((s) => WRITE_SCOPES.includes(s)),
      readOnlyFallback: scopes !== requested,
      expiresAtMs,
      refreshAtMs: expiresAtMs !== undefined ? expiresAtMs - skew : undefined,
    };
  }

  /** Point the host at this session. Call only while it is the active session. */
  private async register(session: ActiveSession): Promise<void> {
    await this.deps.host.registerMcpServer({
      endpoint: session.grant.endpoint,
      audience: session.grant.audience,
      sessionJwt: session.grant.sessionJwt,
      scopes: session.scopes,
    });
  }

  private issueGrantsFor(session: ActiveSession): void {
    if (this.deps.trust && !session.readOnly) {
      for (const investigationId of session.investigationIds) {
        void this.issueGrant(investigationId);
      }
    }
  }

  /** Discard the active session and revoke any grants it minted (on exit). */
  discard(): void {
    const investigationIds = this.active?.investigationIds ?? [];
    this.active = undefined;
    this.revokeGrantsFor(investigationIds);
  }

  private revokeGrantsFor(investigationIds: string[]): void {
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
