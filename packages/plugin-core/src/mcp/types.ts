/**
 * MCP session + tool surface types for the thin client.
 *
 * The client MAPS the investigation.* tool surface; the SERVICE ENFORCES scope.
 * Mutation tools gate through HostAdapter.showMutationPreview before any call
 * reaches the service. No LLM/provider SDK.
 */
import type { Scope, ToolErrorCode } from '../types.js';

/** Response from the service CreatePluginMcpSession call. */
export interface McpSessionGrant {
  endpoint: string;
  audience: string;
  sessionJwt: string;
  ttlSeconds: number;
}

/** The read tools — no confirmation required. */
export const READ_TOOLS = [
  'investigation.get_summary',
  'investigation.list_evidence',
  'investigation.get_evidence',
  'investigation.list_hypotheses',
  'investigation.get_hypothesis',
  'investigation.list_actions',
  'investigation.get_event_log',
  'investigation.get_agent_prompt',
  'investigation.list_snapshots',
  'investigation.subscribe',
] as const;

/** The mutation tools — each gated by a HostAdapter.showMutationPreview. */
export const MUTATION_TOOLS = [
  'investigation.add_evidence',
  'investigation.correct_evidence',
  'investigation.invalidate_evidence',
  'investigation.invalidate_hypothesis',
  'investigation.add_correction',
  'investigation.create_snapshot',
  'investigation.rerun_from_phase',
  'investigation.resume',
] as const;

export type ReadTool = (typeof READ_TOOLS)[number];
export type MutationTool = (typeof MUTATION_TOOLS)[number];
export type ToolName = ReadTool | MutationTool;

export function isMutationTool(name: string): name is MutationTool {
  return (MUTATION_TOOLS as readonly string[]).includes(name);
}
export function isReadTool(name: string): name is ReadTool {
  return (READ_TOOLS as readonly string[]).includes(name);
}

/** A typed tool error mirroring the service ToolErrorCode set. */
export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Audit hook the manager calls for client-side audit events (e.g. rejects). */
export type AuditSink = (event: { type: string; tool: string; investigationId: string }) => void;

/** The seam that actually performs an MCP tool call over the wire. */
export interface McpToolTransport {
  call(opts: {
    endpoint: string;
    sessionJwt: string;
    tool: string;
    args: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<{ status: number; body: unknown }>;
}

export type { Scope };
