/**
 * Typed client for the pm-service REST/Connect surface.
 *
 * Every mutation carries an `Idempotency-Key`. Per the no-enumeration rule, an
 * empty/forbidden singleton fetch is surfaced as NOT_FOUND (404) — never 403.
 * The client holds no business logic; it marshals requests and maps errors.
 */
import type { InvestigationEventEnvelope, Scope } from "../types.js";
import type { McpSessionGrant } from "../mcp/types.js";
import {
  IdempotencyConflict,
  ServiceError,
  type ActionRef,
  type CreateRunRequest,
  type EventSlice,
  type HttpResponse,
  type HttpTransport,
  type ListRunsFilter,
  type ListRunsResponse,
  type PresenceSnapshot,
  type ProposeActionRequest,
  type ReportResponse,
  type RerunFromPhaseRequest,
  type Run,
  type MintTrustGrantRequest,
  type TrustCapabilityGrant,
} from "./types.js";

export interface ServiceClientOptions {
  transport: HttpTransport;
  /** Returns a bearer token (access token or session JWT). */
  getAuthToken?: () => string | undefined;
  /** Injectable idempotency-key generator (deterministic in tests). */
  newIdempotencyKey?: () => string;
}

/**
 * The edge-api `/v1/mcp/sessions` scope enum is `[read, mutate]`. The plugin
 * requests the finer RFC-8628 scopes; collapse them to the service's two-value
 * enum when minting a session (both write-investigation and approve-action are
 * mutating capabilities).
 */
const SERVICE_SCOPE: Record<Scope, "read" | "mutate"> = {
  "read-investigation": "read",
  "write-investigation": "mutate",
  "approve-action": "mutate",
};

function toServiceScopes(scopes: Scope[]): Array<"read" | "mutate"> {
  return [...new Set(scopes.map((s) => SERVICE_SCOPE[s]))];
}

function defaultIdempotencyKey(): string {
  // RFC4122-ish; crypto.randomUUID is available in Node 18+ and browsers.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export class ServiceClient {
  private readonly transport: HttpTransport;
  private readonly getAuthToken: () => string | undefined;
  private readonly newIdempotencyKey: () => string;

  constructor(opts: ServiceClientOptions) {
    this.transport = opts.transport;
    this.getAuthToken = opts.getAuthToken ?? (() => undefined);
    this.newIdempotencyKey = opts.newIdempotencyKey ?? defaultIdempotencyKey;
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    const token = this.getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  private mapError(res: HttpResponse, context: string): ServiceError {
    const message =
      (res.body as { message?: string } | undefined)?.message ??
      `${context} failed (${res.status})`;
    if (res.status === 409) return new IdempotencyConflict(message);
    if (res.status === 404) return new ServiceError("NOT_FOUND", 404, message);
    if (res.status === 403) {
      // No-enumeration rule: a forbidden singleton is indistinguishable from
      // not-found to the client. Translate 403 -> NOT_FOUND.
      return new ServiceError("NOT_FOUND", 404, message);
    }
    if (res.status === 402)
      return new ServiceError("BUDGET_EXHAUSTED", 402, message);
    return new ServiceError("UNKNOWN", res.status, message);
  }

  private ok(res: HttpResponse): boolean {
    return res.status >= 200 && res.status < 300;
  }

  async createRun(req: CreateRunRequest): Promise<Run> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/runs",
      body: req,
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey(),
      }),
    });
    if (!this.ok(res)) throw this.mapError(res, "createRun");
    return res.body as Run;
  }

  /**
   * Mint a scoped MCP session for one or more investigations
   * (`POST /v1/mcp/sessions`). The returned grant carries the per-investigation
   * MCP endpoint + short-lived session JWT the thin client registers with the
   * host and stamps on every `investigation.*` tool call. Plugin scopes are
   * collapsed to the service `[read, mutate]` enum.
   */
  async createMcpSession(
    investigationIds: string[],
    scopes: Scope[],
    ttlSeconds?: number,
  ): Promise<McpSessionGrant> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/mcp/sessions",
      body: {
        investigationIds,
        scopes: toServiceScopes(scopes),
        ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
      },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "createMcpSession");
    return res.body as McpSessionGrant;
  }

  async getRun(investigationId: string): Promise<Run> {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}`,
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "getRun");
    return res.body as Run;
  }

  async listRuns(filter: ListRunsFilter = {}): Promise<ListRunsResponse> {
    const res = await this.transport.request({
      method: "GET",
      path: "/v1/runs",
      query: {
        status: filter.status,
        cursor: filter.cursor,
        limit: filter.limit,
      },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "listRuns");
    return res.body as ListRunsResponse;
  }

  async rerunFromPhase(
    investigationId: string,
    req: RerunFromPhaseRequest,
  ): Promise<Run> {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/rerun-from-step`,
      body: req,
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey(),
      }),
    });
    if (!this.ok(res)) throw this.mapError(res, "rerunFromPhase");
    return res.body as Run;
  }

  async proposeAction(req: ProposeActionRequest): Promise<ActionRef> {
    // edge-actions' proposeSchema requires the key in the body too, and rejects
    // the request (400 idempotency_key_mismatch) unless it equals the header.
    const idempotencyKey = this.newIdempotencyKey();
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/actions",
      body: { ...req, idempotencyKey },
      headers: this.authHeaders({ "Idempotency-Key": idempotencyKey }),
    });
    if (!this.ok(res)) throw this.mapError(res, "proposeAction");
    return res.body as ActionRef;
  }

  async approveAction(
    actionId: string,
    approverId: string,
    actorRoles?: string[],
  ): Promise<ActionRef> {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/actions/${encodeURIComponent(actionId)}/approve`,
      body: { approverId, ...(actorRoles ? { actorRoles } : {}) },
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey(),
      }),
    });
    if (!this.ok(res)) throw this.mapError(res, "approveAction");
    return res.body as ActionRef;
  }

  /**
   * Reject a proposed action. Like approveAction this is PROPOSE/APPROVE-layer
   * only — it never executes a side effect. Carries an Idempotency-Key so a
   * repeat returns the original action.
   */
  async rejectAction(
    actionId: string,
    rejectorId: string,
    reason: string,
  ): Promise<ActionRef> {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/actions/${encodeURIComponent(actionId)}/reject`,
      body: { rejectorId, reason },
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey(),
      }),
    });
    if (!this.ok(res)) throw this.mapError(res, "rejectAction");
    return res.body as ActionRef;
  }

  /**
   * Q9 — mint a session-scoped capability token (`POST /v1/trust-grants`). The
   * grant auto-approves later actions of the same risk × reversibility class for
   * one investigation until it expires. The service caps `ttlMinutes` at 24h and
   * is authoritative; the web Settings surface lists and revokes what this mints.
   */
  async mintTrustGrant(
    req: MintTrustGrantRequest,
  ): Promise<TrustCapabilityGrant> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/trust-grants",
      body: req,
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "mintTrustGrant");
    return (res.body as { grant: TrustCapabilityGrant }).grant;
  }

  /** Fetch the rendered report for a run (`md` | `json` | `html`). */
  async getReport(
    investigationId: string,
    format: "md" | "json" | "html" = "md",
  ): Promise<ReportResponse> {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/report`,
      query: { format },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "getReport");
    return res.body as ReportResponse;
  }

  /** Fetch a durable slice of the event log for replay (`sequence > sinceSeq`). */
  async getEventSlice(
    investigationId: string,
    sinceSeq = 0,
  ): Promise<EventSlice> {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/events`,
      query: { sinceSeq },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "getEventSlice");
    const events =
      (res.body as { events?: InvestigationEventEnvelope[] }).events ?? [];
    const lastSeq = events.reduce((m, e) => Math.max(m, e.sequence), sinceSeq);
    return { events, lastSeq };
  }

  // ── Presence (ephemeral, 30s TTL) ─────────────────────────────────────────
  // Presence is a live-only signal: it is NEVER carried on an Idempotency-Key
  // (a heartbeat is meant to be replayed) and NEVER hits the durable event log.
  // The route lives under `/v1/investigations/:id/presence` (continuity), not
  // the `/v1/runs/:id` mutation surface.

  private presencePath(investigationId: string): string {
    return `/v1/investigations/${encodeURIComponent(investigationId)}/presence`;
  }

  /**
   * Attach (or refresh) this surface's presence. Call on `/connect` and then on
   * a heartbeat interval well under the 30s TTL. `surface` labels the caller
   * (e.g. "claude-code", "pmctl"). Returns the current presence snapshot.
   */
  async attachPresence(
    investigationId: string,
    surface: string,
  ): Promise<PresenceSnapshot> {
    const res = await this.transport.request({
      method: "POST",
      path: this.presencePath(investigationId),
      body: { surface },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "attachPresence");
    return res.body as PresenceSnapshot;
  }

  /** Read the current presence snapshot for an investigation. */
  async getPresence(investigationId: string): Promise<PresenceSnapshot> {
    const res = await this.transport.request({
      method: "GET",
      path: this.presencePath(investigationId),
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "getPresence");
    return res.body as PresenceSnapshot;
  }

  /** Detach this surface's presence on disconnect. Returns the new snapshot. */
  async detachPresence(
    investigationId: string,
    surface: string,
  ): Promise<PresenceSnapshot> {
    const res = await this.transport.request({
      method: "DELETE",
      path: this.presencePath(investigationId),
      body: { surface },
      headers: this.authHeaders(),
    });
    if (!this.ok(res)) throw this.mapError(res, "detachPresence");
    return res.body as PresenceSnapshot;
  }
}
