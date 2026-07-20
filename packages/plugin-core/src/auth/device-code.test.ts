import { describe, it, expect } from "vitest";
import { DeviceCodeAuth } from "./device-code.js";
import { MockAuthServer } from "./__fixtures__/mock-auth-server.js";

function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    // sleep advances the virtual clock instead of waiting wall-time.
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("DeviceCodeAuth", () => {
  it("completes start -> poll -> tokens once approved", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ interval: 5, now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "cli",
      scopes: ["read-investigation"],
      now: clock.now,
      sleep: clock.sleep,
    });

    const start = await auth.start();
    expect(start.userCode).toBe("WXYZ-1234");
    expect(start.verificationUriComplete).toContain("code=");

    // Pending until approved.
    expect((await auth.poll()).status).toBe("pending");
    server.approve();
    const result = await auth.poll();
    expect(result.status).toBe("tokens");
  });

  it("never polls faster than the interval", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ interval: 5, now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "cli",
      scopes: ["read-investigation"],
      now: clock.now,
      sleep: clock.sleep,
    });
    await auth.start();
    // Approve after a couple of cycles.
    setTimeoutApprove(server, 2);
    await auth.waitForTokens();

    // Consecutive device polls must be >= interval (5s) apart.
    for (let i = 1; i < server.pollCalls.length; i++) {
      expect(
        server.pollCalls[i] - server.pollCalls[i - 1],
      ).toBeGreaterThanOrEqual(5000);
    }
  });

  it("honors slow_down by increasing the interval", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({
      interval: 5,
      slowDownOnce: true,
      now: clock.now,
    });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "cli",
      scopes: ["read-investigation"],
      now: clock.now,
      sleep: clock.sleep,
    });
    await auth.start();
    server.approve();
    await auth.waitForTokens();
    // After one slow_down, the gap before the tokens poll should be >= 10s.
    const gaps = server.pollCalls
      .slice(1)
      .map((t, i) => t - server.pollCalls[i]);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(10000);
  });

  it("throws on denied", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ interval: 1, now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "c",
      scopes: [],
      now: clock.now,
      sleep: clock.sleep,
    });
    await auth.start();
    server.deny();
    await expect(auth.waitForTokens()).rejects.toThrow(/denied/);
  });

  it("needsRefresh fires when TTL < 5 min and refresh returns new tokens", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "c",
      scopes: [],
      now: clock.now,
      sleep: clock.sleep,
    });
    const tokens = {
      accessToken: "a",
      refreshToken: "refresh-tok-xyz",
      expiresAt: clock.now() + 4 * 60 * 1000,
      scopes: [] as const,
    };
    expect(auth.needsRefresh(tokens as any)).toBe(true);
    const refreshed = await auth.refresh("refresh-tok-xyz");
    expect(refreshed.accessToken).toBe("access-tok-abc");
  });

  it("revoke invalidates the refresh token", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "c",
      scopes: [],
      now: clock.now,
      sleep: clock.sleep,
    });
    await auth.revoke("refresh-tok-xyz");
    expect(server.isRevoked("refresh-tok-xyz")).toBe(true);
    await expect(auth.refresh("refresh-tok-xyz")).rejects.toThrow();
  });
});

// Approve the server after `n` device polls have happened.
function setTimeoutApprove(server: MockAuthServer, n: number) {
  const orig = server.request.bind(server);
  let polls = 0;
  (server as any).request = async (req: any) => {
    if (
      req.path === "/v1/oauth/token" &&
      req.body?.grantType?.includes("device_code")
    ) {
      polls++;
      if (polls >= n) server.approve();
    }
    return orig(req);
  };
}
