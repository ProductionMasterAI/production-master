/**
 * Canonical agent contract — service-schema parity (issue #25).
 *
 * The pm-service runtime emits `agent.invoked` / `agent.completed` and the
 * per-role result events (`evidence.collected`, `hypothesis.proposed`,
 * `verifier.verdict`, `documenter.reported`) keyed by ONE canonical agent
 * taxonomy. The thin client renders those events, so the IDs it folds on must
 * match the service's `CanonicalAgentRole` exactly — otherwise an agent panel
 * silently mislabels or drops a role.
 *
 * These types are PINNED LOCALLY here so the plugin can ship the rename without
 * waiting on the npm publish of the service SDK.
 *
 * TODO(#sdk): swap for @production-master/client-sdk when published. The shapes
 * below are copied verbatim from the service contract:
 *   - production-master-service/packages/skills/src/index.ts
 *     (`CanonicalAgentRole`, `AGENT_ROLE_ALIASES`, `ROLE_SKILLS`)
 *   - production-master-service/packages/shared-types/src/events.v2.ts
 *     (the per-role event payload schemas)
 *
 * This file declares NO runtime import of any LLM/provider SDK — it is pure
 * type + lookup-table data, consistent with the thin-client guard.
 */

/**
 * The canonical 8 agent roles the service runtime emits. These wire IDs are the
 * single source of truth for every plugin-side projection, renderer, and
 * adapter. Do NOT introduce a divergent spelling.
 *
 * NOTE on `hypothesis-gen`: the V4-MVP issue body lists the hypothesis role as
 * `hypotheses`, but the service's authoritative `CanonicalAgentRole` union (and
 * the `agent.*` events it actually emits) uses `hypothesis-gen`. Schema PARITY
 * is the hard requirement of #25, so the wire ID is `hypothesis-gen` and
 * `hypotheses` is accepted as an alias (see `AGENT_ROLE_ALIASES`).
 */
export const CANONICAL_AGENT_ROLES = [
  'bug-context',
  'log-analyzer',
  'code-semantics',
  'change-analyzer',
  'hypothesis-gen',
  'verifier',
  'skeptic',
  'documenter',
] as const;

export type CanonicalAgentRole = (typeof CANONICAL_AGENT_ROLES)[number];

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_AGENT_ROLES);

/** True iff `id` is already a canonical role wire ID. */
export function isCanonicalAgentRole(id: string): id is CanonicalAgentRole {
  return CANONICAL_SET.has(id);
}

/**
 * Legacy / snake_case agent IDs the hosted service may emit → canonical role.
 * Mirrors the service's `AGENT_ROLE_ALIASES` plus a few earlier agent names, so
 * an event stream that still carries an older id folds onto the canonical panel.
 *
 * Agent ids with NO canonical equivalent are intentionally absent —
 * `canonicalAgentRole` returns `undefined` for them, and callers fall back to
 * the raw id (not part of the canonical 8).
 */
export const AGENT_ROLE_ALIASES: Readonly<Record<string, CanonicalAgentRole>> = {
  // canonical wire IDs (identity)
  'bug-context': 'bug-context',
  'log-analyzer': 'log-analyzer',
  'code-semantics': 'code-semantics',
  'change-analyzer': 'change-analyzer',
  'hypothesis-gen': 'hypothesis-gen',
  verifier: 'verifier',
  skeptic: 'skeptic',
  documenter: 'documenter',

  // service v1 snake_case aliases (parity with service AGENT_ROLE_ALIASES)
  bug_context: 'bug-context',
  log_analyzer: 'log-analyzer',
  code_semantics: 'code-semantics',
  change_analyzer: 'change-analyzer',
  comms_analyzer: 'change-analyzer',
  'comms-analyzer': 'change-analyzer',
  hypothesis_generator: 'hypothesis-gen',
  hypotheses: 'hypothesis-gen',

  // earlier agent names -> canonical, kept so an older event stream still
  // renders on the canonical agent panel.
  'grafana-analyzer': 'log-analyzer',
  'codebase-semantics': 'code-semantics',
  'production-analyzer': 'change-analyzer',
  'root-cause': 'hypothesis-gen',
  'evidence-synthesizer': 'hypothesis-gen',
};

/**
 * Resolve any agent id (canonical, service-alias, or deprecated local-pipeline
 * name) to its canonical role. Returns `undefined` for ids with no canonical
 * equivalent (utility/local-only agents), letting the caller keep the raw id.
 */
export function canonicalAgentRole(agentId: string | undefined): CanonicalAgentRole | undefined {
  if (!agentId) return undefined;
  return AGENT_ROLE_ALIASES[agentId];
}

/**
 * Normalize an agent id for rendering: canonical role if one exists, else the
 * raw id unchanged. This is what projections use so panels always show the
 * canonical spelling when the event came from the service.
 */
export function normalizeAgentId(agentId: string | undefined): string | undefined {
  if (!agentId) return undefined;
  return AGENT_ROLE_ALIASES[agentId] ?? agentId;
}

/** Canonical MCP skills each role is allowed to invoke (service `ROLE_SKILLS`). */
export const ROLE_SKILLS: Readonly<Record<CanonicalAgentRole, readonly string[]>> = {
  'bug-context': ['jira', 'slack'],
  'log-analyzer': ['grafana'],
  'code-semantics': ['code-search'],
  'change-analyzer': ['code-search', 'jira'],
  'hypothesis-gen': ['grafana', 'code-search'],
  verifier: ['grafana', 'code-search'],
  skeptic: ['jira', 'code-search'],
  documenter: ['jira', 'slack'],
};

// Per-role result event payloads (service events.v2.ts).
// Pinned so renderers/contract tests have a typed surface. Plain interfaces —
// no zod import in the thin client.

/** A citation/evidence reference attached to evidence + hypotheses. */
export interface EvidenceRef {
  id: string;
  sourceUrl: string;
  title?: string;
}

/** `evidence.collected` — emitted by bug-context, log-analyzer, code-semantics, change-analyzer. */
export interface EvidenceCollectedPayload {
  agentDefinitionId: string;
  canonicalRole: string;
  stepId: string;
  snippet: string;
  citations: EvidenceRef[];
  partial?: boolean;
}

/** `hypothesis.proposed` — emitted by hypothesis-gen. */
export interface HypothesisProposedPayload {
  hypothesisId: string;
  title: string;
  summary: string;
  /** 0..1 */
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

/** `verifier.verdict` — emitted by verifier. */
export interface VerifierVerdictPayload {
  verdict: 'supported' | 'not_supported' | 'inconclusive';
  /** 0..1 */
  confidence: number;
  iteration?: number;
  missingEvidence: string[];
  hypothesisId?: string | null;
}

/** `documenter.reported` — emitted by documenter. */
export interface DocumenterReportedPayload {
  reportRef: string;
  citationCount: number;
  hypothesisCount: number;
  payloadBlobUri?: string | null;
}

/** Canonical kernel-v2 result event type identifiers (subset the client renders). */
export const AGENT_RESULT_EVENT_TYPES = [
  'evidence.collected',
  'hypothesis.proposed',
  'verifier.verdict',
  'documenter.reported',
] as const;

export type AgentResultEventType = (typeof AGENT_RESULT_EVENT_TYPES)[number];
