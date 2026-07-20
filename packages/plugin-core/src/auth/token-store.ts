/**
 * Token storage for the thin client.
 *
 * Tokens are encrypted at rest and NEVER written to logs (enforced by the
 * validate-no-token-logging.sh CI guard). The actual secret backend is pluggable
 * via `SecretBackend` — production wires macOS Keychain / Windows Credential
 * Locker / libsecret; tests + the encrypted-file fallback use an injectable
 * cipher. plugin-core ships the contract + an in-memory backend; native
 * keychain bindings live in the per-IDE adapters.
 *
 * No LLM/provider SDK.
 */
import type { Scope } from '../types.js';
import type { StoredSession, TokenResponse } from './types.js';

/** A minimal secret backend: a namespaced key-value store of ciphertext. */
export interface SecretBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/** Symmetric cipher seam (production: OS keychain or libsodium; tests: stub). */
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** In-memory secret backend (default; adapters override with native keychains). */
export class InMemorySecretBackend implements SecretBackend {
  private map = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async list(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

/**
 * A reversible base64 "cipher" used as the encrypted-file fallback default when
 * no native keychain is available. It is NOT cryptographically strong — adapters
 * MUST inject a real cipher (OS keychain / libsodium) in production. It exists so
 * that token material is never stored as raw plaintext and never equals the
 * token string itself (so a log-grep guard can detect accidental leakage).
 */
export class Base64Cipher implements Cipher {
  encrypt(plaintext: string): string {
    return `enc:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  }
  decrypt(ciphertext: string): string {
    const raw = ciphertext.startsWith('enc:') ? ciphertext.slice(4) : ciphertext;
    return Buffer.from(raw, 'base64').toString('utf8');
  }
}

const KEY_PREFIX = 'pm-session:';

export interface TokenStoreOptions {
  backend?: SecretBackend;
  cipher?: Cipher;
  issuer: string;
  now?: () => number;
}

/** Persists one account's session; encrypts token material at rest. */
export class TokenStore {
  private readonly backend: SecretBackend;
  private readonly cipher: Cipher;
  private readonly issuer: string;
  private readonly now: () => number;

  constructor(opts: TokenStoreOptions) {
    this.backend = opts.backend ?? new InMemorySecretBackend();
    this.cipher = opts.cipher ?? new Base64Cipher();
    this.issuer = opts.issuer;
    this.now = opts.now ?? (() => Date.now());
  }

  private key(accountId: string): string {
    return `${KEY_PREFIX}${accountId}`;
  }

  async save(accountId: string, tokens: TokenResponse): Promise<void> {
    const session: StoredSession = {
      version: 1,
      accountId,
      issuer: this.issuer,
      accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      updatedAt: this.now(),
    };
    await this.backend.set(this.key(accountId), JSON.stringify(session));
  }

  async load(accountId: string): Promise<TokenResponse | undefined> {
    const raw = await this.backend.get(this.key(accountId));
    if (!raw) return undefined;
    const s = JSON.parse(raw) as StoredSession;
    return {
      accessToken: this.cipher.decrypt(s.accessTokenEnc),
      refreshToken: this.cipher.decrypt(s.refreshTokenEnc),
      expiresAt: s.expiresAt,
      scopes: s.scopes,
    };
  }

  async scopes(accountId: string): Promise<Scope[] | undefined> {
    const raw = await this.backend.get(this.key(accountId));
    if (!raw) return undefined;
    return (JSON.parse(raw) as StoredSession).scopes;
  }

  /** Wipe the account's session. Idempotent; safe to call on network failure. */
  async clear(accountId: string): Promise<void> {
    await this.backend.delete(this.key(accountId));
  }

  async listAccounts(): Promise<string[]> {
    const keys = await this.backend.list();
    return keys.filter((k) => k.startsWith(KEY_PREFIX)).map((k) => k.slice(KEY_PREFIX.length));
  }
}

/**
 * MultiAccountStore tracks the *active* account and notifies on switch so the
 * caller can tear down the prior MCP session (a hard requirement: switching
 * accounts must disconnect the previous scoped session).
 */
export class MultiAccountStore {
  private active: string | undefined;
  private switchListeners = new Set<(from: string | undefined, to: string) => void>();

  constructor(readonly store: TokenStore) {}

  getActiveAccount(): string | undefined {
    return this.active;
  }

  onSwitch(cb: (from: string | undefined, to: string) => void): () => void {
    this.switchListeners.add(cb);
    return () => this.switchListeners.delete(cb);
  }

  setActiveAccount(accountId: string): void {
    if (this.active === accountId) return;
    const from = this.active;
    this.active = accountId;
    for (const cb of this.switchListeners) cb(from, accountId);
  }

  async activeTokens(): Promise<TokenResponse | undefined> {
    if (!this.active) return undefined;
    return this.store.load(this.active);
  }
}
