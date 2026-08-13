import { describe, it, expect } from "vitest";
import { FakeTransport, FixtureConnector, evt } from "../__fixtures__/fakes.js";
import { makeDeps } from "../__fixtures__/make-deps.js";
import { eventsCommand } from "./events.js";
import { EXIT } from "../exit-codes.js";
import type { ParsedArgs } from "../args.js";

function args(
  positional: string[],
  flags: Record<string, string | boolean> = {},
): ParsedArgs {
  return { _: positional, flags };
}

/** Pull the leading [seq] numbers from table-mode stdout. */
function sequences(stdout: string): number[] {
  return stdout
    .split("\n")
    .map((l) => /^\[(\d+)\]/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
}

describe("events --follow", () => {
  it("snapshot (no --follow) prints the replay slice and returns", async () => {
    const transport = new FakeTransport().on(
      "GET",
      "/v1/runs/inv_1/events",
      () => ({
        status: 200,
        body: {
          events: [evt(1, "investigation.started"), evt(2, "agent.evidence")],
        },
      }),
    );
    const { deps, cap } = makeDeps({ transport });
    expect(await eventsCommand(deps, args(["inv_1"]))).toBe(EXIT.OK);
    expect(sequences(cap.stdout())).toEqual([1, 2]);
  });

  it("streams to a terminal event and resolves OK", async () => {
    const connector = new FixtureConnector([
      evt(1, "investigation.started"),
      evt(2, "investigation.completed"),
    ]);
    const { deps, cap } = makeDeps({
      transport: new FakeTransport(),
      connector,
    });
    expect(await eventsCommand(deps, args(["inv_1"], { follow: true }))).toBe(
      EXIT.OK,
    );
    expect(sequences(cap.stdout())).toEqual([1, 2]);
    expect(connector.connectCalls).toHaveLength(1);
  });

  it("reconnects after a mid-stream drop without gaps (Last-Event-ID)", async () => {
    const connector = new FixtureConnector(
      [
        evt(1, "investigation.started"),
        evt(2, "agent.evidence"),
        evt(3, "investigation.completed"),
      ],
      { dropAfter: 2 },
    );
    const { deps, cap } = makeDeps({
      transport: new FakeTransport(),
      connector,
    });
    expect(await eventsCommand(deps, args(["inv_1"], { follow: true }))).toBe(
      EXIT.OK,
    );
    expect(sequences(cap.stdout())).toEqual([1, 2, 3]);
    // Second connect resumes from the last delivered event id.
    expect(connector.connectCalls).toHaveLength(2);
    expect(connector.connectCalls[1].lastEventId).toBe("evt_2");
  });

  it("--since-seq seeds the cursor so the live connect resumes via Last-Event-ID", async () => {
    // Durable slice after seq 2 = events 3,4 (non-terminal).
    const transport = new FakeTransport().on(
      "GET",
      "/v1/runs/inv_1/events",
      () => ({
        status: 200,
        body: { events: [evt(3, "agent.a"), evt(4, "agent.b")] },
      }),
    );
    // Live stream holds the full log; the connect should skip 1..4 and emit 5.
    const connector = new FixtureConnector([
      evt(1, "investigation.started"),
      evt(2, "agent.x"),
      evt(3, "agent.a"),
      evt(4, "agent.b"),
      evt(5, "investigation.completed"),
    ]);
    const { deps, cap } = makeDeps({ transport, connector });
    expect(
      await eventsCommand(
        deps,
        args(["inv_1"], { follow: true, "since-seq": "2" }),
      ),
    ).toBe(EXIT.OK);
    // Replay 3,4 then live 5 — gap-free from the cursor, no re-emit of 1,2.
    expect(sequences(cap.stdout())).toEqual([3, 4, 5]);
    expect(connector.connectCalls[0].lastEventId).toBe("evt_4");
  });

  it("rejects a negative --since-seq", async () => {
    const { deps } = makeDeps({ transport: new FakeTransport() });
    await expect(
      eventsCommand(deps, args(["inv_1"], { follow: true, "since-seq": "-1" })),
    ).rejects.toThrow(/since-seq/);
  });
});
