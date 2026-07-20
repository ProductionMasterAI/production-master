/**
 * OS keychain SecretBackend — stores token material in the native credential
 * store using CLI tools only (no native addons).
 *
 *   macOS: `security` (Keychain)
 *   Linux: `secret-tool` (libsecret)
 *   Windows: `cmdkey` + PowerShell PasswordVault
 *   Fallback: InMemorySecretBackend + console warning
 *
 * The service name is "production-master" by default; callers may override via
 * the constructor for tests or multi-tenant setups.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SecretBackend } from "./token-store.js";
import { InMemorySecretBackend } from "./token-store.js";

const exec = promisify(execFile);

function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[pm-keychain] ${msg}`);
}

type Platform = "darwin" | "linux" | "win32" | "unknown";

function detectPlatform(): Platform {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  if (p === "win32") return "win32";
  return "unknown";
}

// ---------------------------------------------------------------------------
// macOS implementation (security CLI)
// ---------------------------------------------------------------------------

async function macStore(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  // Delete first so add never fails with "already exists"
  await exec("security", [
    "delete-generic-password",
    "-s",
    service,
    "-a",
    account,
  ]).catch(() => {
    /* ignore: not found */
  });
  await exec("security", [
    "add-generic-password",
    "-s",
    service,
    "-a",
    account,
    "-w",
    value,
    "-U",
  ]);
}

async function macGet(
  service: string,
  account: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await exec("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function macDelete(service: string, account: string): Promise<void> {
  await exec("security", [
    "delete-generic-password",
    "-s",
    service,
    "-a",
    account,
  ]).catch(() => {
    /* ignore: not found */
  });
}

// ---------------------------------------------------------------------------
// Linux implementation (secret-tool / libsecret)
// ---------------------------------------------------------------------------

async function linuxStore(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  await exec(
    "secret-tool",
    [
      "store",
      "--label",
      `${service}:${account}`,
      "service",
      service,
      "account",
      account,
    ],
    { input: value } as Parameters<typeof exec>[2],
  );
}

async function linuxGet(
  service: string,
  account: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await exec("secret-tool", [
      "lookup",
      "service",
      service,
      "account",
      account,
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function linuxDelete(service: string, account: string): Promise<void> {
  await exec("secret-tool", [
    "clear",
    "service",
    service,
    "account",
    account,
  ]).catch(() => {
    /* ignore */
  });
}

// ---------------------------------------------------------------------------
// Windows implementation (PowerShell PasswordVault)
// ---------------------------------------------------------------------------

function psEscape(s: string): string {
  return s.replace(/'/g, "''");
}

async function winStore(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try { $vault.Remove($vault.Retrieve('${psEscape(service)}','${psEscape(account)}')) } catch {}
    $cred = New-Object Windows.Security.Credentials.PasswordCredential('${psEscape(service)}','${psEscape(account)}','${psEscape(value)}')
    $vault.Add($cred)
  `.trim();
  await exec("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
}

async function winGet(
  service: string,
  account: string,
): Promise<string | undefined> {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try {
      $c = $vault.Retrieve('${psEscape(service)}','${psEscape(account)}')
      $c.RetrievePassword()
      Write-Output $c.Password
    } catch { Write-Output '' }
  `.trim();
  try {
    const { stdout } = await exec("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function winDelete(service: string, account: string): Promise<void> {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try { $vault.Remove($vault.Retrieve('${psEscape(service)}','${psEscape(account)}')) } catch {}
  `.trim();
  await exec("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]).catch(() => {});
}

// ---------------------------------------------------------------------------
// Probe: check whether the native CLI is available
// ---------------------------------------------------------------------------

async function isAvailable(platform: Platform): Promise<boolean> {
  try {
    if (platform === "darwin") {
      await exec("security", ["--version"]);
    } else if (platform === "linux") {
      await exec("secret-tool", ["--version"]);
    } else if (platform === "win32") {
      await exec("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "exit 0",
      ]);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public backend
// ---------------------------------------------------------------------------

/**
 * Stores secrets in the OS native keychain via CLI tools.  Falls back to
 * InMemorySecretBackend (with a warning) if the CLI is unavailable.
 *
 * `list()` is not supported by all native keychains; it always returns an
 * empty array — callers must track key names themselves.
 */
export class KeychainSecretBackend implements SecretBackend {
  private readonly service: string;
  private readonly platform: Platform;
  private fallback: SecretBackend | undefined;
  private _available: boolean | undefined;

  constructor(service = "production-master") {
    this.service = service;
    this.platform = detectPlatform();
  }

  private async ensureAvailable(): Promise<boolean> {
    if (this._available === undefined) {
      this._available = await isAvailable(this.platform);
      if (!this._available) {
        warn(
          `OS keychain CLI unavailable on ${this.platform}. ` +
            "Falling back to in-memory storage (tokens will not persist across sessions).",
        );
        this.fallback = new InMemorySecretBackend();
      }
    }
    return this._available;
  }

  async get(key: string): Promise<string | undefined> {
    if (!(await this.ensureAvailable())) return this.fallback!.get(key);
    if (this.platform === "darwin") return macGet(this.service, key);
    if (this.platform === "linux") return linuxGet(this.service, key);
    if (this.platform === "win32") return winGet(this.service, key);
    return undefined;
  }

  async set(key: string, value: string): Promise<void> {
    if (!(await this.ensureAvailable())) return this.fallback!.set(key, value);
    if (this.platform === "darwin") return macStore(this.service, key, value);
    if (this.platform === "linux") return linuxStore(this.service, key, value);
    if (this.platform === "win32") return winStore(this.service, key, value);
  }

  async delete(key: string): Promise<void> {
    if (!(await this.ensureAvailable())) return this.fallback!.delete(key);
    if (this.platform === "darwin") return macDelete(this.service, key);
    if (this.platform === "linux") return linuxDelete(this.service, key);
    if (this.platform === "win32") return winDelete(this.service, key);
  }

  async list(): Promise<string[]> {
    if (!(await this.ensureAvailable())) return this.fallback!.list();
    // Native keychains don't expose an enumerable list for arbitrary service names.
    return [];
  }
}
