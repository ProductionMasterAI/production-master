import { describe, it, expect } from "vitest";
import { ServiceClient } from "./client.js";
import { FakeTransport } from "./__fixtures__/fake-transport.js";
import { IdempotencyConflict, ServiceError, type Run } from "./types.js";

const run: Run = {
  investigationId: "inv_1",
  status: "created",
  createdAt: "2026-06-12T10:00:00Z",
  costUsd: 0,
};

function client(transport: FakeTransport, token = "tok") {
  let n = 0;
  return new ServiceClient({
    transport,
    getAuthToken: () => token,
    newIdempotencyKey: () => `key-${++n}`,
  });
}

describe("ServiceClient", () => {
  it("createRun sends Idempotency-Key + bearer and returns the run", async () => {
    const t = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 201,
      body: run,
    }));
    const c = client(t);
    const got = await c.createRun({ ticket: "INC-1" });
    expect(got).toEqual(run);
    const req = t.received[0];
    expect(req.headers?.["Idempotency-Key"]).toBe("key-1");
    expect(req.headers?.["Authorization"]).toBe("Bearer tok");
  });

  it("maps 409 to a typed IdempotencyConflict", async () => {
    const t = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 409,
      body: { message: "dup" },
    }));
    const c = client(t);
    await expect(c.createRun({ ticket: "INC-1" })).rejects.toBeInstanceOf(
      IdempotencyConflict,
    );
  });

  it("translates 403 to NOT_FOUND (no-enumeration rule)", async () => {
    const t = new FakeTransport().on("GET", "/v1/runs/inv_x", () => ({
      status: 403,
      body: {},
    }));
    const c = client(t);
    await expect(c.getRun("inv_x")).rejects.toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("surfaces 404 as NOT_FOUND", async () => {
    const t = new FakeTransport().on("GET", "/v1/runs/missing", () => ({
      status: 404,
      body: {},
    }));
    const c = client(t);
    await expect(c.getRun("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps 402 to BUDGET_EXHAUSTED", async () => {
    const t = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 402,
      body: {},
    }));
    const c = client(t);
    await expect(c.createRun({ ticket: "INC-1" })).rejects.toMatchObject({
      code: "BUDGET_EXHAUSTED",
    });
  });

  it("listRuns honors pagination cursor in the query", async () => {
    const t = new FakeTransport().on("GET", "/v1/runs", () => ({
      status: 200,
      body: { runs: [run], nextCursor: "c2" },
    }));
    const c = client(t);
    const page = await c.listRuns({ cursor: "c1", limit: 1 });
    expect(page.nextCursor).toBe("c2");
    expect(t.received[0].query).toMatchObject({ cursor: "c1", limit: 1 });
  });

  it("each mutation gets a fresh idempotency key", async () => {
    const t = new FakeTransport()
      .on("POST", "/v1/runs", () => ({ status: 201, body: run }))
      .on("POST", "/v1/actions", () => ({
        status: 201,
        body: { actionId: "a", status: "proposed" },
      }));
    const c = client(t);
    await c.createRun({ ticket: "INC-1" });
    await c.proposeAction({
      runId: "inv_1",
      type: "k",
      payload: {},
      proposedBy: "user_1",
      requiresApproval: true,
    });
    expect(t.received[0].headers?.["Idempotency-Key"]).toBe("key-1");
    expect(t.received[1].headers?.["Idempotency-Key"]).toBe("key-2");
    // proposeSchema requires the body key to equal the header key.
    expect(
      (t.received[1].body as { idempotencyKey?: string }).idempotencyKey,
    ).toBe("key-2");
  });

  it("getEventSlice computes lastSeq from returned events", async () => {
    const t = new FakeTransport().on("GET", "/v1/runs/inv_1/events", () => ({
      status: 200,
      body: {
        events: [
          {
            eventId: "e3",
            investigationId: "inv_1",
            type: "x",
            timestamp: "t",
            sequence: 3,
            schemaVersion: "investigation.events.v1",
          },
        ],
      },
    }));
    const c = client(t);
    const slice = await c.getEventSlice("inv_1", 2);
    expect(slice.lastSeq).toBe(3);
    expect(t.received[0].query).toMatchObject({ sinceSeq: 2 });
  });

  it("unknown errors carry the http status", async () => {
    const t = new FakeTransport().on("GET", "/v1/runs/x", () => ({
      status: 500,
      body: { message: "boom" },
    }));
    const c = client(t);
    await expect(c.getRun("x")).rejects.toBeInstanceOf(ServiceError);
  });

  describe("presence", () => {
    const snapshot = {
      investigationId: "inv_1",
      entries: [
        { identity: "u1", surface: "pmctl", attachedAt: "2026-06-12T10:00:00Z" },
      ],
    };

    it("attachPresence POSTs surface to the investigations path (no idempotency key)", async () => {
      const t = new FakeTransport().on(
        "POST",
        "/v1/investigations/inv_1/presence",
        () => ({ status: 200, body: snapshot }),
      );
      const c = client(t);
      const got = await c.attachPresence("inv_1", "claude-code");
      expect(got).toEqual(snapshot);
      const req = t.received[0];
      expect(req.body).toEqual({ surface: "claude-code" });
      expect(req.headers?.["Authorization"]).toBe("Bearer tok");
      // Presence is a live signal — a heartbeat must be replayable, so it
      // never carries an Idempotency-Key.
      expect(req.headers?.["Idempotency-Key"]).toBeUndefined();
    });

    it("getPresence GETs the snapshot", async () => {
      const t = new FakeTransport().on(
        "GET",
        "/v1/investigations/inv_1/presence",
        () => ({ status: 200, body: snapshot }),
      );
      const c = client(t);
      expect(await c.getPresence("inv_1")).toEqual(snapshot);
    });

    it("detachPresence DELETEs with the surface", async () => {
      const t = new FakeTransport().on(
        "DELETE",
        "/v1/investigations/inv_1/presence",
        () => ({ status: 200, body: { investigationId: "inv_1", entries: [] } }),
      );
      const c = client(t);
      const got = await c.detachPresence("inv_1", "pmctl");
      expect(got.entries).toEqual([]);
      expect(t.received[0].method).toBe("DELETE");
      expect(t.received[0].body).toEqual({ surface: "pmctl" });
    });

    it("a hidden/absent investigation 404s (no-enumeration rule)", async () => {
      const t = new FakeTransport().on(
        "POST",
        "/v1/investigations/inv_hidden/presence",
        () => ({ status: 403, body: {} }),
      );
      const c = client(t);
      await expect(c.attachPresence("inv_hidden", "pmctl")).rejects.toMatchObject(
        { code: "NOT_FOUND", httpStatus: 404 },
      );
    });
  });
});
