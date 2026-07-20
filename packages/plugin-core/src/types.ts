/**
 * Host-neutral client-side contract types for the Production Master thin client.
 *
 * These mirror shapes the service publishes via `@production-master/client-sdk`.
 * Until that package is published, these local definitions act as the pinned
 * surface our contract tests assert against. They contain NO business logic and
 * import NO provider/LLM SDK — this package is a thin renderer/streamer only.
 */

/** RFC-8628-style scopes the plugin may request. */
export type Scope = 'read-investigation' | 'write-investigation' | 'approve-action';

/** Typed tool/REST error codes the service may return. */
export type ToolErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'USER_REJECTED_CONFIRMATION'
  | 'BUDGET_EXHAUSTED';

/** Lifecycle status of a run, folded from the event stream. */
export type RunStatus =
  | 'created'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * A single `investigation.events.v1` envelope as delivered over SSE.
 * `sequence` is a per-investigation monotonic counter; `eventId` is a ULID
 * used for dedupe on reconnect.
 */
export interface InvestigationEventEnvelope {
  eventId: string;
  investigationId: string;
  type: string;
  timestamp: string;
  sequence: number;
  actor?: string;
  causationEventIds?: string[];
  correlationId?: string;
  payload?: Record<string, unknown>;
  payloadBlobUri?: string;
  schemaVersion: string;
}

/** Compact summary projection rendered in every IDE surface. */
export interface RunSummary {
  investigationId: string;
  status: RunStatus;
  title?: string;
  startedAt?: string;
  completedAt?: string;
  reportUri?: string;
  costUsd: number;
}

/** A single rendered log line folded from agent/phase/log events. */
export interface LogLine {
  sequence: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  text: string;
  agentId?: string;
}

/** One node in the pipeline run graph. */
export interface PipelineStepState {
  stepId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

/** The pipeline graph projection. */
export interface PipelineRunGraph {
  investigationId: string;
  steps: PipelineStepState[];
}

/** Per-agent invocation detail projection. */
export interface AgentInvocationDetail {
  agentId: string;
  invocationId: string;
  status: 'invoked' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  costUsd: number;
  toolCalls: number;
}

/** A pending action awaiting human approval. */
export interface PendingAction {
  actionId: string;
  kind: string;
  summary: string;
  status: 'proposed' | 'approved' | 'executed';
}

/**
 * Preview shown to the user before any mutation tool reaches the service.
 * The host renders this and returns approve/reject.
 */
export interface MutationPreviewV1 {
  schemaVersion: 'mutation-preview.v1';
  tool: string;
  investigationId: string;
  summary: string;
  details?: Record<string, unknown>;
}

/** A rendered panel view-model the host paints. */
export interface PanelView {
  runSummary: RunSummary;
  pipeline: PipelineRunGraph;
  logs: LogLine[];
  pendingActions: PendingAction[];
}
