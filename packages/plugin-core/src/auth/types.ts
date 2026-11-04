/**
 * Device-code (RFC 8628) + token-storage DOMAIN types for the thin client.
 * These are internal camelCase shapes, not the wire contract: the HTTP wire is
 * RFC 8628 snake_case, defined by the service's OpenAPI spec and mapped in
 * `./wire.ts` (checked against the vendored spec by `oauth-contract.test.ts`).
 */
import type { Scope } from '../types.js';

/**
 * Domain view of a POST /v1/oauth/device response. NOT the wire shape — the
 * wire is RFC 8628 snake_case; `./wire.ts` maps it (and is spec-tested).
 */
export interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** verificationUri with the user code pre-filled (required by our contract). */
  verificationUriComplete: string;
  /** Poll interval in seconds (RFC 8628). */
  interval: number;
  /** Seconds until the device code expires. */
  expiresIn: number;
}

/** Domain view of a successful POST /v1/oauth/token (wire mapping in `./wire.ts`). */
export interface TokenResponse {
  accessToken: string;
  /**
   * Always '' for sessions from the hosted service, which implements no refresh
   * grant yet: a session ends at `expiresAt` and the user runs /login again.
   */
  refreshToken: string;
  /** Absolute expiry, epoch milliseconds. */
  expiresAt: number;
  scopes: Scope[];
}

/** Poll outcome surfaced to callers. */
export type PollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'tokens'; tokens: TokenResponse }
  | { status: 'denied' }
  | { status: 'expired' };

/** A persisted session (encrypted token material). */
export interface StoredSession {
  version: 1;
  accountId: string;
  issuer: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  scopes: Scope[];
  expiresAt: number;
  updatedAt: number;
}
