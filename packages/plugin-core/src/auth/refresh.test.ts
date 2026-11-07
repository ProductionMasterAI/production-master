/**
 * TokenRefresher + FileRefreshLock: proactive refresh, rotation, invalid_grant
 * forcing re-login, single-flight (in-process and across processes), and
 * logout revoking + wiping even when the revoke fails. Driven against the
 * strict MockAuthServer, which revokes the whole login on a replayed refresh
 * token exactly as the service does, so a double refresh fails these tests.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DeviceCodeAuth, ReauthRequiredError } from "./device-code.js";
import { FileRefreshLock, TokenRefresher, type RefreshLock } from "./refresh.js";
import { InMemorySecretBackend, TokenStore } from "./token-store.js";
import { MockAuthServer } from "./__fixtures__/mock-auth-server.js";
import type { TokenResponse } from "./types.js";

const FIVE_MIN = 5 * 60_000;

async function setup(opts: { lock?: RefreshLock } = {}) {
  let t = 1_000_000;
  const now = () => t;
  const server = new MockAuthServer({ interval: 1, now });
  const auth = new DeviceCodeAuth({
    transport: server,
    clientId: "pm-plugin",
    scopes: [],
    now,
    sleep: async (ms) => {
      t += ms;
    },
  });
  const store = new TokenStore({ backend: new InMemorySecretBackend(), issuer: "test", now });
  await auth.start();
  server.approve();
  const tokens = await auth.waitForTokens();
  await store.save("default", tokens);
  const refresher = new TokenRefresher({ auth, store, accountId: "default", ...(opts.lock ? { lock: opts.lock } : {}) });
  return {
    server,
    auth,
    store,
    refresher,
    tokens,
    advance: (ms: number) => {
      t += ms;
    },
    expiresIn: (tok: TokenResponse) => tok.expiresAt - t,
  };
}

describe("TokenRefresher", () => {
  it("does not refresh while more than 5 minutes remain", async () => {
    const { server, refresher, tokens } = await setup();
    const got = await refresher.ensureFresh();
    expect(got?.accessToken).toBe(tokens.accessToken);
    expect(server.refreshCalls).toEqual([]);
  });

  it("refreshes proactively under 5 minutes and stores the rotated refresh token", async () => {
    const { server, refresher, store, advance, expiresIn } = await setup();
    advance(900_000 - FIVE_MIN + 1_000); // 4 min 59 s left on a 900 s token
    const got = await refresher.ensureFresh();
    expect(server.refreshCalls).toEqual(["refresh-tok-1"]);
    expect(got?.accessToken).toBe("access-tok-2");
    expect(expiresIn(got!)).toBe(900_000);
    const stored = await store.load("default");
    expect(stored?.refreshToken).toBe("refresh-tok-2");
    expect(stored?.accessToken).toBe("access-tok-2");
    expect(stored?.clientId).toBe("pm-plugin");

    // The next refresh presents the NEW token — the old one is spent.
    advance(900_000);
    await refresher.ensureFresh(got);
    expect(server.refreshCalls).toEqual(["refresh-tok-1", "refresh-tok-2"]);
    expect(server.revoked).toBe(false);
  });

  it("invalid_grant wipes the stored session and forces a re-login", async () => {
    const { server, refresher, store, advance, auth } = await setup();
    await auth.revoke(server.currentRefreshToken!); // the login was ended elsewhere
    advance(900_000);
    await expect(refresher.ensureFresh()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(await store.load("default")).toBeUndefined();
  });

  it("two concurrent ensureFresh calls cause exactly one refresh", async () => {
    const { server, refresher, advance } = await setup();
    advance(900_000);
    const [a, b] = await Promise.all([refresher.ensureFresh(), refresher.ensureFresh()]);
    expect(server.refreshCalls).toEqual(["refresh-tok-1"]);
    expect(a?.accessToken).toBe("access-tok-2");
    expect(b?.accessToken).toBe("access-tok-2");
    expect(server.revoked).toBe(false);
  });

  it("re-reads the store under the lock: a refresh done by another process is reused", async () => {
    const { server, refresher, store, auth, advance, tokens } = await setup();
    advance(900_000);
    // Another process sharing the store refreshed first and saved its tokens.
    const theirs = await auth.refresh(tokens);
    await store.save("default", theirs);
    // We still hold the old, now-spent tokens in memory.
    const got = await refresher.ensureFresh(tokens);
    expect(got?.accessToken).toBe(theirs.accessToken);
    expect(server.refreshCalls).toEqual(["refresh-tok-1"]); // only theirs
    expect(server.revoked).toBe(false);
  });

  it("keeps the current token on a transient refresh failure while it is still valid", async () => {
    const { server, refresher, advance, tokens } = await setup();
    advance(900_000 - FIVE_MIN + 1_000);
    server.refreshFailsWith = 503;
    const got = await refresher.ensureFresh();
    expect(got?.accessToken).toBe(tokens.accessToken);
    advance(FIVE_MIN); // now past expiry
    await expect(refresher.ensureFresh()).rejects.toThrow(/token refresh failed: 503/);
  });

  it("a session with no refresh token is used until it expires, then is over", async () => {
    const { refresher, store, advance } = await setup();
    await store.save("default", { accessToken: "preset", refreshToken: "", expiresAt: 1_000_000 + 900_000, scopes: [] });
    advance(900_000 - FIVE_MIN + 1_000);
    expect((await refresher.ensureFresh())?.accessToken).toBe("preset");
    advance(FIVE_MIN);
    await expect(refresher.ensureFresh()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(await store.load("default")).toBeUndefined();
  });

  it("returns undefined when nobody is logged in", async () => {
    const { refresher, store } = await setup();
    await store.clear("default");
    expect(await refresher.ensureFresh()).toBeUndefined();
  });

  it("runs the refresh under the cross-process lock", async () => {
    const keys: string[] = [];
    const lock: RefreshLock = {
      withLock: async (key, fn) => {
        keys.push(key);
        return fn();
      },
    };
    const { refresher, advance } = await setup({ lock });
    advance(900_000);
    await refresher.ensureFresh();
    expect(keys).toEqual(["production-master:default"]);
  });
});

describe("TokenRefresher.logout", () => {
  it("revokes the stored refresh token and wipes the session", async () => {
    const { server, refresher, store } = await setup();
    const result = await refresher.logout();
    expect(result).toEqual({ revoked: true });
    expect(server.revokeCalls).toEqual([{ token: "refresh-tok-1" }]);
    expect(server.revoked).toBe(true);
    expect(await store.load("default")).toBeUndefined();
  });

  it("wipes the session even when the revoke fails", async () => {
    const { server, refresher, store } = await setup();
    server.revokeFailsWith = 503;
    const result = await refresher.logout();
    expect(result.revoked).toBe(false);
    expect((result.error as Error).message).toMatch(/token revoke failed: 503/);
    expect(await store.load("default")).toBeUndefined();
  });

  it("waits for an in-flight refresh, revokes the rotated token, and nothing writes the session back", async () => {
    // Injected store + no custom lock (IN_PROCESS_ONLY): the in-process queue
    // alone must order refresh before logout.
    const { server, refresher, store, advance } = await setup();
    advance(900_000);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = server.request.bind(server);
    server.request = async (req) => {
      if ((req.body as { grant_type?: string } | undefined)?.grant_type === "refresh_token") await gate;
      return real(req);
    };

    const refreshing = refresher.ensureFresh();
    await new Promise((r) => setTimeout(r, 0)); // the refresh is now awaiting its response
    const loggingOut = refresher.logout();
    release();
    await refreshing;
    const result = await loggingOut;

    expect(result).toEqual({ revoked: true });
    // Logout ran after the refresh saved, so it revoked the NEW token.
    expect(server.revokeCalls).toEqual([{ token: "refresh-tok-2" }]);
    expect(server.revoked).toBe(true);
    expect(await store.load("default")).toBeUndefined();
  });

  it("a refresh queued behind logout finds no session and asks for a login", async () => {
    const { refresher, store, advance } = await setup();
    advance(900_000);
    const loggingOut = refresher.logout();
    const refreshing = refresher.refresh();
    await loggingOut;
    await expect(refreshing).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(await store.load("default")).toBeUndefined();
  });

  it("wipes the session even when the transport throws", async () => {
    const { refresher, store, server } = await setup();
    server.request = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await refresher.logout();
    expect(result.revoked).toBe(false);
    expect(await store.load("default")).toBeUndefined();
  });
});

describe("FileRefreshLock", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("serializes holders of the same key and removes the file on release", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5 });
    const order: string[] = [];
    const hold = (name: string, ms: number) =>
      lock.withLock("k", async () => {
        order.push(`${name}:in`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name}:out`);
      });
    await Promise.all([hold("a", 40), hold("b", 0)]);
    // Either may win, but the two critical sections never overlap.
    expect([
      ["a:in", "a:out", "b:in", "b:out"],
      ["b:in", "b:out", "a:in", "a:out"],
    ]).toContainEqual(order);
    expect(existsSync(lock.pathFor("k"))).toBe(false);
  });

  it("releases on a throwing holder", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5 });
    await expect(lock.withLock("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await lock.withLock("k", async () => "again")).toBe("again");
  });

  it("breaks a lock left by a dead process", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5, timeoutMs: 500 });
    const deadPid = await exitedPid();
    writeFileSync(lock.pathFor("k"), JSON.stringify({ pid: deadPid, at: Date.now(), nonce: "x" }));
    expect(await lock.withLock("k", async () => "got it")).toBe("got it");
  });

  it("keeps a live holder exclusive past staleMs by renewing its heartbeat", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    // staleMs far below how long the holder works: without the heartbeat the
    // waiter would break the lock and both would refresh at once.
    const lock = new FileRefreshLock({ dir, pollMs: 5, staleMs: 60, heartbeatMs: 10, timeoutMs: 5_000 });
    const order: string[] = [];
    const first = lock.withLock("k", async () => {
      order.push("a:in");
      await new Promise((r) => setTimeout(r, 300));
      order.push("a:out");
    });
    await new Promise((r) => setTimeout(r, 20));
    const second = lock.withLock("k", async () => {
      order.push("b:in");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["a:in", "a:out", "b:in"]);
  });

  it("breaks a lock whose heartbeat stopped even if its pid is alive (pid reuse)", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5, staleMs: 100, timeoutMs: 1_000 });
    writeFileSync(lock.pathFor("k"), JSON.stringify({ pid: process.pid, at: Date.now() - 1_000, nonce: "old" }));
    expect(await lock.withLock("k", async () => "got it")).toBe("got it");
  });

  it("does not judge a pid from another host: a fresh lock there is respected", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5, timeoutMs: 50 });
    const deadHere = await exitedPid();
    writeFileSync(
      lock.pathFor("k"),
      JSON.stringify({ pid: deadHere, host: "some-other-host", at: Date.now(), nonce: "remote" }),
    );
    await expect(lock.withLock("k", async () => "never")).rejects.toThrow(/timed out waiting/);
  });

  it("times out instead of waiting forever on a live holder", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5, timeoutMs: 50 });
    writeFileSync(lock.pathFor("k"), JSON.stringify({ pid: process.pid, at: Date.now(), nonce: "other" }));
    await expect(lock.withLock("k", async () => "never")).rejects.toThrow(/timed out waiting/);
  });

  it("excludes a holder in another process", async () => {
    dir = mkdtempSync(join(tmpdir(), "pm-lock-test-"));
    const lock = new FileRefreshLock({ dir, pollMs: 5, timeoutMs: 5_000 });
    const file = lock.pathFor("k");
    // A child process takes the lock the same way (O_EXCL create) and holds it 300 ms.
    const child = spawn(
      process.execPath,
      [
        "-e",
        `const fs=require("node:fs");` +
          `fs.writeFileSync(${JSON.stringify(file)},JSON.stringify({pid:process.pid,at:Date.now(),nonce:"child"}),{flag:"wx"});` +
          `process.stdout.write("held\\n");` +
          `setTimeout(()=>{const at=Date.now();fs.rmSync(${JSON.stringify(file)});process.stdout.write("released:"+at+"\\n");},300);`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const exited = new Promise((r) => child.on("close", r)); // after stdout drains
    const events: string[] = [];
    await new Promise<void>((resolve) =>
      child.stdout.on("data", (d: Buffer) => {
        events.push(...d.toString().trim().split("\n"));
        if (events.includes("held")) resolve();
      }),
    );
    let parentInAt = 0;
    await lock.withLock("k", async () => {
      parentInAt = Date.now();
    });
    await exited;
    // The child stamps its release BEFORE removing the file, so a parent that
    // waited for it can only have entered at or after that stamp.
    const released = events.find((e) => e.startsWith("released:"));
    expect(released).toBeDefined();
    expect(parentInAt).toBeGreaterThanOrEqual(Number(released!.slice("released:".length)));
  });
});

/** The pid of a process that has already exited. */
function exitedPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    child.on("exit", () => resolve(child.pid!));
  });
}
