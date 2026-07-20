/**
 * Device-code (RFC 8628) + token-storage contract types for the thin client.
 * Mirrors the pm-service auth surface (owned by @production-master/client-sdk);
 * these local definitions are the pinned surface our mock + tests assert against.
 */
import type { Scope } from '../types.js';

/** Response from POST /v1/oauth/device. */
export interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** Poll interval in seconds (RFC 8628). */
  interval: number;
  /** Seconds until the device code expires. */
  expiresIn: number;
}

/** Successful token response from POST /v1/oauth/token. */
export interface TokenResponse {
  accessToken: string;
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
