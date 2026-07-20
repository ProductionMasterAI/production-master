/**
 * Unit + integration tests for createPluginRuntime — the thin-client
 * composition root. Drives the WIRED runtime (real ServiceClient / session
 * manager / runner / device-code auth) against an in-memory HTTP transport +
 * fixture SSE/MCP transports, proving the full path an adapter gets for free:
 * device login → POST /v1/runs → SSE stream folded to terminal render, plus
 * connect (replay) and update (preview-gated mutation).
 *
 * NO network, NO LLM/provider SDK.
 */
import { describe, it, expect } from "vitest";
import { createPluginRuntime } from "./create-plugin-runtime.js";
import {
  FixtureSseConnector,
  FixtureMcpTransport,
  RECORDED_EVENTS,
} from "../testing/fixtures.js";
import { NoopHostAdapter } from "../host/__fixtures__/noop-host-adapter.js";
import { InMemorySecretBackend, TokenStore } from "../auth/token-store.js";
import { ToolError } from "../mcp/types.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../service/types.js";
import type { TokenResponse } from "../auth/types.js";

const INV = "inv_demo";

/** Stateful in-memory service: oauth device+token, runs, mcp session, events. */
class FakeService implements HttpTransport {
  readonly received: HttpRequest[] = [];
  now = 1_000_000;
  /** Access-token TTL handed out by the token endpoint (ms from `now`). */
  accessTtlMs = 3_600_000;
  tokenGrants = 0;

  async request(opts: HttpRequest): Promise<HttpResponse> {
    this.received.push(opts);
    const key = `${opts.method} ${opts.path}`;
    switch (key) {
      case "POST /v1/oauth/device":
        return {
          status: 200,
          body: {
            deviceCode: "dev-code",
            userCode: "WXYZ-1234",
            verificationUri: "https://pm.example/device",
            verificationUriComplete: "https://pm.example/device?code=WXYZ-1234",
            interval: 0,
            expiresIn: 900,
          },
        };
      case "POST /v1/oauth/token": {
        this.tokenGrants += 1;
        const tokens: TokenResponse = {
          accessToken: `access-${this.tokenGrants}`,
          refreshToken: `refresh-${this.tokenGrants}`,
          expiresAt: this.now + this.accessTtlMs,
          scopes: ["read-investigation", "write-investigation", "approve-action"],
        };
        return { status: 200, body: tokens };
      }
      case "POST /v1/runs":
        return { status: 202, body: { investigationId: INV } };
      case "POST /v1/mcp/sessions":
        return {
          status: 201,
          body: {
            endpoint: `https://mcp.pm/${INV}`,
            audience: "pm-mcp",
            sessionJwt: `sjwt-${INV}`,
            ttlSeconds: 300,
          },
        };
      case `GET /v1/runs/${INV}/events`:
        return { status: 200, body: { events: RECORDED_EVENTS } };
      default:
        return { status: 404, body: { message: `no route: ${key}` } };
    }
  }
}

function newRuntime(
  service: FakeService,
  host: NoopHostAdapter,
  extraDeps: Record<string, unknown> = {},
) {
  const tokenStore = new TokenStore({
    backend: new InMemorySecretBackend(),
    issuer: "test",
    now: () => service.now,
  });
  return createPluginRuntime({
    host,
    config: { serviceUrl: "https://svc.pm", surface: "test-surface" },
    deps: {
      transport: service,
      sseConnector: new FixtureSseConnector(),
      tokenStore,
      now: () => service.now,
      sleep: async () => {},
      newIdempotencyKey: () => "idem-k",
      ...extraDeps,
    },
  });
}

describe("createPluginRuntime", () => {
  it("throws when no serviceUrl is configured or in the env", () => {
    const saved = process.env.PM_SERVICE_URL;
    delete process.env.PM_SERVICE_URL;
    try {
      expect(() =>
        createPluginRuntime({ host: new NoopHostAdapter() }),
      ).toThrow(/serviceUrl is required/);
    } finally {
      if (saved !== undefined) process.env.PM_SERVICE_URL = saved;
    }
  });

  it("login() runs the device-code grant, opens the URL, and persists tokens", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter();
    const runtime = newRuntime(service, host);

    const result = await runtime.login();

    expect(result.accountId).toBe("default");
    expect(result.scopes).toContain("write-investigation");
    // The verification URL was opened via the host sink.
    const opened = host.calls.find((c) => c.method === "openExternalUrl");
    expect(opened?.arg).toBe("https://pm.example/device?code=WXYZ-1234");
    // A device-start + a token grant reached the service.
    expect(service.received.some((r) => r.path === "/v1/oauth/device")).toBe(true);
    expect(service.tokenGrants).toBe(1);
  });

  it("investigate() creates a hosted run and streams it to a terminal render", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter();
    const runtime = newRuntime(service, host);
    await runtime.login();

    const run = await runtime.investigate({ ticket: "INC-1" });

    expect(run.status).toBe("completed");
    expect(run.investigationId).toBe(INV);
    // POST /v1/runs actually reached the service (not a pure projection).
    expect(service.received.some((r) => r.method === "POST" && r.path === "/v1/runs")).toBe(true);
    // The host rendered the folded stream, ending in a completed panel.
    const last = host.renderedViews[host.renderedViews.length - 1];
    expect(last.runSummary.status).toBe("completed");
    // Default presence surface was attached (from config.surface).
    // (Presence is best-effort; no route served here, so it must not throw.)
  });

  it("investigate() refuses to run before login()", async () => {
    const service = new FakeService();
    const runtime = newRuntime(service, new NoopHostAdapter());
    await expect(runtime.investigate({ ticket: "INC-1" })).rejects.toThrow(
      /not authenticated/,
    );
  });

  it("hydrates tokens from the store on first use (login persisted them)", async () => {
    const service = new FakeService();
    const backend = new InMemorySecretBackend();
    const store = new TokenStore({ backend, issuer: "test", now: () => service.now });
    // Pre-seed a stored session as if a prior login persisted it.
    await store.save("default", {
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      expiresAt: service.now + 3_600_000,
      scopes: ["read-investigation", "write-investigation", "approve-action"],
    });
    const host = new NoopHostAdapter();
    const runtime = newRuntime(service, host, { tokenStore: store });

    // No login() call — the runtime must load the stored token itself.
    const run = await runtime.investigate({ ticket: "INC-1" });
    expect(run.status).toBe("completed");
    // No fresh token grant was needed (token was still valid).
    expect(service.tokenGrants).toBe(0);
    // The stored access token was used as the SSE/REST bearer.
    const runReq = service.received.find((r) => r.path === "/v1/runs");
    expect(runReq?.headers?.["Authorization"]).toBe("Bearer stored-access");
  });

  it("refreshes an access token that is within the refresh skew", async () => {
    const service = new FakeService();
    const backend = new InMemorySecretBackend();
    const store = new TokenStore({ backend, issuer: "test", now: () => service.now });
    // Stored token already inside the 5-min refresh skew.
    await store.save("default", {
      accessToken: "stale-access",
      refreshToken: "stale-refresh",
      expiresAt: service.now + 60_000, // 1 min left
      scopes: ["read-investigation", "write-investigation", "approve-action"],
    });
    const runtime = newRuntime(service, new NoopHostAdapter(), { tokenStore: store });

    await runtime.investigate({ ticket: "INC-1" });
    // A refresh grant was issued and the new token used.
    expect(service.tokenGrants).toBe(1);
    const runReq = service.received.find((r) => r.path === "/v1/runs");
    expect(runReq?.headers?.["Authorization"]).toBe("Bearer access-1");
  });

  it("connect() mints a session, replays the durable slice, and streams", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter();
    const runtime = newRuntime(service, host);
    await runtime.login();

    const run = await runtime.connect(INV);

    expect(run.status).toBe("completed");
    // Session minted + durable event slice fetched for replay.
    expect(service.received.some((r) => r.path === "/v1/mcp/sessions")).toBe(true);
    expect(service.received.some((r) => r.path === `/v1/runs/${INV}/events`)).toBe(true);
    // The scoped MCP server was registered with the host.
    expect(host.calls.some((c) => c.method === "registerMcpServer")).toBe(true);
  });

  it("update() blocks a rejected mutation before it reaches the service", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter("reject");
    const mcp = new FixtureMcpTransport();
    const runtime = newRuntime(service, host, { mcpToolTransport: mcp });
    await runtime.login();

    await expect(
      runtime.update(INV, "investigation.add_evidence", { note: "retry storm" }),
    ).rejects.toBeInstanceOf(ToolError);
    // Nothing reached the MCP transport.
    expect(mcp.calls).toEqual([]);
  });

  it("update() lets an approved mutation reach the MCP transport", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter("approve");
    const mcp = new FixtureMcpTransport();
    const runtime = newRuntime(service, host, { mcpToolTransport: mcp });
    await runtime.login();

    const res = await runtime.update(INV, "investigation.add_evidence", {
      note: "retry storm",
    });
    expect(res).toEqual({ ok: true });
    expect(mcp.calls.map((c) => c.tool)).toEqual(["investigation.add_evidence"]);
  });

  it("update() reuses the active session across calls (mints once)", async () => {
    const service = new FakeService();
    const host = new NoopHostAdapter("approve");
    const mcp = new FixtureMcpTransport();
    const runtime = newRuntime(service, host, { mcpToolTransport: mcp });
    await runtime.login();

    await runtime.update(INV, "investigation.add_evidence", { note: "a" });
    await runtime.update(INV, "investigation.add_evidence", { note: "b" });

    const mints = service.received.filter((r) => r.path === "/v1/mcp/sessions");
    expect(mints).toHaveLength(1);
  });

  it("logout() discards the session and wipes stored tokens", async () => {
    const service = new FakeService();
    const backend = new InMemorySecretBackend();
    const store = new TokenStore({ backend, issuer: "test", now: () => service.now });
    const runtime = newRuntime(service, new NoopHostAdapter("approve"), {
      tokenStore: store,
    });
    await runtime.login();
    expect(await store.load("default")).toBeDefined();

    await runtime.logout();
    expect(await store.load("default")).toBeUndefined();
    // A subsequent command must require login again.
    await expect(runtime.investigate({ ticket: "x" })).rejects.toThrow(
      /not authenticated/,
    );
  });

  it("maps plugin scopes to the service [read, mutate] enum when minting a session", async () => {
    const service = new FakeService();
    const runtime = newRuntime(service, new NoopHostAdapter("approve"), {
      mcpToolTransport: new FixtureMcpTransport(),
    });
    await runtime.login();
    await runtime.update(INV, "investigation.add_evidence", { note: "a" });

    const mint = service.received.find((r) => r.path === "/v1/mcp/sessions");
    expect(mint?.body).toMatchObject({
      investigationIds: [INV],
      scopes: ["read", "mutate"],
    });
  });
});
