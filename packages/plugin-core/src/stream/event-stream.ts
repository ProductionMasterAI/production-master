/**
 * SSE consumer for the `investigation.events.v1` stream.
 *
 * Responsibilities:
 *  - parse envelopes,
 *  - re-sort by monotonic `sequence`,
 *  - dedupe on `eventId`,
 *  - reconnect with `Last-Event-ID` so the service replays `sequence > lastSeq`,
 *  - surface a clean, gap-free, ordered event callback to consumers.
 *
 * The actual SSE wire transport is injected via `SseConnector` so the core is
 * host-neutral and fully testable against recorded fixtures (no real network,
 * no `EventSource` dependency baked in).
 */
import type { InvestigationEventEnvelope } from '../types.js';

/** A single open SSE connection. */
export interface SseConnection {
  close(): void;
}

/** Callbacks the connector drives as raw frames arrive. */
export interface SseHandlers {
  onMessage(raw: string): void;
  onError(err: unknown): void;
  /** Fired when the underlying connection ends (idle/closed by server). */
  onClose(): void;
}

/**
 * Opens an SSE connection. Implementations: a browser `EventSource` adapter,
 * a Node `fetch`/undici streaming adapter, or a fixture replayer in tests.
 * `lastEventId` (when set) must be sent as the `Last-Event-ID` request header.
 */
export interface SseConnector {
  connect(opts: { url: string; lastEventId?: string; headers?: Record<string, string> }, handlers: SseHandlers): SseConnection;
}

export interface EventStreamOptions {
  url: string;
  connector: SseConnector;
  headers?: Record<string, string>;
  /** Reconnect backoff in ms (default 1000). */
  reconnectMs?: number;
  /** Max reconnect attempts before giving up (default Infinity). */
  maxReconnects?: number;
  /** Injectable timer for deterministic tests. */
  scheduleReconnect?: (fn: () => void, ms: number) => void;
}

export type EventStreamListener = (event: InvestigationEventEnvelope) => void;

export class EventStream {
  private readonly opts: EventStreamOptions;
  private readonly listeners = new Set<EventStreamListener>();
  private readonly seenEventIds = new Set<string>();
  private lastSeq = 0;
  private lastEventId: string | undefined;
  private connection: SseConnection | undefined;
  private reconnects = 0;
  private closed = false;
  private readonly schedule: (fn: () => void, ms: number) => void;

  constructor(opts: EventStreamOptions) {
    this.opts = opts;
    this.schedule =
      opts.scheduleReconnect ?? ((fn, ms) => setTimeout(fn, ms));
  }

  /** Subscribe to ordered, de-duplicated events. Returns an unsubscribe fn. */
  subscribe(listener: EventStreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Highest sequence delivered so far. */
  get highestSequence(): number {
    return this.lastSeq;
  }

  open(): void {
    this.closed = false;
    this.connect();
  }

  close(): void {
    this.closed = true;
    this.connection?.close();
    this.connection = undefined;
  }

  private connect(): void {
    if (this.closed) return;
    this.connection = this.opts.connector.connect(
      { url: this.opts.url, lastEventId: this.lastEventId, headers: this.opts.headers },
      {
        onMessage: (raw) => this.handleRaw(raw),
        onError: () => this.scheduleReconnect(),
        onClose: () => this.scheduleReconnect(),
      },
    );
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const max = this.opts.maxReconnects ?? Number.POSITIVE_INFINITY;
    if (this.reconnects >= max) {
      this.closed = true;
      return;
    }
    this.reconnects += 1;
    this.schedule(() => this.connect(), this.opts.reconnectMs ?? 1000);
  }

  private handleRaw(raw: string): void {
    let env: InvestigationEventEnvelope;
    try {
      env = JSON.parse(raw) as InvestigationEventEnvelope;
    } catch {
      return; // ignore malformed frame
    }
    if (!env || typeof env.eventId !== 'string' || typeof env.sequence !== 'number') {
      return;
    }
    // Dedupe on eventId; ignore anything we've already delivered.
    if (this.seenEventIds.has(env.eventId)) return;
    // A successful frame resets the reconnect budget.
    this.reconnects = 0;
    this.seenEventIds.add(env.eventId);
    this.lastEventId = env.eventId;
    if (env.sequence > this.lastSeq) this.lastSeq = env.sequence;
    for (const l of this.listeners) l(env);
  }

  /**
   * Feed an already-fetched replay slice (e.g. from `ServiceClient.getEventSlice`)
   * through the same dedupe/ordering path before attaching the live stream.
   * Events are applied in ascending `sequence` order.
   */
  applyReplay(events: InvestigationEventEnvelope[]): void {
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    for (const e of ordered) this.handleRaw(JSON.stringify(e));
  }
}
