import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KeychainSecretBackend } from "./keychain.js";

// Mock execFile so tests never touch a real OS keychain.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:util", () => ({
  promisify: (fn: unknown) => fn,
}));

import { execFile } from "node:child_process";
const mockExec = vi.mocked(execFile);

const PROBE_RESULT = { stdout: "security-2.0\n", stderr: "" };

function setupMacProbe() {
  // First call is the probe (`security --version`); subsequent calls are operations.
  mockExec.mockResolvedValueOnce(PROBE_RESULT as never);
}

describe("KeychainSecretBackend (macOS mock)", () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: origPlatform,
      configurable: true,
    });
  });

  it("set() deletes then adds generic password", async () => {
    const backend = new KeychainSecretBackend("test-service");
    setupMacProbe();
    // delete-generic-password (expected to fail / ignore)
    mockExec.mockRejectedValueOnce(new Error("not found") as never);
    // add-generic-password
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" } as never);

    await backend.set("pm-session:acct1", "ciphertext-blob");

    const calls = mockExec.mock.calls;
    // calls[0] = probe, calls[1] = delete, calls[2] = add
    expect(calls[1][0]).toBe("security");
    expect(calls[1][1]).toContain("delete-generic-password");
    expect(calls[2][0]).toBe("security");
    expect(calls[2][1]).toContain("add-generic-password");
    expect(calls[2][1]).toContain("ciphertext-blob");
  });

  it("get() returns stored value", async () => {
    const backend = new KeychainSecretBackend("test-service");
    setupMacProbe();
    mockExec.mockResolvedValueOnce({
      stdout: "ciphertext-blob\n",
      stderr: "",
    } as never);

    const result = await backend.get("pm-session:acct1");

    expect(result).toBe("ciphertext-blob");
    const calls = mockExec.mock.calls;
    expect(calls[1][0]).toBe("security");
    expect(calls[1][1]).toContain("find-generic-password");
  });

  it("get() returns undefined when key not found", async () => {
    const backend = new KeychainSecretBackend("test-service");
    setupMacProbe();
    mockExec.mockRejectedValueOnce(
      new Error("SecKeychainSearchCopyNext") as never,
    );

    const result = await backend.get("pm-session:missing");
    expect(result).toBeUndefined();
  });

  it("delete() calls delete-generic-password and ignores not-found", async () => {
    const backend = new KeychainSecretBackend("test-service");
    setupMacProbe();
    mockExec.mockRejectedValueOnce(new Error("not found") as never);

    await expect(backend.delete("pm-session:acct1")).resolves.toBeUndefined();
  });

  it("list() returns empty array (native keychain does not enumerate)", async () => {
    const backend = new KeychainSecretBackend("test-service");
    setupMacProbe();

    const result = await backend.list();
    expect(result).toEqual([]);
  });
});

describe("KeychainSecretBackend fallback (CLI unavailable)", () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: origPlatform,
      configurable: true,
    });
  });

  it("falls back to InMemorySecretBackend when CLI is not found", async () => {
    const backend = new KeychainSecretBackend("test-service");
    // Probe fails → CLI unavailable
    mockExec.mockRejectedValueOnce(new Error("spawn security ENOENT") as never);

    await backend.set("key", "value");
    const result = await backend.get("key");
    expect(result).toBe("value");
  });

  it("warns on fallback activation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockRejectedValueOnce(new Error("ENOENT") as never);

    await backend.get("any-key");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Falling back"),
    );
    warnSpy.mockRestore();
  });
});
