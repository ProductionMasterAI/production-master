import { describe, it, expect, vi } from 'vitest';
import { TokenStore, MultiAccountStore, Base64Cipher, InMemorySecretBackend } from './token-store.js';
import type { TokenResponse } from './types.js';

const tokens: TokenResponse = {
  accessToken: 'access-secret-123',
  refreshToken: 'refresh-secret-456',
  expiresAt: 2_000_000,
  scopes: ['read-investigation', 'write-investigation'],
};

describe('TokenStore', () => {
  it('round-trips tokens through encryption', async () => {
    const store = new TokenStore({ issuer: 'pm', now: () => 1 });
    await store.save('acct1', tokens);
    const loaded = await store.load('acct1');
    expect(loaded).toEqual(tokens);
  });

  it('stores ciphertext, not the raw token string', async () => {
    const backend = new InMemorySecretBackend();
    const store = new TokenStore({ issuer: 'pm', backend, now: () => 1 });
    await store.save('acct1', tokens);
    const raw = await backend.get('pm-session:acct1');
    expect(raw).toBeDefined();
    expect(raw).not.toContain('access-secret-123');
    expect(raw).not.toContain('refresh-secret-456');
  });

  it('clear() is idempotent and safe to call when nothing is stored', async () => {
    const store = new TokenStore({ issuer: 'pm' });
    await store.clear('missing'); // must not throw
    await store.save('a', tokens);
    await store.clear('a');
    expect(await store.load('a')).toBeUndefined();
  });

  it('lists accounts', async () => {
    const store = new TokenStore({ issuer: 'pm' });
    await store.save('a', tokens);
    await store.save('b', tokens);
    expect((await store.listAccounts()).sort()).toEqual(['a', 'b']);
  });

  it('exposes scopes without decrypting tokens', async () => {
    const store = new TokenStore({ issuer: 'pm' });
    await store.save('a', tokens);
    expect(await store.scopes('a')).toEqual(['read-investigation', 'write-investigation']);
  });
});

describe('Base64Cipher', () => {
  it('produces ciphertext distinct from plaintext and decrypts back', () => {
    const c = new Base64Cipher();
    const enc = c.encrypt('hunter2');
    expect(enc).not.toBe('hunter2');
    expect(enc.startsWith('enc:')).toBe(true);
    expect(c.decrypt(enc)).toBe('hunter2');
  });
});

describe('MultiAccountStore', () => {
  it('notifies on account switch so the prior MCP session can be torn down', async () => {
    const store = new TokenStore({ issuer: 'pm' });
    const multi = new MultiAccountStore(store);
    const onSwitch = vi.fn();
    multi.onSwitch(onSwitch);

    multi.setActiveAccount('a');
    multi.setActiveAccount('b');
    expect(onSwitch).toHaveBeenNthCalledWith(1, undefined, 'a');
    expect(onSwitch).toHaveBeenNthCalledWith(2, 'a', 'b');
  });

  it('does not re-fire when setting the same active account', () => {
    const multi = new MultiAccountStore(new TokenStore({ issuer: 'pm' }));
    const onSwitch = vi.fn();
    multi.onSwitch(onSwitch);
    multi.setActiveAccount('a');
    multi.setActiveAccount('a');
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('activeTokens returns the active account session', async () => {
    const store = new TokenStore({ issuer: 'pm' });
    await store.save('a', tokens);
    const multi = new MultiAccountStore(store);
    multi.setActiveAccount('a');
    expect(await multi.activeTokens()).toEqual(tokens);
  });
});
