/**
 * buildDeps() token lifecycle, end to end through runCli: the REAL plugin-core
 * DeviceCodeAuth + TokenRefresher + TokenStore, with only the network
 * (NodeHttpTransport), the OS keychain (createTokenStore) and the lock file
 * (createRefreshLock) swapped for in-memory doubles. Isolated from cli.test.ts
 * because it mocks those plugin-core factories.
 *
 * Covers: a valid session is used as is; one under ~5 min is refreshed with
 * the login's client_id and the rotated refresh token is stored; a refused
 * refresh or an expired unrefreshable session goes out unauthenticated (the
 * service 401s it and pmctl says "log in"); logout revokes and wipes even when
 * the revoke fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpRequest, HttpResponse, TokenResponse } from "@production-master/plugin-core";

const state = vi.hoisted(() => ({
  requests: [] as { method: string; path: string; body: unknown; auth?: string }[],
  refreshAnswer: "ok" as "ok" | "invalid_grant",
  revokeStatus: 200,
  issued: 0,
  store: undefined as unknown,
}));

vi.mock("@production-master/plugin-core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@production-master/plugin-core")>();
  class NodeHttpTransport {
    async request(req: HttpRequest): Promise<HttpResponse> {
      state.requests.push({
        method: req.method,
        path: req.path,
        body: req.body,
        auth: req.headers?.["Authorization"],
      });
      if (req.path === "/v1/oauth/token") {
        if (state.refreshAnswer === "invalid_grant") return { status: 400, body: { error: "invalid_grant" } };
        state.issued += 1;
        return {
          status: 200,
          body: {
            access_token: `refreshed-access-${state.issued}`,
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: `rotated-refresh-${state.issued}`,
          },
        };
      }
      if (req.path === "/v1/oauth/revoke") {
        return state.revokeStatus === 200
          ? { status: 200, body: {} }
          : { status: state.revokeStatus, body: { error: "server_error" } };
      }
      if (req.path.startsWith("/v1/runs/")) {
        if (!req.headers?.["Authorization"]) return { status: 401, body: { message: "unauthenticated" } };
        return {
          status: 200,
          body: { investigationId: "inv_1", status: "running", createdAt: "2026-01-01T00:00:00Z", costUsd: 0 },
        };
      }
      return { status: 404, body: {} };
    }
  }
  return {
    ...real,
    NodeHttpTransport,
    createTokenStore: () => state.store,
    createRefreshLock: () => real.IN_PROCESS_ONLY,
  };
});

const { TokenStore, InMemorySecretBackend } = await import("@production-master/plugin-core");
let store: InstanceType<typeof TokenStore>;

beforeEach(() => {
  state.requests.length = 0;
  state.refreshAnswer = "ok";
  state.revokeStatus = 200;
  state.issued = 0;
  store = new TokenStore({ backend: new InMemorySecretBackend(), issuer: "test" });
  state.store = store;
});

async function run(argv: string[]): Promise<{ exit: number; err: string }> {
  const { runCli } = await import("./cli.js");
  const err: string[] = [];
  const exit = await runCli([...argv, "--output", "json"], {
    write: () => {},
    writeErr: (s) => err.push(s),
    env: { PM_SERVICE_URL: "https://svc.test" },
  });
  return { exit, err: err.join("") };
}

function session(overrides: Partial<TokenResponse>): TokenResponse {
  return {
    accessToken: "stored-access",
    refreshToken: "stored-refresh",
    expiresAt: Date.now() + 3_600_000,
    scopes: [],
    clientId: "pm-plugin",
    ...overrides,
  };
}

const runCall = () => state.requests.find((r) => r.path === "/v1/runs/inv_1");

describe("buildDeps — stored session lifecycle", () => {
  it("sends a stored access token that is still valid, without refreshing", async () => {
    await store.save("default", session({}));
    const { EXIT } = await import("./exit-codes.js");
    expect((await run(["status", "inv_1"])).exit).toBe(EXIT.OK);
    expect(runCall()?.auth).toBe("Bearer stored-access");
    expect(state.requests.some((r) => r.path === "/v1/oauth/token")).toBe(false);
  });

  it("refreshes a session under 5 minutes with the login's client_id and stores the rotation", async () => {
    await store.save("default", session({ expiresAt: Date.now() + 4 * 60_000 }));
    const { EXIT } = await import("./exit-codes.js");
    expect((await run(["status", "inv_1"])).exit).toBe(EXIT.OK);

    const grant = state.requests.find((r) => r.path === "/v1/oauth/token");
    // The session was logged in by the IDE plugin: its client_id, not pmctl's.
    expect(grant?.body).toEqual({ grant_type: "refresh_token", refresh_token: "stored-refresh", client_id: "pm-plugin" });
    expect(runCall()?.auth).toBe("Bearer refreshed-access-1");
    const stored = await store.load("default");
    expect(stored?.refreshToken).toBe("rotated-refresh-1");
    expect(stored?.clientId).toBe("pm-plugin");
  });

  it("does not send an expired session that cannot be refreshed", async () => {
    await store.save("default", session({ refreshToken: "", expiresAt: 0 }));
    const { EXIT } = await import("./exit-codes.js");
    expect((await run(["status", "inv_1"])).exit).toBe(EXIT.AUTH);
    expect(runCall()?.auth).toBeUndefined();
    expect(await store.load("default")).toBeUndefined();
  });

  it("drops the session when the refresh is refused (invalid_grant) and asks for a login", async () => {
    await store.save("default", session({ expiresAt: 0 }));
    state.refreshAnswer = "invalid_grant";
    const { EXIT } = await import("./exit-codes.js");
    expect((await run(["status", "inv_1"])).exit).toBe(EXIT.AUTH);
    expect(runCall()?.auth).toBeUndefined();
    expect(await store.load("default")).toBeUndefined();
  });
});

describe("pmctl logout", () => {
  it("revokes the stored refresh token and wipes the session", async () => {
    await store.save("default", session({}));
    const { EXIT } = await import("./exit-codes.js");
    expect((await run(["logout"])).exit).toBe(EXIT.OK);
    expect(state.requests.find((r) => r.path === "/v1/oauth/revoke")?.body).toEqual({ token: "stored-refresh" });
    expect(await store.load("default")).toBeUndefined();
  });

  it("wipes the session even when the revoke fails, and says so", async () => {
    await store.save("default", session({}));
    state.revokeStatus = 503;
    const { EXIT } = await import("./exit-codes.js");
    const { exit, err } = await run(["logout"]);
    expect(exit).toBe(EXIT.OK);
    expect(err).toMatch(/revoke failed/);
    expect(await store.load("default")).toBeUndefined();
  });
});
