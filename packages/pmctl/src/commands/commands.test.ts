import { describe, it, expect } from "vitest";
import { DeviceCodeAuth, type Scope } from "@production-master/plugin-core";
import { FakeTransport } from "../__fixtures__/fakes.js";
import { makeDeps } from "../__fixtures__/make-deps.js";
import { startCommand } from "./start.js";
import { statusCommand } from "./status.js";
import { reportCommand } from "./report.js";
import { approveCommand } from "./approve.js";
import { rejectCommand } from "./reject.js";
import { loginCommand } from "./login.js";
import { EXIT } from "../exit-codes.js";
import type { ParsedArgs } from "../args.js";

function args(
  positional: string[],
  flags: Record<string, string | boolean> = {},
): ParsedArgs {
  return { _: positional, flags };
}

describe("start", () => {
  it("creates a run and prints the id + investigation uri (json)", async () => {
    const transport = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 201,
      body: {
        investigationId: "inv_42",
        status: "created",
        createdAt: "t",
        costUsd: 0,
      },
    }));
    const { deps, cap } = makeDeps({ transport, output: "json" });
    const code = await startCommand(deps, args(["ACME-1"], { title: "Boom" }));
    expect(code).toBe(EXIT.OK);
    const env = JSON.parse(cap.stdout().trim());
    expect(env.ok).toBe(true);
    expect(env.data.investigationId).toBe("inv_42");
    expect(env.data.uri).toBe("investigation://inv_42");
    // title flag is forwarded to the BFF body
    expect(transport.received[0].body).toMatchObject({
      ticket: "ACME-1",
      title: "Boom",
    });
  });

  it("rejects a missing ticket with a usage error", async () => {
    const { deps } = makeDeps({ transport: new FakeTransport() });
    await expect(startCommand(deps, args([]))).rejects.toThrow(/ticket/);
  });

  it("forwards --mode and budget caps to the BFF body", async () => {
    const transport = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 201,
      body: {
        investigationId: "inv_9",
        status: "created",
        createdAt: "t",
        costUsd: 0,
      },
    }));
    const { deps } = makeDeps({ transport, output: "json" });
    const code = await startCommand(
      deps,
      args(["ACME-9"], {
        mode: "deep",
        "max-usd": "5",
        "max-iterations": "8",
      }),
    );
    expect(code).toBe(EXIT.OK);
    expect(transport.received[0].body).toMatchObject({
      ticket: "ACME-9",
      mode: "deep",
      budget: { maxUsd: 5, maxIterations: 8 },
    });
  });

  it("omits mode and budget when no flags are given", async () => {
    const transport = new FakeTransport().on("POST", "/v1/runs", () => ({
      status: 201,
      body: {
        investigationId: "inv_10",
        status: "created",
        createdAt: "t",
        costUsd: 0,
      },
    }));
    const { deps } = makeDeps({ transport, output: "json" });
    await startCommand(deps, args(["ACME-10"]));
    const body = transport.received[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("mode");
    expect(body).not.toHaveProperty("budget");
  });

  it("rejects an invalid --mode", async () => {
    const { deps } = makeDeps({ transport: new FakeTransport() });
    await expect(
      startCommand(deps, args(["ACME-1"], { mode: "turbo" })),
    ).rejects.toThrow(/mode/);
  });
});

describe("idempotency", () => {
  it("repeats with the same key return the original run", async () => {
    const byKey = new Map<string, unknown>();
    let seq = 0;
    const transport = new FakeTransport().on("POST", "/v1/runs", (req) => {
      const key = req.headers?.["Idempotency-Key"];
      if (key && byKey.has(key)) return { status: 200, body: byKey.get(key) };
      const run = {
        investigationId: `inv_${++seq}`,
        status: "created",
        createdAt: "t",
        costUsd: 0,
      };
      if (key) byKey.set(key, run);
      return { status: 201, body: run };
    });
    const mk = () =>
      makeDeps({ transport, output: "json", idempotencyKey: "KEY-1" });

    const a = mk();
    await startCommand(a.deps, args(["ACME-1"]));
    const b = mk();
    await startCommand(b.deps, args(["ACME-1"]));

    expect(JSON.parse(a.cap.stdout().trim()).data.investigationId).toBe(
      "inv_1",
    );
    expect(JSON.parse(b.cap.stdout().trim()).data.investigationId).toBe(
      "inv_1",
    );
  });
});

describe("status", () => {
  it("fetches a run", async () => {
    const transport = new FakeTransport().on("GET", "/v1/runs/inv_7", () => ({
      status: 200,
      body: {
        investigationId: "inv_7",
        status: "running",
        createdAt: "t",
        costUsd: 1.5,
      },
    }));
    const { deps, cap } = makeDeps({ transport, output: "json" });
    expect(await statusCommand(deps, args(["inv_7"]))).toBe(EXIT.OK);
    expect(JSON.parse(cap.stdout().trim()).data.status).toBe("running");
  });
});

describe("report", () => {
  it("prints report content verbatim and requests the format", async () => {
    const transport = new FakeTransport().on(
      "GET",
      "/v1/runs/inv_1/report",
      () => ({
        status: 200,
        body: {
          investigationId: "inv_1",
          format: "md",
          content: "# Root cause\nboom",
        },
      }),
    );
    const { deps, cap } = makeDeps({ transport, output: "md" });
    expect(await reportCommand(deps, args(["inv_1"], { format: "md" }))).toBe(
      EXIT.OK,
    );
    expect(cap.stdout()).toContain("# Root cause");
    expect(transport.received[0].query?.format).toBe("md");
  });

  it("rejects an invalid format", async () => {
    const { deps } = makeDeps({ transport: new FakeTransport() });
    await expect(
      reportCommand(deps, args(["inv_1"], { format: "pdf" })),
    ).rejects.toThrow(/format/);
  });
});

describe("approve / reject", () => {
  it("approve posts to the flat /approve path with an approverId", async () => {
    const transport = new FakeTransport().on(
      "POST",
      "/v1/actions/act_1/approve",
      () => ({
        status: 200,
        body: { actionId: "act_1", status: "approved" },
      }),
    );
    const { deps, cap } = makeDeps({ transport, output: "json" });
    expect(await approveCommand(deps, args(["inv_1", "act_1"]))).toBe(EXIT.OK);
    expect(JSON.parse(cap.stdout().trim()).data.status).toBe("approved");
    expect(transport.received[0].body).toMatchObject({ approverId: "default" });
  });

  it("reject posts to the flat /reject path and carries rejectorId + reason", async () => {
    const transport = new FakeTransport().on(
      "POST",
      "/v1/actions/act_1/reject",
      () => ({
        status: 200,
        body: { actionId: "act_1", status: "rejected" },
      }),
    );
    const { deps, cap } = makeDeps({ transport, output: "json" });
    expect(
      await rejectCommand(deps, args(["inv_1", "act_1"], { reason: "unsafe" })),
    ).toBe(EXIT.OK);
    expect(JSON.parse(cap.stdout().trim()).data.status).toBe("rejected");
    expect(transport.received[0].body).toMatchObject({
      rejectorId: "default",
      reason: "unsafe",
    });
  });

  it("approve requires both ids", async () => {
    const { deps } = makeDeps({ transport: new FakeTransport() });
    await expect(approveCommand(deps, args(["inv_1"]))).rejects.toThrow(
      /action id/,
    );
  });

  it("approve --grant mints a capability token after approving", async () => {
    const transport = new FakeTransport()
      .on("POST", "/v1/actions/act_1/approve", () => ({
        status: 200,
        body: { actionId: "act_1", status: "approved" },
      }))
      .on("POST", "/v1/trust-grants", () => ({
        status: 201,
        body: {
          grant: {
            id: "grant_9",
            investigationId: "inv_1",
            riskClass: "high",
            reversibility: "compensable",
            grantedBy: "default",
            grantedAt: "t0",
            expiresAt: "t1",
            revokedAt: null,
            sessionLabel: null,
          },
        },
      }));
    const { deps, cap } = makeDeps({ transport, output: "json" });
    const code = await approveCommand(
      deps,
      args(["inv_1", "act_1"], {
        grant: true,
        risk: "high",
        reversibility: "compensable",
        "ttl-minutes": "60",
      }),
    );
    expect(code).toBe(EXIT.OK);
    const env = JSON.parse(cap.stdout().trim());
    expect(env.data.action.status).toBe("approved");
    expect(env.data.grant.id).toBe("grant_9");
    // Both calls fired, in order: approve then mint.
    expect(transport.received.map((r) => r.path)).toEqual([
      "/v1/actions/act_1/approve",
      "/v1/trust-grants",
    ]);
    expect(transport.received[1].body).toMatchObject({
      investigationId: "inv_1",
      riskClass: "high",
      reversibility: "compensable",
      grantedBy: "default",
      ttlMinutes: 60,
    });
  });

  it("approve --grant rejects an unknown risk class before any call", async () => {
    const transport = new FakeTransport();
    const { deps } = makeDeps({ transport });
    await expect(
      approveCommand(
        deps,
        args(["inv_1", "act_1"], {
          grant: true,
          risk: "nope",
          reversibility: "reversible",
          "ttl-minutes": "60",
        }),
      ),
    ).rejects.toThrow(/--risk/);
    expect(transport.received).toHaveLength(0);
  });

  it("approve --grant rejects a ttl beyond the 24h cap", async () => {
    const transport = new FakeTransport();
    const { deps } = makeDeps({ transport });
    await expect(
      approveCommand(
        deps,
        args(["inv_1", "act_1"], {
          grant: true,
          risk: "low",
          reversibility: "reversible",
          "ttl-minutes": "5000",
        }),
      ),
    ).rejects.toThrow(/ttl-minutes/);
    expect(transport.received).toHaveLength(0);
  });
});

describe("login", () => {
  it("completes the device flow, stores a token, and never prints it", async () => {
    const SECRET = "SECRET-ACCESS-TOKEN-zzz";
    const transport = new FakeTransport()
      .on("POST", "/v1/oauth/device", () => ({
        status: 200,
        body: {
          deviceCode: "dc",
          userCode: "WXYZ-1234",
          verificationUri: "https://pm.test/device",
          verificationUriComplete: "https://pm.test/device?code=WXYZ-1234",
          interval: 1,
          expiresIn: 600,
        },
      }))
      .on("POST", "/v1/oauth/token", () => ({
        status: 200,
        body: {
          accessToken: SECRET,
          refreshToken: "rt",
          expiresAt: Date.now() + 3_600_000,
          scopes: ["read-investigation"] as Scope[],
        },
      }));
    const { deps, cap } = makeDeps({ transport, output: "json" });
    // Replace deviceAuth with a no-op-sleep variant so the poll loop is instant.
    deps.deviceAuth = new DeviceCodeAuth({
      transport,
      clientId: "pmctl",
      scopes: ["read-investigation"] as Scope[],
      sleep: async () => {},
    });

    expect(await loginCommand(deps, args([]))).toBe(EXIT.OK);

    const stored = await deps.tokenStore.load("default");
    expect(stored?.accessToken).toBe(SECRET);
    // Token material must never appear on stdout or stderr.
    expect(cap.stdout()).not.toContain(SECRET);
    expect(cap.stderr()).not.toContain(SECRET);
    // The user code IS surfaced (headless-friendly).
    expect(cap.stderr()).toContain("WXYZ-1234");
  });
});
