/**
 * RemoteServiceRunner — the single streaming engine behind every thin-client
 * command (used by `createPluginRuntime`; there is no parallel run path).
 *
 * Flow: createRun -> open EventStream (with durable replay) -> fold events into
 * projections -> render via HostAdapter.renderPanel until a terminal
 * investigation.completed / investigation.failed event.
 *
 * THIN-CLIENT INVARIANT: this path makes NO model call and dispatches no
 * server-side pipeline step. That constraint is grep-enforced in CI (the
 * ip-guard job's no-provider-SDK check); the investigation runs entirely in the
 * hosted service.
 */
import type { HostAdapter } from '../host/host-adapter.js';
import type { ServiceClient } from '../service/client.js';
import { EventStream, type SseConnector } from '../stream/event-stream.js';
import {
  fold,
  initialProjection,
  reduce,
  toPanelView,
  type ProjectionState,
} from '../projections/index.js';
import type { CreateRunRequest, Run } from '../service/types.js';
import { PresenceHeartbeat } from '../presence/heartbeat.js';
import type { InvestigationEventEnvelope, RunStatus } from '../types.js';

export interface RemoteRunnerDeps {
  client: ServiceClient;
  host: HostAdapter;
  connector: SseConnector;
  /** Base URL of the SSE stream endpoint (per-investigation path appended). */
  streamUrlFor: (investigationId: string) => string;
  /** Bearer for the SSE connection (session JWT / access token). */
  authHeader?: () => string | undefined;
}

export interface RemoteRunResult {
  investigationId: string;
  status: RunStatus;
  reportUri?: string;
  costUsd: number;
}

/** Streaming options shared by run() (new run) and attach() (existing run). */
export interface StreamOptions {
  /**
   * Durable replay events (fetched via ServiceClient.getEventSlice) applied
   * before the live stream attaches, so projections are seeded on reconnect.
   */
  replaySlice?: InvestigationEventEnvelope[];
  /**
   * Attach live presence for this surface for the lifetime of the stream.
   * Ephemeral (30s TTL) — heartbeats while connected, detaches on finish.
   */
  presence?: { surface: string; intervalMs?: number };
}

const TERMINAL: ReadonlySet<string> = new Set([
  'investigation.completed',
  'investigation.failed',
]);

export class RemoteServiceRunner {
  constructor(private readonly deps: RemoteRunnerDeps) {}

  /**
   * Start a run and stream it to terminal. Resolves with the final result.
   * `replaySlice` (optional) lets a caller pre-seed durable replay events
   * fetched via ServiceClient.getEventSlice before the live stream attaches.
   */
  async run(
    req: CreateRunRequest,
    opts: StreamOptions = {},
  ): Promise<RemoteRunResult> {
    const created: Run = await this.deps.client.createRun(req);
    return this.streamToTerminal(created.investigationId, opts);
  }

  /**
   * Attach to an EXISTING run (`/connect <id>`) and stream it to terminal
   * without creating a new one. Callers pass the durable replay slice fetched
   * via ServiceClient.getEventSlice so projections are seeded before the live
   * stream attaches (AD-9 continuity). Same fold/render loop as run() — no
   * projection logic is duplicated per command.
   */
  async attach(
    investigationId: string,
    opts: StreamOptions = {},
  ): Promise<RemoteRunResult> {
    return this.streamToTerminal(investigationId, opts);
  }

  private async streamToTerminal(
    investigationId: string,
    opts: StreamOptions,
  ): Promise<RemoteRunResult> {
    const state: ProjectionState = initialProjection(investigationId);

    // Render the initial (created) frame immediately.
    this.deps.host.renderPanel(toPanelView(state));

    // Best-effort live presence heartbeat (never blocks/breaks the stream).
    const heartbeat = opts.presence
      ? new PresenceHeartbeat({
          client: this.deps.client,
          investigationId,
          surface: opts.presence.surface,
          ...(opts.presence.intervalMs !== undefined
            ? { intervalMs: opts.presence.intervalMs }
            : {}),
        })
      : undefined;
    if (heartbeat) await heartbeat.start();

    return await new Promise<RemoteRunResult>((resolve, reject) => {
      let settled = false;
      const headers: Record<string, string> = {};
      const auth = this.deps.authHeader?.();
      if (auth) headers['Authorization'] = `Bearer ${auth}`;

      const stream = new EventStream({
        url: this.deps.streamUrlFor(investigationId),
        connector: this.deps.connector,
        headers,
      });

      const finish = (status: RunStatus) => {
        if (settled) return;
        settled = true;
        stream.close();
        void heartbeat?.stop();
        resolve({
          investigationId,
          status,
          reportUri: state.runSummary.reportUri,
          costUsd: state.runSummary.costUsd,
        });
      };

      stream.subscribe((event: InvestigationEventEnvelope) => {
        try {
          reduce(state, event);
          this.deps.host.renderPanel(toPanelView(state));
          if (TERMINAL.has(event.type)) {
            finish(event.type === 'investigation.completed' ? 'completed' : 'failed');
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            stream.close();
            void heartbeat?.stop();
            reject(err);
          }
        }
      });

      if (opts.replaySlice && opts.replaySlice.length > 0) {
        stream.applyReplay(opts.replaySlice);
        // If the replay already contained a terminal event, we're done.
        const folded = fold(investigationId, opts.replaySlice);
        if (folded.runSummary.status === 'completed' || folded.runSummary.status === 'failed') {
          // state already reflects it via applyReplay -> reduce.
        }
      }

      stream.open();
    });
  }
}
