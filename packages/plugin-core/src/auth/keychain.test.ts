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
  // First call is the probe (`security list-keychains`); subsequent calls are operations.
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

function usePlatform(platform: NodeJS.Platform) {
  const origPlatform = process.platform;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: origPlatform,
      configurable: true,
    });
  });
}

const OK = { stdout: "", stderr: "" };

describe("KeychainSecretBackend (Linux / secret-tool mock)", () => {
  usePlatform("linux");

  it("probes secret-tool, then stores under service/account attributes without the secret on argv", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never); // probe
    mockExec.mockResolvedValueOnce(OK as never); // store

    await backend.set("pm-session:acct1", "ciphertext-blob");

    const calls = mockExec.mock.calls;
    expect(calls[0][0]).toBe("secret-tool");
    expect(calls[0][1]).toEqual(["--version"]);
    expect(calls[1][0]).toBe("secret-tool");
    expect(calls[1][1]).toEqual([
      "store",
      "--label",
      "test-service:pm-session:acct1",
      "service",
      "test-service",
      "account",
      "pm-session:acct1",
    ]);
    // The secret must never appear in the process argument list (visible in ps).
    expect(calls[1][1]).not.toContain("ciphertext-blob");
  });

  it("get() looks up by attributes and trims the stored value", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockResolvedValueOnce({ stdout: "ciphertext-blob\n", stderr: "" } as never);

    await expect(backend.get("pm-session:acct1")).resolves.toBe("ciphertext-blob");
    expect(mockExec.mock.calls[1][1]).toEqual([
      "lookup",
      "service",
      "test-service",
      "account",
      "pm-session:acct1",
    ]);
  });

  it("get() maps a lookup failure or empty output to undefined", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockRejectedValueOnce(new Error("exit 1") as never);
    await expect(backend.get("missing")).resolves.toBeUndefined();

    mockExec.mockResolvedValueOnce({ stdout: "\n", stderr: "" } as never);
    await expect(backend.get("blank")).resolves.toBeUndefined();
  });

  it("delete() clears by attributes and swallows a not-found failure", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockRejectedValueOnce(new Error("no such secret") as never);

    await expect(backend.delete("pm-session:acct1")).resolves.toBeUndefined();
    expect(mockExec.mock.calls[1]).toEqual([
      "secret-tool",
      ["clear", "service", "test-service", "account", "pm-session:acct1"],
    ]);
  });
});

describe("KeychainSecretBackend (Windows / PowerShell PasswordVault mock)", () => {
  usePlatform("win32");

  function lastScript(): string {
    const args = mockExec.mock.calls.at(-1)![1] as string[];
    expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    return args[3];
  }

  it("set() replaces any existing credential and adds the new one", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never); // probe
    mockExec.mockResolvedValueOnce(OK as never); // store

    await backend.set("acct1", "ciphertext-blob");

    expect(mockExec.mock.calls[0][0]).toBe("powershell");
    expect(mockExec.mock.calls[1][0]).toBe("powershell");
    const script = lastScript();
    expect(script).toContain("$vault.Remove($vault.Retrieve('test-service','acct1'))");
    expect(script).toContain(
      "PasswordCredential('test-service','acct1','ciphertext-blob')",
    );
    expect(script).toContain("$vault.Add($cred)");
  });

  it("escapes single quotes so a key or value cannot break out of the PowerShell string", async () => {
    const backend = new KeychainSecretBackend("svc'x");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockResolvedValueOnce(OK as never);

    await backend.set("o'brien", "a'); Remove-Item C:\\ -Recurse; ('");

    const script = lastScript();
    expect(script).toContain(
      "PasswordCredential('svc''x','o''brien','a''); Remove-Item C:\\ -Recurse; (''')",
    );
    // No unescaped quote from the input survives: every quote inside the
    // injected payload is doubled.
    expect(script).not.toContain("'a'); Remove-Item");
  });

  it("get() returns the trimmed password, or undefined when empty or on failure", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockResolvedValueOnce({ stdout: "ciphertext-blob\r\n", stderr: "" } as never);
    await expect(backend.get("acct1")).resolves.toBe("ciphertext-blob");
    expect(lastScript()).toContain("$vault.Retrieve('test-service','acct1')");

    // The script prints '' when the credential is missing.
    mockExec.mockResolvedValueOnce({ stdout: "\r\n", stderr: "" } as never);
    await expect(backend.get("missing")).resolves.toBeUndefined();

    mockExec.mockRejectedValueOnce(new Error("powershell crashed") as never);
    await expect(backend.get("acct1")).resolves.toBeUndefined();
  });

  it("delete() removes the credential and swallows failures", async () => {
    const backend = new KeychainSecretBackend("test-service");
    mockExec.mockResolvedValueOnce(OK as never);
    mockExec.mockRejectedValueOnce(new Error("element not found") as never);

    await expect(backend.delete("acct1")).resolves.toBeUndefined();
    expect(lastScript()).toContain(
      "$vault.Remove($vault.Retrieve('test-service','acct1'))",
    );
  });
});
