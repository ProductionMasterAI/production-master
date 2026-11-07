/**
 * TokenRefresher — the ONE place a stored login is refreshed or revoked.
 *
 * Why it exists: the service rotates refresh tokens (service#1691). Every
 * refresh returns a new refresh token and spends the old one, and presenting a
 * spent one is treated as replay: the service revokes the WHOLE login. So two
 * refreshes racing on one refresh token log the user out. They race easily —
 * concurrent `ensureAuth()` calls in one process, or the plugin and pmctl
 * sharing one OS credential store — so a refresh is single-flight twice over:
 *
 *   1. in-process: concurrent callers on one TokenStore share one in-flight
 *      refresh promise;
 *   2. cross-process: the refresh runs under a RefreshLock (a lock file by
 *      default, see FileRefreshLock), and RE-READS the store after taking it —
 *      if another process refreshed meanwhile, its tokens are used and no
 *      request is sent.
 *
 * Policy (Book part-08 §03): refresh proactively when the access token has
 * under ~5 min left; a refused refresh (`invalid_grant`) wipes the stored
 * session and forces a re-login; logout revokes the refresh token and wipes
 * the local session even when the revoke fails.
 *
 * Token material is never logged. No LLM/provider SDK.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { ReauthRequiredError, type DeviceCodeAuth } from "./device-code.js";
import type { TokenStore } from "./token-store.js";
import type { TokenResponse } from "./types.js";

/** Mutual exclusion for a refresh, across every process that shares a credential store. */
export interface RefreshLock {
  /** Run `fn` while holding the lock named `key`; release it however `fn` ends. */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/** No cross-process exclusion: for stores no other process can see (in-memory, tests). */
export const IN_PROCESS_ONLY: RefreshLock = { withLock: (_key, fn) => fn() };

export interface FileRefreshLockOptions {
  /** Directory holding the lock files (created 0700 if missing). */
  dir: string;
  /** A lock older than this, or held by a dead pid, is broken (default 60 s). */
  staleMs?: number;
  /** Give up waiting after this long (default 90 s). */
  timeoutMs?: number;
  /** Poll interval while waiting (default 100 ms). */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface LockRecord {
  pid: number;
  at: number;
  nonce: string;
}

/**
 * Cross-process lock built on `open(path, 'wx')` (O_CREAT|O_EXCL), which is
 * atomic on local filesystems on every platform Node supports. No native
 * addon, no dependency. A holder that crashed leaves a file naming a dead pid
 * (or an old timestamp); the next waiter breaks it. Release removes the file
 * only if it still carries this holder's nonce, so a holder whose lock was
 * broken as stale never deletes its successor's.
 */
export class FileRefreshLock implements RefreshLock {
  private readonly dir: string;
  private readonly staleMs: number;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: FileRefreshLockOptions) {
    this.dir = opts.dir;
    this.staleMs = opts.staleMs ?? 60_000;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.pollMs = opts.pollMs ?? 100;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The lock file used for `key` (exposed for tests and diagnostics). */
  pathFor(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
    return join(this.dir, `refresh-${digest}.lock`);
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const file = this.pathFor(key);
    const nonce = await this.acquire(file);
    try {
      return await fn();
    } finally {
      await this.release(file, nonce);
    }
  }

  private async acquire(file: string): Promise<string> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const nonce = randomUUID();
      try {
        const fh = await open(file, "wx", 0o600);
        try {
          const record: LockRecord = { pid: process.pid, at: Date.now(), nonce };
          await fh.writeFile(JSON.stringify(record));
        } finally {
          await fh.close();
        }
        return nonce;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      const held = await readRecord(file);
      if (held === "gone") continue; // released between our open and read
      if (held === undefined ? await this.oldFile(file) : this.isStale(held)) {
        // Stale, or unreadable for longer than a write takes (its holder died
        // mid-write): break it, but only if it is still the record we judged.
        const again = await readRecord(file);
        if (again === "gone" || sameRecord(again, held)) await rm(file, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for the token-refresh lock held by pid ${held?.pid ?? "unknown"}`);
      }
      await this.sleep(this.pollMs);
    }
  }

  private isStale(rec: LockRecord): boolean {
    if (Date.now() - rec.at > this.staleMs) return true;
    return rec.pid !== process.pid && !processAlive(rec.pid);
  }

  private async oldFile(file: string): Promise<boolean> {
    try {
      return Date.now() - (await stat(file)).mtimeMs > this.staleMs;
    } catch {
      return false;
    }
  }

  private async release(file: string, nonce: string): Promise<void> {
    const held = await readRecord(file);
    if (held !== "gone" && held?.nonce === nonce) await rm(file, { force: true });
  }
}

async function readRecord(file: string): Promise<LockRecord | undefined | "gone"> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "gone";
    throw err;
  }
  try {
    const rec = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof rec.pid === "number" && typeof rec.at === "number" && typeof rec.nonce === "string") {
      return rec as LockRecord;
    }
  } catch {
    /* fall through: unreadable */
  }
  return undefined;
}

function sameRecord(a: LockRecord | undefined | "gone", b: LockRecord | undefined): boolean {
  if (a === "gone") return false;
  if (a === undefined || b === undefined) return a === b;
  return a.nonce === b.nonce;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The lock every process sharing the default OS credential store uses: a
 * per-user directory under the OS temp dir, so the plugin and pmctl (which
 * both use `createTokenStore()`) exclude each other.
 */
export function createRefreshLock(serviceName = "production-master"): RefreshLock {
  let who: string;
  try {
    const info = userInfo();
    who = info.uid >= 0 ? String(info.uid) : info.username;
  } catch {
    who = "user";
  }
  return new FileRefreshLock({ dir: join(tmpdir(), `${serviceName}-${who}`) });
}

/** The lock key for one stored login: the store's service name plus the account slot. */
export function refreshLockKey(accountId: string, serviceName = "production-master"): string {
  return `${serviceName}:${accountId}`;
}

export interface TokenRefresherOptions {
  auth: DeviceCodeAuth;
  store: TokenStore;
  accountId: string;
  /** Cross-process exclusion (default IN_PROCESS_ONLY). */
  lock?: RefreshLock;
  /** Lock name (default `refreshLockKey(accountId)`). */
  lockKey?: string;
}

/** Outcome of `logout()`. The local session is wiped in every case. */
export interface LogoutResult {
  /** The service acknowledged revoking the refresh token. */
  revoked: boolean;
  /** Why it did not, when a revoke was attempted and failed. */
  error?: unknown;
}

// In-flight refreshes per store instance, then per account: concurrent callers
// on one store share one refresh.
const inflight = new WeakMap<TokenStore, Map<string, Promise<TokenResponse>>>();

export class TokenRefresher {
  private readonly auth: DeviceCodeAuth;
  private readonly store: TokenStore;
  private readonly accountId: string;
  private readonly lock: RefreshLock;
  private readonly lockKey: string;

  constructor(opts: TokenRefresherOptions) {
    this.auth = opts.auth;
    this.store = opts.store;
    this.accountId = opts.accountId;
    this.lock = opts.lock ?? IN_PROCESS_ONLY;
    this.lockKey = opts.lockKey ?? refreshLockKey(opts.accountId);
  }

  /**
   * Usable tokens for the account, refreshed first when under the refresh
   * skew. `undefined` means nobody is logged in. Throws ReauthRequiredError
   * when the login is over (refresh refused, or expired with no refresh
   * token); the stored session is wiped first. A transient refresh failure
   * (network, 5xx) keeps the current access token while it is still valid,
   * and throws once it is not.
   */
  async ensureFresh(cached?: TokenResponse): Promise<TokenResponse | undefined> {
    const tokens = cached ?? (await this.store.load(this.accountId));
    if (!tokens) return undefined;
    if (!this.auth.needsRefresh(tokens)) return tokens;
    if (!tokens.refreshToken) return this.withoutRefresh(tokens);
    try {
      return await this.refresh();
    } catch (err) {
      if (err instanceof ReauthRequiredError) throw err;
      if (!this.auth.isExpired(tokens)) return tokens;
      throw err;
    }
  }

  /**
   * Single-flight refresh of the stored login (in-process and cross-process).
   * The store is re-read under the lock, and a session that no longer needs a
   * refresh (another caller or process just did it) is returned as is.
   */
  refresh(): Promise<TokenResponse> {
    let byAccount = inflight.get(this.store);
    if (!byAccount) {
      byAccount = new Map();
      inflight.set(this.store, byAccount);
    }
    const running = byAccount.get(this.accountId);
    if (running) return running;
    const map = byAccount;
    const p = this.lock
      .withLock(this.lockKey, () => this.refreshLocked())
      .finally(() => map.delete(this.accountId));
    map.set(this.accountId, p);
    return p;
  }

  /**
   * Revoke the stored refresh token (RFC 7009) and wipe the local session.
   * The wipe happens even when the revoke fails or the service is down.
   */
  async logout(cached?: TokenResponse): Promise<LogoutResult> {
    try {
      return await this.lock.withLock(this.lockKey, async () => {
        const latest = (await this.store.load(this.accountId).catch(() => undefined)) ?? cached;
        if (!latest?.refreshToken) return { revoked: false };
        await this.auth.revoke(latest.refreshToken);
        return { revoked: true };
      });
    } catch (error) {
      return { revoked: false, error };
    } finally {
      await this.store.clear(this.accountId);
    }
  }

  private async refreshLocked(): Promise<TokenResponse> {
    // Re-read under the lock: another process (or an earlier caller here) may
    // have refreshed already, spending the token we were handed.
    const latest = await this.store.load(this.accountId);
    if (!latest) throw new ReauthRequiredError("not authenticated — call login() first.");
    if (!this.auth.needsRefresh(latest)) return latest;
    if (!latest.refreshToken) return this.withoutRefresh(latest);
    let next: TokenResponse;
    try {
      next = await this.auth.refresh(latest);
    } catch (err) {
      if (err instanceof ReauthRequiredError) await this.store.clear(this.accountId);
      throw err;
    }
    await this.store.save(this.accountId, next);
    return next;
  }

  /** A session with no refresh token lives until it expires, then is over. */
  private async withoutRefresh(tokens: TokenResponse): Promise<TokenResponse> {
    if (!this.auth.isExpired(tokens)) return tokens;
    await this.store.clear(this.accountId);
    throw new ReauthRequiredError();
  }
}
