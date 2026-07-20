/**
 * PresenceHeartbeat — keeps a surface "attached" to an investigation for the
 * lifetime of a `/connect` session (PRD-11 §continuity, WS-B task 4).
 *
 * Presence is ephemeral: the service stores it in a KV with a 30s TTL and
 * NEVER writes it to the AD-1 event log. A live surface must therefore re-POST
 * on an interval strictly under the TTL, and DELETE on disconnect so a stale
 * entry does not linger the full TTL.
 *
 * Design:
 *  - `start()` attaches immediately, then schedules a beat every `intervalMs`
 *    (default 10s — comfortably under the 30s server TTL).
 *  - `stop()` cancels the timer and best-effort DELETEs the entry.
 *  - Timer + clock are injected so tests are deterministic (no real setTimeout).
 *  - A failed beat NEVER throws into the caller's stream loop: presence is a
 *    best-effort live signal, not part of the durable investigation. Failures
 *    are surfaced via the optional `onError` hook.
 *
 * This helper holds NO transport of its own — it drives ServiceClient's
 * presence methods, so it inherits the same auth/no-enumeration behaviour as
 * every other surface. No LLM/provider SDK.
 */
import type { ServiceClient } from "../service/client.js";
import type { PresenceSnapshot } from "../service/types.js";

/** Server-side presence TTL (`PRESENCE_HEARTBEAT_TTL_MS` on pm-service). */
export const PRESENCE_TTL_MS = 30_000;

/** Default heartbeat cadence — a third of the TTL, so two beats may drop. */
export const DEFAULT_PRESENCE_INTERVAL_MS = 10_000;

export interface PresenceHeartbeatOptions {
  client: Pick<ServiceClient, "attachPresence" | "detachPresence">;
  investigationId: string;
  /** Surface label, e.g. "claude-code", "cursor", "pmctl". */
  surface: string;
  /** Beat cadence in ms (default 10s). Must be < 30s server TTL. */
  intervalMs?: number;
  /** Injectable timer (default global setInterval). */
  setInterval?: (fn: () => void, ms: number) => unknown;
  /** Injectable timer clear (default global clearInterval). */
  clearInterval?: (handle: unknown) => void;
  /** Notified when an attach/detach beat rejects (best-effort; never thrown). */
  onError?: (err: unknown) => void;
  /** Notified with each successful snapshot (attach beats + detach). */
  onSnapshot?: (snapshot: PresenceSnapshot) => void;
}

export class PresenceHeartbeat {
  private readonly client: PresenceHeartbeatOptions["client"];
  private readonly investigationId: string;
  private readonly surface: string;
  private readonly intervalMs: number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly onError?: (err: unknown) => void;
  private readonly onSnapshot?: (snapshot: PresenceSnapshot) => void;

  private handle: unknown = undefined;
  private running = false;

  constructor(opts: PresenceHeartbeatOptions) {
    this.client = opts.client;
    this.investigationId = opts.investigationId;
    this.surface = opts.surface;
    this.intervalMs = opts.intervalMs ?? DEFAULT_PRESENCE_INTERVAL_MS;
    this.setIntervalFn =
      opts.setInterval ??
      ((fn, ms) => setInterval(fn, ms) as unknown);
    this.clearIntervalFn =
      opts.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.onError = opts.onError;
    this.onSnapshot = opts.onSnapshot;
  }

  /**
   * Attach now, then beat on the interval. Idempotent: a second `start()` is a
   * no-op while already running. Resolves once the initial attach settles so a
   * caller may `await` first presence before opening the stream.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.beat();
    if (!this.running) return; // stopped during the initial attach
    this.handle = this.setIntervalFn(() => {
      void this.beat();
    }, this.intervalMs);
  }

  /** Cancel the timer and best-effort detach. Idempotent. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== undefined) {
      this.clearIntervalFn(this.handle);
      this.handle = undefined;
    }
    try {
      const snapshot = await this.client.detachPresence(
        this.investigationId,
        this.surface,
      );
      this.onSnapshot?.(snapshot);
    } catch (err) {
      this.onError?.(err);
    }
  }

  private async beat(): Promise<void> {
    try {
      const snapshot = await this.client.attachPresence(
        this.investigationId,
        this.surface,
      );
      this.onSnapshot?.(snapshot);
    } catch (err) {
      this.onError?.(err);
    }
  }
}
