/**
 * pmctl surface round-trip against the emulated, schema-real BFF (issue #119).
 *
 * Reuses the ONE shared emulator exported from
 * `@production-master/plugin-core/testing` — pmctl `Deps` is wired to the
 * emulator's transport (mirroring `make-deps.ts`) and a representative command
 * flow (`start` -> `status` -> `report`) is driven end-to-end. Asserts EXIT.OK
 * and that the parsed CLI output matches the emulator's schema-real data,
 * including the mutation body (`--title`) propagating into the run projection.
 */
import { describe, it, expect } from "vitest";
import {
  ServiceClient,
  DeviceCodeAuth,
  TokenStore,
  type Scope,
} from "@production-master/plugin-core";
import { EmulatedBff } from "@production-master/plugin-core/testing";
import type { Deps } from "../deps.js";
import type { ParsedArgs } from "../args.js";
import { FixtureConnector } from "../__fixtures__/fakes.js";
import { startCommand } from "./start.js";
import { statusCommand } from "./status.js";
import { reportCommand } from "./report.js";
import { EXIT } from "../exit-codes.js";

const SCOPES: Scope[] = [
  "read-investigation",
  "write-investigation",
  "approve-action",
];

function args(
  positional: string[],
  flags: Record<string, string | boolean> = {},
): ParsedArgs {
  return { _: positional, flags };
}

/** Mirror of make-deps.ts, wired to the emulated BFF's transport. */
function makeEmulatedDeps(emu: EmulatedBff): { deps: Deps; out: string[] } {
  const out: string[] = [];
  const client = new ServiceClient({
    transport: emu.transport,
    getAuthToken: () => "tok",
    newIdempotencyKey: () => "KEY-1",
  });
  const deps: Deps = {
    client,
    output: "json",
    write: (s) => out.push(s),
    writeErr: () => {},
    connector: new FixtureConnector([]),
    streamUrlFor: (id) => `https://svc.test/v1/runs/${id}/stream`,
    streamHeaders: () => ({ Authorization: "Bearer tok" }),
    scheduleReconnect: (fn) => fn(),
    deviceAuth: new DeviceCodeAuth({
      transport: emu.transport,
      clientId: "pmctl",
      scopes: SCOPES,
    }),
    tokenStore: new TokenStore({ issuer: "test" }),
    accountId: "default",
  };
  return { deps, out };
}

describe("pmctl <-> emulated schema-real BFF", () => {
  it("runs start -> status -> report against the emulator and matches its data", async () => {
    const emu = new EmulatedBff();
    const { deps, out } = makeEmulatedDeps(emu);

    // start: POST /v1/runs -> prints the id + investigation:// uri.
    expect(await startCommand(deps, args(["ACME-1"], { title: "Boom" }))).toBe(
      EXIT.OK,
    );
    const startEnv = JSON.parse(out.join("").trim());
    expect(startEnv.ok).toBe(true);
    expect(startEnv.data.investigationId).toBe(emu.investigationId);
    expect(startEnv.data.uri).toBe(`investigation://${emu.investigationId}`);

    // status: GET /v1/runs/{id} -> the schema-real detail projection, including
    // the title propagated from the start mutation body.
    out.length = 0;
    expect(await statusCommand(deps, args([emu.investigationId]))).toBe(
      EXIT.OK,
    );
    const statusEnv = JSON.parse(out.join("").trim());
    expect(statusEnv.data).toMatchObject({
      investigationId: emu.investigationId,
      status: "completed",
      title: "Boom",
      costUsd: emu.run.costUsd,
    });

    // report: GET /v1/runs/{id}/report -> the rendered ReportResponse.
    out.length = 0;
    expect(
      await reportCommand(deps, args([emu.investigationId], { format: "md" })),
    ).toBe(EXIT.OK);
    const reportEnv = JSON.parse(out.join("").trim());
    expect(reportEnv.data.content).toContain("# Root cause");
    expect(reportEnv.data.format).toBe("md");
  });
});
