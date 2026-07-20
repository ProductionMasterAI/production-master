import { describe, it, expect } from 'vitest';
import { EventStream } from './event-stream.js';
import { FixtureConnector } from './__fixtures__/fixture-connector.js';
import { loadRecordedEvents } from '../__fixtures__/load-events.js';
import type { InvestigationEventEnvelope } from '../types.js';

function collect(stream: EventStream): InvestigationEventEnvelope[] {
  const out: InvestigationEventEnvelope[] = [];
  stream.subscribe((e) => out.push(e));
  return out;
}

// Synchronous reconnect for deterministic tests.
const syncSchedule = (fn: () => void) => fn();

describe('EventStream', () => {
  it('delivers all frames in sequence order', () => {
    const frames = loadRecordedEvents();
    const connector = new FixtureConnector(frames);
    const stream = new EventStream({ url: 'sse://x', connector, scheduleReconnect: syncSchedule });
    const got = collect(stream);
    stream.open();
    expect(got.map((e) => e.sequence)).toEqual(frames.map((f) => f.sequence));
  });

  it('replays missed events with no gaps and no duplicates after a drop', () => {
    const frames = loadRecordedEvents();
    // Drop after the first 5 frames; the connector reconnects for the rest.
    const connector = new FixtureConnector(frames, 5);
    const stream = new EventStream({ url: 'sse://x', connector, scheduleReconnect: syncSchedule });
    const got = collect(stream);
    stream.open();

    // No gaps: every sequence 1..N exactly once.
    const seqs = got.map((e) => e.sequence);
    expect(seqs).toEqual(frames.map((f) => f.sequence));
    // No duplicates.
    expect(new Set(got.map((e) => e.eventId)).size).toBe(frames.length);
    // Reconnect sent Last-Event-ID of the last delivered frame before the drop.
    expect(connector.connectCalls[1]?.lastEventId).toBe(frames[4].eventId);
  });

  it('dedupes events with a repeated eventId', () => {
    const base = loadRecordedEvents();
    const dupes = [...base, base[3]]; // re-append one frame
    const connector = new FixtureConnector(dupes);
    const stream = new EventStream({ url: 'sse://x', connector, scheduleReconnect: syncSchedule });
    const got = collect(stream);
    stream.open();
    expect(got.length).toBe(base.length);
  });

  it('ignores malformed frames', () => {
    const connector: any = {
      connectCalls: [],
      connect(_opts: any, handlers: any) {
        handlers.onMessage('not json');
        handlers.onMessage(JSON.stringify({ eventId: 'ok', investigationId: 'i', type: 't', timestamp: 'x', sequence: 1, schemaVersion: 'v' }));
        return { close() {} };
      },
    };
    const stream = new EventStream({ url: 'sse://x', connector, scheduleReconnect: syncSchedule });
    const got = collect(stream);
    stream.open();
    expect(got.length).toBe(1);
  });

  it('stops reconnecting after maxReconnects', () => {
    const failing: any = {
      connect(_opts: any, handlers: any) {
        handlers.onClose();
        return { close() {} };
      },
    };
    let calls = 0;
    const stream = new EventStream({
      url: 'sse://x',
      connector: failing,
      maxReconnects: 2,
      scheduleReconnect: (fn) => {
        calls++;
        if (calls <= 5) fn();
      },
    });
    stream.open();
    // initial connect + 2 reconnects = 3 connection attempts -> 2 schedule calls honored
    expect(calls).toBeLessThanOrEqual(3);
  });
});
