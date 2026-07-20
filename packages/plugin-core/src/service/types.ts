/**
 * Request/response shapes for the pm-service REST/Connect surface.
 *
 * These mirror the service contract published via `@production-master/client-sdk`.
 * Until that package ships, these local definitions are the pinned surface our
 * contract tests assert against (golden frames). NO LLM/provider SDK here.
 */
import type { RunStatus, ToolErrorCode } from "../types.js";
import type {
  TrustRiskClass,
  TrustReversibility,
} from "../trust/session-grants.js";

/**
 * Investigation depth. `deep` runs the full deepening loop (more evidence,
 * higher cost); `standard` is the default single-pass run. Surfaced as
 * `pmctl start --mode` and the SDK `mode` param.
 */
export type RunMode = "standard" | "deep";

/**
 * Optional spend ceilings for a run. The BFF stops the investigation (402)
 * when a cap is exceeded. Surfaced as `pmctl start --max-usd/--max-iterations`
 * and the SDK `budget` param.
 */
export interface RunBudget {
  /** Maximum cumulative spend in USD before the run halts. */
  maxUsd?: number;
  /** Maximum deepening iterations before the run halts. */
  maxIterations?: number;
}

export interface CreateRunRequest {
  /** Ticket / incident reference that seeds the investigation. */
  ticket: string;
  title?: string;
  /** Investigation depth (default `standard` when omitted). */
  mode?: RunMode;
  /** Optional spend ceilings (USD and/or deepening iterations). */
  budget?: RunBudget;
  /** Opt-in local context evidence ids already uploaded (usually empty). */
  seedEvidenceIds?: string[];
}

export interface Run {
  investigationId: string;
  status: RunStatus;
  title?: string;
  createdAt: string;
  completedAt?: string;
  reportUri?: string;
  costUsd: number;
}

export interface ListRunsFilter {
  status?: RunStatus;
  /** Opaque pagination cursor returned by a previous page. */
  cursor?: string;
  limit?: number;
}

export interface ListRunsResponse {
  runs: Run[];
  /** Present when more pages exist. */
  nextCursor?: string;
}

export interface RerunFromPhaseRequest {
  phaseId: string;
  /** Optional per-rerun edits (model/budget overrides, corrections). */
  edits?: Record<string, unknown>;
}

export interface ProposeActionRequest {
  /** Run the action belongs to. Sent as a body field — the route has no run segment. */
  runId: string;
  type: string;
  payload?: Record<string, unknown>;
  /** Required by edge-actions' proposeSchema (no server-side default). */
  proposedBy: string;
  /** Required by edge-actions' proposeSchema; the policy matrix may still force approval. */
  requiresApproval: boolean;
  actorRoles?: string[];
  tenantRequiredRoles?: string[];
}

export interface ActionRef {
  actionId: string;
  status: "proposed" | "approved" | "rejected" | "executed";
}

/**
 * Q9 capability-token surface. A session-scoped trust grant auto-approves later
 * actions whose risk × reversibility class (exactly) matches the grant, within
 * one investigation, until it expires or is revoked. Mirrors the service
 * `@production-master/trust-grants` `TrustCapabilityGrant` and the enums the
 * plugin session already tracks in `SessionTrustGrantStore`.
 */

/** Body for `POST /v1/trust-grants` (issue a capability token). */
export interface MintTrustGrantRequest {
  investigationId: string;
  riskClass: TrustRiskClass;
  reversibility: TrustReversibility;
  /** Identity the grant is attributed to (the approver). */
  grantedBy: string;
  /** Lifetime in minutes; the service caps this at 24h (1..1440). */
  ttlMinutes: number;
  sessionLabel?: string;
}

/** A minted capability token as returned by the service. */
export interface TrustCapabilityGrant {
  id: string;
  investigationId: string;
  riskClass: TrustRiskClass;
  reversibility: TrustReversibility;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  sessionLabel: string | null;
}

/**
 * Rendered investigation report fetched from `GET /v1/runs/:id/report`.
 * `format` echoes the requested format; `content` is the rendered body
 * (markdown for `md`, serialized JSON for `json`, HTML for `html`).
 */
export interface ReportResponse {
  investigationId: string;
  format: string;
  content: string;
  reportUri?: string;
}

export interface EventSlice {
  events: import("../types.js").InvestigationEventEnvelope[];
  /** Highest sequence in this slice; use as `sinceSeq` for the next call. */
  lastSeq: number;
}

/**
 * One surface currently attached to an investigation. Ephemeral (30s TTL,
 * `PRESENCE_HEARTBEAT_TTL_MS`); NEVER written to the AD-1 event log and NEVER
 * replayed — mirrors the service `@production-master/presence` PresenceEntry.
 */
export interface PresenceEntry {
  /** User identity (subject) attached on this surface. */
  identity: string;
  /** Surface label, e.g. "claude-code", "cursor", "pmctl". */
  surface: string;
  /** ISO-8601 timestamp of the (most recent) attach/heartbeat. */
  attachedAt: string;
}

/** Live snapshot of who is attached to an investigation. */
export interface PresenceSnapshot {
  investigationId: string;
  entries: PresenceEntry[];
}

/** Transport seam — lets tests inject a fake without a network. */
export interface HttpTransport {
  request(opts: HttpRequest): Promise<HttpResponse>;
}

export interface HttpRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

/** Typed error thrown for non-2xx service responses. */
export class ServiceError extends Error {
  constructor(
    readonly code: ToolErrorCode | "UNKNOWN",
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** 409 on duplicate Idempotency-Key. */
export class IdempotencyConflict extends ServiceError {
  constructor(message = "Idempotency key already used") {
    super("IDEMPOTENCY_CONFLICT", 409, message);
    this.name = "IdempotencyConflict";
  }
}
