/**
 * A test SseConnector that replays recorded frames. It can simulate a mid-stream
 * drop: on first connect it delivers `frames` up to `dropAfter`, then calls
 * onClose; on reconnect it delivers the remainder. Honors `lastEventId` by
 * skipping frames already delivered (mirrors server replay of sequence > lastSeq).
 */
import type { InvestigationEventEnvelope } from '../../types.js';
import type { SseConnection, SseConnector, SseHandlers } from '../event-stream.js';

export class FixtureConnector implements SseConnector {
  private connectCount = 0;
  readonly connectCalls: Array<{ lastEventId?: string }> = [];

  constructor(
    private readonly frames: InvestigationEventEnvelope[],
    private readonly dropAfter?: number,
  ) {}

  connect(opts: { url: string; lastEventId?: string }, handlers: SseHandlers): SseConnection {
    this.connectCount += 1;
    this.connectCalls.push({ lastEventId: opts.lastEventId });
    const isFirst = this.connectCount === 1;

    let startIdx = 0;
    if (opts.lastEventId) {
      const idx = this.frames.findIndex((f) => f.eventId === opts.lastEventId);
      startIdx = idx >= 0 ? idx + 1 : 0;
    }

    const endIdx =
      isFirst && this.dropAfter !== undefined
        ? Math.min(this.dropAfter, this.frames.length)
        : this.frames.length;

    for (let i = startIdx; i < endIdx; i++) {
      handlers.onMessage(JSON.stringify(this.frames[i]));
    }

    if (isFirst && this.dropAfter !== undefined && endIdx < this.frames.length) {
      handlers.onClose();
    }

    return { close: () => {} };
  }
}
