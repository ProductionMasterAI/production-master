/**
 * Public, reusable test fixtures + a host-neutral conformance scenario.
 *
 * Exported from @production-master/plugin-core so the per-IDE adapter packages
 * and the conformance suite can drive ANY HostAdapter through the SAME scripted
 * scenario (createRun -> stream from recorded SSE -> reject a mutation) and
 * assert identical projection snapshots + identical audit-call sequences.
 *
 * These are deterministic, in-memory doubles. NO network, NO LLM/provider SDK.
 */
import type { InvestigationEventEnvelope, Scope } from '../types.js';
import type { HttpRequest, HttpResponse, HttpTransport, Run } from '../service/types.js';
import type { SseConnection, SseConnector, SseHandlers } from '../stream/event-stream.js';
import type { McpToolTransport, McpSessionGrant, AuditSink } from '../mcp/types.js';
import { ServiceClient } from '../service/client.js';
import { RemoteServiceRunner } from '../runner/remote-runner.js';
import { McpSessionManager } from '../mcp/session-manager.js';
import { McpTools } from '../mcp/tools.js';
import { ToolError } from '../mcp/types.js';
import { renderPanelCommands, type RenderCommand } from '../render/render-commands.js';
import type { HostAdapter } from '../host/host-adapter.js';
import type { PanelView } from '../types.js';

// Re-export the reusable schema-real BFF emulator so downstream adapter
// packages (e.g. pmctl) drive their surface against the SAME emulator without
// forking a copy. Lives under service/__fixtures__ (built into dist) so it is
// importable from `@production-master/plugin-core/testing`.
export {
  EmulatedBff,
  EMULATOR_CROSS_SERVICE_ROUTES,
} from '../service/__fixtures__/emulated-bff.js';
export type { EmulatedBffOptions } from '../service/__fixtures__/emulated-bff.js';

/** Test double for HostAdapter — import from `@production-master/plugin-core/testing`, not the main barrel. */
export { NoopHostAdapter } from '../host/__fixtures__/noop-host-adapter.js';

/** A canonical recorded SSE stream used by every adapter conformance run. */
export const RECORDED_EVENTS: InvestigationEventEnvelope[] = [
  ev(1, 'investigation.created', { title: 'Checkout 500s after deploy' }),
  ev(2, 'investigation.status_changed', { status: 'running' }),
  ev(3, 'phase.started', { phaseId: 'understand', label: 'Understand' }),
  ev(4, 'agent.invoked', { invocationId: 'a1', agentId: 'bug-context' }),
  ev(5, 'cost.consumed', { invocationId: 'a1', agentId: 'bug-context', costUsd: 0.012 }),
  ev(6, 'agent.completed', { invocationId: 'a1' }),
  ev(7, 'phase.completed', { phaseId: 'understand' }),
  ev(8, 'action.proposed', { actionId: 'act1', kind: 'rerun_from_phase', summary: 'Re-run gather-evidence with broader query' }),
  ev(9, 'investigation.completed', { reportUri: 'https://pm.example/r/inv_demo' }),
];

function ev(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): InvestigationEventEnvelope {
  return {
    eventId: `evt_${sequence}`,
    investigationId: 'inv_demo',
    type,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString(),
    sequence,
    schemaVersion: 'investigation.events.v1',
    payload,
  };
}

/** Deterministic in-memory HttpTransport with a `/v1/runs` createRun route. */
export class FixtureHttpTransport implements HttpTransport {
  readonly received: HttpRequest[] = [];
  async request(opts: HttpRequest): Promise<HttpResponse> {
    this.received.push(opts);
    if (opts.method === 'POST' && opts.path === '/v1/runs') {
      const run: Run = { investigationId: 'inv_demo', status: 'created', createdAt: '2026-01-01T00:00:00.000Z', costUsd: 0 };
      return { status: 201, body: run };
    }
    return { status: 404, body: { message: `no route: ${opts.method} ${opts.path}` } };
  }
}

/** Replays a fixed list of SSE frames on connect (optionally dropping mid-stream). */
export class FixtureSseConnector implements SseConnector {
  private connectCount = 0;
  readonly connectCalls: Array<{ lastEventId?: string }> = [];
  constructor(
    private readonly frames: InvestigationEventEnvelope[] = RECORDED_EVENTS,
    private readonly dropAfter?: number,
  ) {}
  connect(opts: { url: string; lastEventId?: string }, handlers: SseHandlers): SseConnection {
    this.connectCount += 1;
    this.connectCalls.push({ lastEventId: opts.lastEventId });
    const isFirst = this.connectCount === 1;
    let start = 0;
    if (opts.lastEventId) {
      const idx = this.frames.findIndex((f) => f.eventId === opts.lastEventId);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const end = isFirst && this.dropAfter !== undefined ? Math.min(this.dropAfter, this.frames.length) : this.frames.length;
    for (let i = start; i < end; i++) handlers.onMessage(JSON.stringify(this.frames[i]));
    if (isFirst && this.dropAfter !== undefined && end < this.frames.length) handlers.onClose();
    return { close: () => {} };
  }
}

/** Records MCP tool calls; returns 200 ok by default. */
export class FixtureMcpTransport implements McpToolTransport {
  readonly calls: Array<{ tool: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
  async call(opts: { endpoint: string; sessionJwt: string; tool: string; args: Record<string, unknown>; idempotencyKey?: string }) {
    this.calls.push({ tool: opts.tool, args: opts.args, idempotencyKey: opts.idempotencyKey });
    return { status: 200, body: { ok: true } };
  }
}

/** A canned MCP session grant (no real JWT — fixture string only). */
export function fixtureGrant(): McpSessionGrant {
  return { endpoint: 'mcp://fixture/inv_demo', audience: 'pm-mcp', sessionJwt: 'fixture-session-jwt', ttlSeconds: 300 };
}

/** One captured audit event in the scenario. */
export interface AuditEvent {
  type: string;
  tool: string;
  investigationId: string;
}

/** The result of running the conformance scenario against one adapter. */
export interface ScenarioResult {
  /** Final folded panel view rendered to the host. */
  finalPanel: PanelView;
  /** Host-neutral render commands for the final panel. */
  finalCommands: RenderCommand[];
  /** Every audit event emitted (e.g. user.mutation_rejected). */
  audit: AuditEvent[];
  /** Tool calls that actually reached the (fake) service transport. */
  mcpCallsReachingService: string[];
  /** The terminal run status. */
  status: string;
  /** The error code thrown by the rejected mutation (for assertions). */
  rejectedMutationCode?: string;
}

/**
 * Drive a host adapter through the canonical conformance scenario:
 *   1. create a scoped MCP session (login proxy) -> registerMcpServer
 *   2. createRun + stream the recorded SSE to terminal -> renderPanel folds
 *   3. attempt a mutation tool with the host set to REJECT -> modal-gated,
 *      never reaches the service, emits user.mutation_rejected.
 *
 * Returns a ScenarioResult the caller asserts on. Because all rendering +
 * projection logic lives in plugin-core, every adapter MUST produce identical
 * finalCommands + audit sequences for the same inputs (issue #29 / risk R2).
 */
export async function runConformanceScenario(host: HostAdapter): Promise<ScenarioResult> {
  const scopes: Scope[] = ['read-investigation', 'write-investigation', 'approve-action'];
  const httpTransport = new FixtureHttpTransport();
  const client = new ServiceClient({ transport: httpTransport, getAuthToken: () => 'fixture-access-token' });

  // 1. Login proxy: mint + register a scoped MCP session.
  const sessions = new McpSessionManager({
    client,
    host,
    createServiceSession: async () => fixtureGrant(),
  });
  await sessions.createSession(['inv_demo'], scopes);

  // 2. Create the run and stream it to terminal.
  const connector = new FixtureSseConnector();
  const runner = new RemoteServiceRunner({
    client,
    host,
    connector,
    streamUrlFor: (id) => `https://fixture/stream/${id}`,
    authHeader: () => 'fixture-access-token',
  });
  const result = await runner.run({ ticket: 'demo' });

  // 3. Attempt a mutation; host is configured to reject.
  const audit: AuditEvent[] = [];
  const auditSink: AuditSink = (e) => audit.push(e);
  const mcpTransport = new FixtureMcpTransport();
  const tools = new McpTools({
    sessions,
    host,
    transport: mcpTransport,
    audit: auditSink,
    newIdempotencyKey: () => 'fixture-idem-key',
  });

  let rejectedMutationCode: string | undefined;
  try {
    await tools.invoke('investigation.add_evidence', { investigationId: 'inv_demo', note: 'observed retry storm' });
  } catch (err) {
    if (err instanceof ToolError) rejectedMutationCode = err.code;
    else throw err;
  }

  // Recompute the final panel deterministically from the recorded stream.
  const { fold, toPanelView } = await import('../projections/index.js');
  const finalPanel = toPanelView(fold('inv_demo', RECORDED_EVENTS));

  return {
    finalPanel,
    finalCommands: renderPanelCommands(finalPanel),
    audit,
    mcpCallsReachingService: mcpTransport.calls.map((c) => c.tool),
    status: result.status,
    rejectedMutationCode,
  };
}
