/**
 * Maps the investigation.* MCP tool surface onto an active scoped session.
 *
 * - Read tools call straight through (no confirmation).
 * - Mutation tools are trust-gated (Q9): a mutation whose blast radius is
 *   already covered by an active session trust grant proceeds without a fresh
 *   prompt; anything broader is a trust EXPANSION and calls
 *   HostAdapter.showMutationPreview. A 'reject' returns a
 *   USER_REJECTED_CONFIRMATION ToolError, emits a `user.mutation_rejected`
 *   audit event, and NEVER reaches the service. An 'approve' records the grant
 *   (local audit) and emits the expansion to the service ledger.
 *   With no trust store wired, every mutation is preview-gated (legacy).
 * - Out-of-scope investigationIds surface PERMISSION_DENIED.
 *
 * No LLM/provider SDK.
 */
import type { HostAdapter } from '../host/host-adapter.js';
import type { MutationPreviewV1 } from '../types.js';
import type {
  SessionTrustGrantRef,
  SessionTrustGrantStore,
  TrustExpansionAuditEvent,
} from '../trust/session-grants.js';
import { classifyMutation } from '../trust/tool-trust.js';
import type { McpSessionManager } from './session-manager.js';
import {
  ToolError,
  isMutationTool,
  isReadTool,
  type AuditSink,
  type McpToolTransport,
  type MutationTool,
} from './types.js';

export interface McpToolsDeps {
  sessions: McpSessionManager;
  host: HostAdapter;
  transport: McpToolTransport;
  audit?: AuditSink;
  newIdempotencyKey?: () => string;
  /** Session trust grants (Q9). When set, mutations are grant-gated. */
  trust?: SessionTrustGrantStore;
  /** Emits an approved trust expansion to the authoritative service ledger. */
  emitTrustExpansion?: (event: TrustExpansionAuditEvent) => void | Promise<void>;
  /** Injectable grant-id generator (deterministic in tests). */
  newGrantId?: () => string;
  /** Label recorded on grants minted in this session. */
  sessionLabel?: string;
}

function summarize(tool: string, args: Record<string, unknown>): string {
  const id = (args.investigationId as string) ?? '';
  return `${tool} on ${id}`;
}

export class McpTools {
  constructor(private readonly deps: McpToolsDeps) {}

  /**
   * Invoke an investigation.* tool. Mutations are preview-gated. Returns the
   * service response body on success.
   */
  async invoke(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const session = this.deps.sessions.getActiveSession();
    if (!session) throw new ToolError('PERMISSION_DENIED', 'no active MCP session');

    const investigationId = (args.investigationId as string) ?? session.investigationIds[0];
    if (!this.deps.sessions.isInScope(investigationId)) {
      throw new ToolError('PERMISSION_DENIED', `investigation ${investigationId} out of session scope`);
    }

    if (!isReadTool(tool) && !isMutationTool(tool)) {
      throw new ToolError('NOT_FOUND', `unknown tool ${tool}`);
    }

    if (isMutationTool(tool)) {
      await this.gateMutation(tool, investigationId, args);
    }

    const idempotencyKey = isMutationTool(tool) ? this.deps.newIdempotencyKey?.() : undefined;
    const res = await this.deps.transport.call({
      endpoint: session.grant.endpoint,
      sessionJwt: session.grant.sessionJwt,
      tool,
      args,
      idempotencyKey,
    });

    if (res.status >= 200 && res.status < 300) return res.body;
    const message = (res.body as { message?: string } | undefined)?.message ?? `tool ${tool} failed`;
    if (res.status === 403) throw new ToolError('PERMISSION_DENIED', message);
    if (res.status === 404) throw new ToolError('NOT_FOUND', message);
    if (res.status === 409) throw new ToolError('IDEMPOTENCY_CONFLICT', message);
    if (res.status === 402) throw new ToolError('BUDGET_EXHAUSTED', message);
    throw new ToolError('NOT_FOUND', message);
  }

  /**
   * Trust-gate a mutation. A mutation covered by an active grant proceeds
   * silently; an uncovered one prompts for approval (a trust expansion). On
   * approve the grant is recorded and mirrored to the service; on reject the
   * mutation is audited and blocked before any wire call.
   */
  private async gateMutation(
    tool: MutationTool,
    investigationId: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const { trust } = this.deps;
    const cls = classifyMutation(tool);

    if (trust?.match({ investigationId, ...cls })) return;

    const preview: MutationPreviewV1 = {
      schemaVersion: 'mutation-preview.v1',
      tool,
      investigationId,
      summary: summarize(tool, args),
      details: args,
    };
    const decision = await this.deps.host.showMutationPreview(preview);
    if (decision === 'reject') {
      this.deps.audit?.({ type: 'user.mutation_rejected', tool, investigationId });
      throw new ToolError('USER_REJECTED_CONFIRMATION', `user rejected ${tool}`);
    }

    if (!trust) return;
    const at = new Date().toISOString();
    const grant: SessionTrustGrantRef = {
      grantId:
        this.deps.newGrantId?.() ??
        `grant-${investigationId}-${cls.riskClass}-${cls.reversibility}`,
      investigationId,
      riskClass: cls.riskClass,
      reversibility: cls.reversibility,
      sessionLabel: this.deps.sessionLabel ?? 'mcp-session',
      grantedAt: at,
    };
    trust.issue(grant);
    await this.deps.emitTrustExpansion?.({ type: 'trust-grant-issued', grant, at });
  }
}
