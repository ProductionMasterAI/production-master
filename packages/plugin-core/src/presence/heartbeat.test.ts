import { describe, it, expect, vi } from "vitest";
import {
  PresenceHeartbeat,
  DEFAULT_PRESENCE_INTERVAL_MS,
  PRESENCE_TTL_MS,
} from "./heartbeat.js";
import type { PresenceSnapshot } from "../service/types.js";

/** Manual timer so tests drive beats deterministically (no real setInterval). */
function fakeTimer() {
  let fn: (() => void) | undefined;
  return {
    setInterval: (f: () => void, _ms: number) => {
      fn = f;
      return 1 as unknown;
    },
    clearInterval: vi.fn(),
    tick: () => fn?.(),
    ms: 0,
  };
}

function snapshot(entries: PresenceSnapshot["entries"] = []): PresenceSnapshot {
  return { investigationId: "inv_1", entries };
}

function fakeClient() {
  return {
    attachPresence: vi.fn(async () => snapshot([
      { identity: "u1", surface: "pmctl", attachedAt: "t" },
    ])),
    detachPresence: vi.fn(async () => snapshot([])),
  };
}

describe("PresenceHeartbeat", () => {
  it("default cadence stays safely under the 30s server TTL", () => {
    expect(DEFAULT_PRESENCE_INTERVAL_MS).toBeLessThan(PRESENCE_TTL_MS);
  });

  it("attaches immediately on start, then beats on the interval", async () => {
    const client = fakeClient();
    const timer = fakeTimer();
    const hb = new PresenceHeartbeat({
      client,
      investigationId: "inv_1",
      surface: "claude-code",
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });

    await hb.start();
    expect(client.attachPresence).toHaveBeenCalledTimes(1);
    expect(client.attachPresence).toHaveBeenCalledWith("inv_1", "claude-code");

    timer.tick();
    timer.tick();
    // beats run async inside the timer callback; flush microtasks.
    await Promise.resolve();
    expect(client.attachPresence).toHaveBeenCalledTimes(3);
  });

  it("stop() clears the timer and detaches once", async () => {
    const client = fakeClient();
    const timer = fakeTimer();
    const hb = new PresenceHeartbeat({
      client,
      investigationId: "inv_1",
      surface: "pmctl",
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });

    await hb.start();
    await hb.stop();
    expect(timer.clearInterval).toHaveBeenCalledTimes(1);
    expect(client.detachPresence).toHaveBeenCalledWith("inv_1", "pmctl");

    // Idempotent: a second stop does nothing more.
    await hb.stop();
    expect(client.detachPresence).toHaveBeenCalledTimes(1);
  });

  it("start() is idempotent while running", async () => {
    const client = fakeClient();
    const timer = fakeTimer();
    const hb = new PresenceHeartbeat({
      client,
      investigationId: "inv_1",
      surface: "pmctl",
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });
    await hb.start();
    await hb.start();
    expect(client.attachPresence).toHaveBeenCalledTimes(1);
  });

  it("a failed beat never throws into the caller; onError is notified", async () => {
    const boom = new Error("network");
    const client = {
      attachPresence: vi.fn(async () => {
        throw boom;
      }),
      detachPresence: vi.fn(async () => snapshot([])),
    };
    const timer = fakeTimer();
    const onError = vi.fn();
    const hb = new PresenceHeartbeat({
      client,
      investigationId: "inv_1",
      surface: "pmctl",
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
      onError,
    });

    await expect(hb.start()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
