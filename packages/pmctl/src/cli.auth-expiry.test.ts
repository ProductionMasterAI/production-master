/**
 * Isolated from cli.test.ts because it mocks the whole
 * @production-master/plugin-core module — verifies buildDeps() never sends an
 * expired stored session. The hosted service issues no refresh token (no
 * refresh grant), so an expired session is dropped and the call goes out
 * unauthenticated; the service 401s it and pmctl tells the user to log in.
 * (This file replaced cli.auth-refresh.test.ts, which exercised a refresh
 * grant the service never served.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let stored: { accessToken: string; refreshToken: string; expiresAt: number; scopes: never[] };
let capturedAuthToken: string | undefined;

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
    isExpired(tokens: { expiresAt: number }) {
      return tokens.expiresAt - Date.now() <= 60_000;
    }
  }
  function createTokenStore() {
    return {
      async load() {
        return stored;
      },
      async save() {},
    };
  }
  return { ServiceClient, NodeHttpTransport, NodeSseConnector, DeviceCodeAuth, createTokenStore };
});

beforeEach(() => {
  capturedAuthToken = undefined;
});

async function status(): Promise<number> {
  const { runCli } = await import("./cli.js");
  return runCli(["status", "inv_1", "--output", "json"], {
    write: () => {},
    writeErr: () => {},
    env: { PM_SERVICE_URL: "https://svc.test" },
  });
}

describe("buildDeps — stored session expiry", () => {
  it("does not send an expired stored access token", async () => {
    stored = { accessToken: "expired-access-token", refreshToken: "", expiresAt: 0, scopes: [] };
    await status();
    expect(capturedAuthToken).toBeUndefined();
  });

  it("sends a stored access token that is still valid", async () => {
    stored = {
      accessToken: "valid-access-token",
      refreshToken: "",
      expiresAt: Date.now() + 3_600_000,
      scopes: [],
    };
    const { EXIT } = await import("./exit-codes.js");
    expect(await status()).toBe(EXIT.OK);
    expect(capturedAuthToken).toBe("valid-access-token");
  });
});
