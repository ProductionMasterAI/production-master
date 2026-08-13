/**
 * Isolated from cli.test.ts because it mocks the whole
 * @production-master/plugin-core module — verifies buildDeps() proactively
 * refreshes a stored session (mirrors PluginRuntime#ensureAuth) instead of
 * sending a stale access token until the service 401s it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const savedTokens: unknown[] = [];
const refreshCalls: string[] = [];
let capturedAuthToken: string | undefined;

const STALE = {
  accessToken: "stale-access-token",
  refreshToken: "the-refresh-token",
  expiresAt: 0, // already expired
  scopes: [],
};
const FRESH = {
  accessToken: "fresh-access-token",
  refreshToken: "new-refresh-token",
  expiresAt: Date.now() + 3_600_000,
  scopes: [],
};

vi.mock("@production-master/plugin-core", () => {
  class ServiceClient {
    private getAuthToken: () => string | undefined;
    constructor(opts: { getAuthToken: () => string | undefined }) {
      this.getAuthToken = opts.getAuthToken;
    }
    async getRun(id: string) {
      // Record which token the client would actually send, same as a real
      // HTTP request reading getAuthToken() at call time.
      capturedAuthToken = this.getAuthToken();
      return {
        investigationId: id,
        status: "running",
        createdAt: "2026-01-01T00:00:00Z",
        completedAt: undefined,
        title: undefined,
        costUsd: 0,
        reportUri: undefined,
      };
    }
  }
  class NodeHttpTransport {}
  class NodeSseConnector {}
  class DeviceCodeAuth {
    needsRefresh(tokens: { expiresAt: number }) {
      return tokens.expiresAt < Date.now();
    }
    async refresh(refreshToken: string) {
      refreshCalls.push(refreshToken);
      return FRESH;
    }
  }
  function createTokenStore() {
    return {
      async load() {
        return STALE;
      },
      async save(_accountId: string, tokens: unknown) {
        savedTokens.push(tokens);
      },
    };
  }
  return {
    ServiceClient,
    NodeHttpTransport,
    NodeSseConnector,
    DeviceCodeAuth,
    createTokenStore,
  };
});

beforeEach(() => {
  savedTokens.length = 0;
  refreshCalls.length = 0;
  capturedAuthToken = undefined;
});

describe("buildDeps — stored session refresh", () => {
  it("refreshes an expired stored session before using it, and persists the refresh", async () => {
    const { runCli } = await import("./cli.js");
    const { EXIT } = await import("./exit-codes.js");
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["status", "inv_1", "--output", "json"], {
      write: (s) => out.push(s),
      writeErr: (s) => err.push(s),
      env: { PM_SERVICE_URL: "https://svc.test" },
    });
    expect(code).toBe(EXIT.OK);
    // The refresh token from the stored (stale) session was exchanged...
    expect(refreshCalls).toEqual(["the-refresh-token"]);
    // ...the refreshed tokens were persisted back to the store...
    expect(savedTokens).toEqual([FRESH]);
    // ...and the request that went out used the fresh access token, never
    // the stale one.
    expect(capturedAuthToken).toBe(FRESH.accessToken);
  });
});
