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
    expect(start.verificationUriComplete).toContain("user_code=WXYZ-1234");

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

  it("sends exactly the RFC 8628 wire bodies the service accepts", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ interval: 1, now: clock.now });
    const auth = new DeviceCodeAuth({
      transport: server,
      clientId: "pm-plugin",
      scopes: ["read-investigation", "approve-action"],
      now: clock.now,
      sleep: clock.sleep,
    });
    await auth.start();
    server.approve();
    const tokens = await auth.waitForTokens();
    expect(server.received[0]).toEqual({
      path: "/v1/oauth/device",
      body: { client_id: "pm-plugin", scope: "read-investigation approve-action" },
    });
    expect(server.received[1]).toEqual({
      path: "/v1/oauth/token",
      body: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "dev-code-1",
        client_id: "pm-plugin",
      },
    });
    // expires_in (seconds) becomes an absolute expiry; scope string -> list.
    expect(tokens.expiresAt).toBe(clock.now() + 30 * 60 * 1000);
    expect(tokens.scopes).toEqual(["read-investigation", "write-investigation", "approve-action"]);
    expect(tokens.refreshToken).toBe("");
  });

  it("omits scope when none are requested", async () => {
    const server = new MockAuthServer();
    const auth = new DeviceCodeAuth({ transport: server, clientId: "c", scopes: [] });
    await auth.start();
    expect(server.received[0].body).toEqual({ client_id: "c" });
  });

  it("fails loudly on a non-OAuth poll error instead of polling until expiry", async () => {
    const clock = fakeClock();
    const server = new MockAuthServer({ interval: 1, now: clock.now });
    const auth = new DeviceCodeAuth({ transport: server, clientId: "c", scopes: [], now: clock.now, sleep: clock.sleep });
    await auth.start();
    // Corrupt the stored device code so the server answers invalid_grant.
    (auth as unknown as { deviceCode: string }).deviceCode = "not-a-real-code";
    await expect(auth.poll()).rejects.toThrow(/device token poll failed: 400 \(invalid_grant\)/);
  });

  it("rejects a malformed start response instead of carrying undefined fields", async () => {
    const auth = new DeviceCodeAuth({
      transport: { request: async () => ({ status: 200, body: { deviceCode: "x", userCode: "y" } }) },
      clientId: "c",
      scopes: [],
    });
    await expect(auth.start()).rejects.toThrow(/missing or empty "device_code"/);
  });

  it("surfaces the OAuth error code when start fails", async () => {
    const auth = new DeviceCodeAuth({
      transport: { request: async () => ({ status: 500, body: { error: "internal_error" } }) },
      clientId: "c",
      scopes: [],
    });
    await expect(auth.start()).rejects.toThrow("device start failed: 500 (internal_error)");
  });

  it("isExpired is true within the skew of expiry and false well before it", () => {
    const clock = fakeClock();
    const auth = new DeviceCodeAuth({ transport: new MockAuthServer(), clientId: "c", scopes: [], now: clock.now });
    expect(auth.isExpired({ expiresAt: clock.now() + 30_000 })).toBe(true);
    expect(auth.isExpired({ expiresAt: clock.now() - 1 })).toBe(true);
    expect(auth.isExpired({ expiresAt: clock.now() + 10 * 60_000 })).toBe(false);
  });
});

// Approve the server after `n` device polls have happened.
function setTimeoutApprove(server: MockAuthServer, n: number) {
  const orig = server.request.bind(server);
  let polls = 0;
  (server as any).request = async (req: any) => {
    if (
      req.path === "/v1/oauth/token" &&
      req.body?.grant_type?.includes("device_code")
    ) {
      polls++;
      if (polls >= n) server.approve();
    }
    return orig(req);
  };
}
