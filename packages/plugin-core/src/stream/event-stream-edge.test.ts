/**
 * Per-adapter SSE edge cases for the TS `EventStream` (issue #119, Task B),
 * beyond the single conformance scenario: a mid-stream drop with Last-Event-ID
 * resume (exactly-once delivery, no gaps) and graceful handling of malformed
 * frames (invalid JSON, empty data, partial frame, missing fields).
 */
import { describe, it, expect } from "vitest";
import { EventStream } from "./event-stream.js";
import type { SseConnector, SseHandlers } from "./event-stream.js";
import { FixtureConnector } from "./__fixtures__/fixture-connector.js";
import { loadRecordedEvents } from "../__fixtures__/load-events.js";
import type { InvestigationEventEnvelope } from "../types.js";

const syncSchedule = (fn: () => void) => fn();

function collect(stream: EventStream): InvestigationEventEnvelope[] {
  const out: InvestigationEventEnvelope[] = [];
  stream.subscribe((e) => out.push(e));
  return out;
}

describe("EventStream — reconnect edge case", () => {
  it("resumes from Last-Event-ID and delivers every event exactly once across a mid-stream drop", () => {
    const frames = loadRecordedEvents();
    const dropAfter = 3;
    const connector = new FixtureConnector(frames, dropAfter);
    const stream = new EventStream({
      url: "sse://x",
      connector,
      scheduleReconnect: syncSchedule,
    });
    const got = collect(stream);
    stream.open();

    // Exactly once: no eventId delivered more than once (the reconnect overlap
    // replays the last-seen frame, which must be deduped).
    const counts = new Map<string, number>();
    for (const e of got) counts.set(e.eventId, (counts.get(e.eventId) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    // No gaps: every sequence 1..N exactly once, in order.
    expect(got.map((e) => e.sequence)).toEqual(frames.map((f) => f.sequence));
    expect(got.length).toBe(frames.length);
    // The reconnect carried the Last-Event-ID of the last frame delivered
    // BEFORE the drop.
    expect(connector.connectCalls).toHaveLength(2);
    expect(connector.connectCalls[1]?.lastEventId).toBe(
      frames[dropAfter - 1].eventId,
    );
    expect(stream.highestSequence).toBe(frames[frames.length - 1].sequence);
  });
});

describe("EventStream — malformed frame edge cases", () => {
  it("skips invalid JSON, empty data, partial frames, and missing-field frames while valid events still process", () => {
    const valid = loadRecordedEvents()[0];
    let threw = false;
    const connector: SseConnector = {
      connect(_opts, handlers: SseHandlers) {
        try {
          handlers.onMessage(""); // empty data payload
          handlers.onMessage("not json"); // invalid JSON
          handlers.onMessage('{"eventId":"x"'); // truncated / partial JSON
          handlers.onMessage(JSON.stringify({ foo: "bar" })); // valid JSON, wrong shape
          handlers.onMessage(
            JSON.stringify({ ...valid, eventId: undefined }), // missing eventId
          );
          handlers.onMessage(JSON.stringify({ ...valid, sequence: "3" })); // non-numeric sequence
          handlers.onMessage(JSON.stringify(valid)); // the single good frame
        } catch {
          threw = true;
        }
        return { close() {} };
      },
    };
    const stream = new EventStream({
      url: "sse://x",
      connector,
      scheduleReconnect: syncSchedule,
    });
    const got = collect(stream);
    stream.open();

    expect(threw).toBe(false); // never throws on a bad frame
    expect(got.map((e) => e.eventId)).toEqual([valid.eventId]); // only the valid one
  });
});
