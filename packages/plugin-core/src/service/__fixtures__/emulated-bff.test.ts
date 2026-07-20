/**
 * plugin-core surface round-trip against the emulated, schema-real BFF, plus the
 * emulator's schema-real self-check (issue #119 / substance behind #439).
 *
 * The round-trip drives the real `ServiceClient` through
 * createRun -> getRun -> getReport -> getEventSlice and asserts the PARSED
 * results equal the emulator's schema-real data. The self-check asserts the
 * emulator can only ever serve routes that are in the OpenAPI-derived surface
 * (`extractRoutes(edge-api-v1.yaml)`) ∪ the documented cross-service allowlist —
 * so the emulator can't drift from what pm-service actually serves.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ServiceClient } from "../client.js";
import { extractRoutes } from "../openapi-routes.js";
import { EmulatedBff, EMULATOR_CROSS_SERVICE_ROUTES } from "./emulated-bff.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDORED_SPEC = resolve(HERE, "./edge-api-v1.yaml");

function client(emu: EmulatedBff): ServiceClient {
  let n = 0;
  return new ServiceClient({
    transport: emu.transport,
    getAuthToken: () => "tok",
    newIdempotencyKey: () => `key-${++n}`,
  });
}

describe("ServiceClient <-> emulated schema-real BFF", () => {
  it("round-trips createRun -> getRun -> getReport -> getEventSlice against schema-real bodies", async () => {
    const emu = new EmulatedBff();
    const c = client(emu);

    // createRun: POST /v1/runs -> 202 { investigationId }
    const created = await c.createRun({ ticket: "INC-1", title: "Boom" });
    expect(created.investigationId).toBe(emu.investigationId);
    // The mutation body reached the emulator and mutated its run projection.
    expect(emu.run.title).toBe("Boom");

    // getRun: the full detail projection matches the emulator's schema-real run.
    const got = await c.getRun(emu.investigationId);
    expect(got).toEqual(emu.run);
    expect(got.status).toBe("completed");
    expect(got.costUsd).toBe(0.42);

    // getReport: rendered ReportResponse matches.
    const report = await c.getReport(emu.investigationId, "md");
    expect(report).toEqual(emu.report);
    expect(report.content).toContain("# Root cause");

    // getEventSlice: parses the { events: [...] } page and folds lastSeq.
    const slice = await c.getEventSlice(emu.investigationId, 0);
    expect(slice.events).toEqual(emu.events);
    expect(slice.lastSeq).toBe(emu.events[emu.events.length - 1].sequence);
  });

  it("serves the action lifecycle with schema-real ActionRef bodies", async () => {
    const emu = new EmulatedBff();
    const c = client(emu);

    const proposed = await c.proposeAction({
      runId: emu.investigationId,
      type: "rerun_from_phase",
      proposedBy: "u1",
      requiresApproval: true,
    });
    expect(proposed).toEqual({ actionId: emu.actionId, status: "proposed" });

    const approved = await c.approveAction(emu.actionId, "approver");
    expect(approved.status).toBe("approved");

    const rejected = await c.rejectAction(emu.actionId, "rejector", "unsafe");
    expect(rejected.status).toBe("rejected");
  });

  it("self-check: every route the emulator serves is in the OpenAPI surface ∪ the cross-service allowlist", () => {
    const openapiRoutes = extractRoutes(readFileSync(VENDORED_SPEC, "utf8"));
    const allowed = new Set([...openapiRoutes, ...EMULATOR_CROSS_SERVICE_ROUTES]);

    const emu = new EmulatedBff();
    const registered = [...emu.registeredTemplates()];
    const drift = registered.filter((t) => !allowed.has(t));
    expect(
      drift,
      `emulator serves routes pm-service does not:\n${drift.join("\n")}`,
    ).toEqual([]);

    // Sanity: the emulator really does serve the core round-trip routes.
    expect(registered).toContain("POST /v1/runs");
    expect(registered).toContain("GET /v1/runs/{id}");
    expect(registered).toContain("GET /v1/runs/{id}/events");
  });

  it("keeps the cross-service allowlist minimal — every entry is actually served", () => {
    const emu = new EmulatedBff();
    const registered = emu.registeredTemplates();
    const dead = [...EMULATOR_CROSS_SERVICE_ROUTES].filter(
      (r) => !registered.has(r),
    );
    expect(dead, `unused allowlist entries:\n${dead.join("\n")}`).toEqual([]);
  });
});
