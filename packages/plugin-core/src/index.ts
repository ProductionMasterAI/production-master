/**
 * @production-master/plugin-core — host-neutral thin-client core.
 *
 * Public surface for per-IDE adapters and the remote runner. This package
 * renders, streams, and triggers actions against the hosted service. It imports
 * NO LLM/provider SDK and runs no local investigation pipeline — enforced by the
 * CI ip-guard job's no-provider-SDK grep.
 */
export const PLUGIN_CORE_VERSION = "0.0.0-local";

export type {
  Scope,
  ToolErrorCode,
  RunStatus,
  InvestigationEventEnvelope,
  RunSummary,
  LogLine,
  PipelineStepState,
  PipelineRunGraph,
  AgentInvocationDetail,
  PendingAction,
  MutationPreviewV1,
  PanelView,
} from "./types.js";

export type {
  HostAdapter,
  McpServerConfig,
  UiEvent,
  UiSubscription,
} from "./host/host-adapter.js";

// Service client
export { ServiceClient } from "./service/client.js";
export type { ServiceClientOptions } from "./service/client.js";
export { ServiceError, IdempotencyConflict } from "./service/types.js";
export type {
  CreateRunRequest,
  RunMode,
  RunBudget,
  Run,
  ListRunsFilter,
  ListRunsResponse,
  RerunFromPhaseRequest,
  ProposeActionRequest,
  ReportResponse,
  ActionRef,
  EventSlice,
  PresenceEntry,
  PresenceSnapshot,
  HttpTransport,
  HttpRequest,
  HttpResponse,
  MintTrustGrantRequest,
  TrustCapabilityGrant,
} from "./service/types.js";

// Presence (ephemeral live surface heartbeat, PRD-11 continuity)
export {
  PresenceHeartbeat,
  PRESENCE_TTL_MS,
  DEFAULT_PRESENCE_INTERVAL_MS,
} from "./presence/heartbeat.js";
export type { PresenceHeartbeatOptions } from "./presence/heartbeat.js";

// Event stream
export { EventStream } from "./stream/event-stream.js";
export type {
  EventStreamOptions,
  EventStreamListener,
  SseConnector,
  SseConnection,
  SseHandlers,
} from "./stream/event-stream.js";

// Projections
export {
  fold,
  reduce,
  initialProjection,
  toPanelView,
} from "./projections/index.js";
export type { ProjectionState } from "./projections/index.js";

// Canonical agent contract — service-schema parity (#25).
// TODO(#sdk): swap for @production-master/client-sdk when published.
export {
  CANONICAL_AGENT_ROLES,
  AGENT_ROLE_ALIASES,
  ROLE_SKILLS,
  AGENT_RESULT_EVENT_TYPES,
  isCanonicalAgentRole,
  canonicalAgentRole,
  normalizeAgentId,
} from "./contract/agents.js";
export type {
  CanonicalAgentRole,
  AgentResultEventType,
  EvidenceRef,
  EvidenceCollectedPayload,
  HypothesisProposedPayload,
  VerifierVerdictPayload,
  DocumenterReportedPayload,
} from "./contract/agents.js";

// Remote runner
export { RemoteServiceRunner } from "./runner/remote-runner.js";
export type {
  RemoteRunnerDeps,
  RemoteRunResult,
  StreamOptions,
} from "./runner/remote-runner.js";

// Composition root — the single entry point every per-IDE host wires its sinks
// into (device auth + session + transport + runner + the four commands).
export { createPluginRuntime, PluginRuntime } from "./runtime/create-plugin-runtime.js";
export type {
  PluginRuntimeConfig,
  PluginRuntimeDeps,
  PluginRuntimeOptions,
  LoginResult,
} from "./runtime/create-plugin-runtime.js";

// Host-neutral render layer (shared by every per-IDE adapter)
export {
  renderPanelCommands,
  statuslineText,
  LOG_TAIL,
} from "./render/render-commands.js";
export type {
  RenderCommand,
  StatuslineCommand,
  PipelineCommand,
  LogTailCommand,
  ActionsCommand,
  LinkCommand,
} from "./render/render-commands.js";

// Node transports (real network)
export { NodeHttpTransport } from "./service/node-transport.js";
export { NodeSseConnector } from "./stream/node-sse-connector.js";

// Device-code auth + token storage
export { DeviceCodeAuth } from "./auth/device-code.js";
export type { DeviceCodeAuthOptions } from "./auth/device-code.js";
export {
  TokenStore,
  MultiAccountStore,
  InMemorySecretBackend,
  Base64Cipher,
} from "./auth/token-store.js";
export type {
  SecretBackend,
  Cipher,
  TokenStoreOptions,
} from "./auth/token-store.js";
export type {
  DeviceStartResponse,
  TokenResponse,
  PollResult,
  StoredSession,
} from "./auth/types.js";
export { KeychainSecretBackend } from "./auth/keychain.js";
export { createTokenStore } from "./auth/create-token-store.js";

// MCP session scoping + tool surface
export { McpSessionManager } from "./mcp/session-manager.js";
export type {
  CreateSessionDeps,
  ActiveSession,
} from "./mcp/session-manager.js";
export { McpTools } from "./mcp/tools.js";
export type { McpToolsDeps } from "./mcp/tools.js";

// MCP HTTP gateway transport (Streamable HTTP, Research Decision #7)
export { HttpMcpToolTransport, createMcpToolTransport } from "./mcp/http-transport.js";
export type { McpClientConfig, McpTransportMode } from "./mcp/http-transport.js";

export {
  READ_TOOLS,
  MUTATION_TOOLS,
  isReadTool,
  isMutationTool,
  ToolError,
} from "./mcp/types.js";
export type {
  McpSessionGrant,
  McpToolTransport,
  ReadTool,
  MutationTool,
  ToolName,
  AuditSink,
} from "./mcp/types.js";

// Local context injection (opt-in, redacted)
export { LocalContextCollector } from "./context/collector.js";
export type {
  LocalContextSignal,
  CollectedEvidence,
  CollectorOptions,
} from "./context/collector.js";
export {
  redact,
  isBlockedPath,
  PATH_BLOCKLIST,
  REDACTION_PLACEHOLDER,
  MAX_TEXT_BYTES,
} from "./context/redact.js";
export type { RedactionResult } from "./context/redact.js";

export { SessionTrustGrantStore } from "./trust/session-grants.js";
export type {
  SessionTrustGrantRef,
  TrustExpansionAuditEvent,
  TrustCapabilityQuery,
  TrustRiskClass,
  TrustReversibility,
} from "./trust/session-grants.js";
export { classifyMutation, BASELINE_WRITE_TRUST } from "./trust/tool-trust.js";
export type { MutationTrustClass } from "./trust/tool-trust.js";
