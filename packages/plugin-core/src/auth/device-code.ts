/**
 * DeviceCodeAuth — RFC 8628 device-authorization-grant client, plus the token
 * lifecycle the service serves since v1.7 (service#1691).
 *
 * start()   -> { userCode, verificationUri(Complete), interval, expiresIn };
 *              honours `429 rate_limited` + `retry-after`.
 * poll()    -> respects `interval` (and slow_down backoff), returns tokens on
 *              status 'tokens'.
 * waitForTokens() -> drives poll() to completion, never faster than interval.
 * refresh() -> RFC 6749 §6 refresh grant. Each response carries a NEW refresh
 *              token; the old one is spent. `invalid_grant` throws
 *              ReauthRequiredError (log in again).
 * revoke()  -> RFC 7009: revoke a refresh token, ending its login server-side.
 * needsRefresh() / isExpired() -> proactive-refresh and hard-expiry tests.
 *
 * refresh() is a single HTTP exchange and is NOT safe to call concurrently
 * with one refresh token: the service treats the second use as replay and
 * revokes the whole login. Callers go through TokenRefresher (`./refresh.ts`),
 * which makes it single-flight in-process and across processes.
 *
 * Wire format (RFC 8628 / RFC 6749 snake_case) lives in `./wire.ts` and is
 * checked against the service's OpenAPI spec. Transport + clock + sleep are
 * injected so the whole flow is deterministic in tests against the in-memory
 * mock auth server (no real network, no lockout). No LLM/provider SDK.
 */
import type { HttpResponse, HttpTransport } from "../service/types.js";
import type { Scope } from "../types.js";
import type { DeviceStartResponse, PollResult, TokenResponse } from "./types.js";
import {
  deviceAuthorizationRequest,
  deviceTokenRequest,
  oauthErrorCode,
  parseDeviceAuthorizationResponse,
  parseTokenResponse,
  refreshTokenRequest,
  tokenRevocationRequest,
} from "./wire.js";

/**
 * The stored login can no longer be used: the refresh token was refused
 * (`invalid_grant`: revoked, replayed, past its 30-day cap, or the login was
 * ended elsewhere) or the session expired with nothing to refresh it with.
 * The only way forward is a new device-code login.
 */
export class ReauthRequiredError extends Error {
  constructor(message = "not authenticated — the session expired; log in again.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export interface DeviceCodeAuthOptions {
  transport: HttpTransport;
  clientId: string;
  scopes: Scope[];
  /** Injectable now() in ms (default Date.now). */
  now?: () => number;
  /** Injectable sleep (default real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Treat a session as expired this long before its real expiry (default 60 s). */
  expirySkewMs?: number;
  /**
   * Refresh proactively once the access token has less than this left
   * (default 5 min; the service mints 900 s access tokens).
   */
  refreshSkewMs?: number;
  /** Attempts at /oauth/device when it answers 429 rate_limited (default 3). */
  maxStartAttempts?: number;
  /** Longest `retry-after` start() will wait out before giving up (default 60 s). */
  maxRetryAfterMs?: number;
}

const ONE_MIN_MS = 60 * 1000;
const FIVE_MIN_MS = 5 * ONE_MIN_MS;

export class DeviceCodeAuth {
  private readonly transport: HttpTransport;
  private readonly clientId: string;
  private readonly scopes: Scope[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly expirySkewMs: number;
  private readonly refreshSkewMs: number;
  private readonly maxStartAttempts: number;
  private readonly maxRetryAfterMs: number;

  private deviceCode: string | undefined;
  private interval = 5; // seconds
  private deviceExpiresAt = 0;

  constructor(opts: DeviceCodeAuthOptions) {
    this.transport = opts.transport;
    this.clientId = opts.clientId;
    this.scopes = opts.scopes;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.expirySkewMs = opts.expirySkewMs ?? ONE_MIN_MS;
    this.refreshSkewMs = opts.refreshSkewMs ?? FIVE_MIN_MS;
    this.maxStartAttempts = Math.max(1, opts.maxStartAttempts ?? 3);
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? ONE_MIN_MS;
  }

  async start(): Promise<DeviceStartResponse> {
    let res = await this.requestDeviceCode();
    // 429 rate_limited (service#1744): too many starts from this client IP.
    // Wait the advertised `retry-after` and start again, a bounded number of
    // times; a wait longer than maxRetryAfterMs is reported, not slept through.
    for (let attempt = 1; res.status === 429 && attempt < this.maxStartAttempts; attempt++) {
      const waitMs = retryAfterMs(res);
      if (waitMs === undefined || waitMs > this.maxRetryAfterMs) break;
      await this.sleep(waitMs);
      res = await this.requestDeviceCode();
    }
    if (res.status === 429) {
      const waitMs = retryAfterMs(res);
      const hint = waitMs === undefined ? "" : `; try again in ${Math.ceil(waitMs / 1000)} s`;
      throw new Error(`device start failed: 429${oauthErrorSuffix(res.body)}${hint}`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`device start failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
    const start = parseDeviceAuthorizationResponse(res.body);
    this.deviceCode = start.deviceCode;
    this.interval = Math.max(1, start.interval);
    this.deviceExpiresAt = this.now() + start.expiresIn * 1000;
    return start;
  }

  /** One poll tick. Never call faster than `this.interval` seconds yourself. */
  async poll(): Promise<PollResult> {
    if (!this.deviceCode) throw new Error("poll() called before start()");
    if (this.now() >= this.deviceExpiresAt) return { status: "expired" };

    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: deviceTokenRequest(this.clientId, this.deviceCode),
    });

    if (res.status >= 200 && res.status < 300) {
      return {
        status: "tokens",
        tokens: parseTokenResponse(res.body, this.now(), this.scopes, this.clientId),
      };
    }
    const err = (res.body as { error?: unknown } | undefined)?.error;
    switch (err) {
      case "authorization_pending":
        return { status: "pending" };
      case "slow_down":
        this.interval += 5;
        return { status: "slow_down", interval: this.interval };
      case "access_denied":
        return { status: "denied" };
      case "expired_token":
        return { status: "expired" };
      default:
        // Anything else (invalid_request, invalid_grant, a 5xx, a non-OAuth
        // body) is a real failure. It used to be treated as "pending", which
        // turned a contract mismatch into a silent poll-until-expiry.
        throw new Error(`device token poll failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
  }

  /**
   * Drive poll() to a terminal state, sleeping `interval` between attempts
   * (honoring slow_down). Returns tokens or throws on denied/expired/failure.
   */
  async waitForTokens(): Promise<TokenResponse> {
    for (;;) {
      // Wait the interval BEFORE the next poll — never poll faster than allowed.
      await this.sleep(this.interval * 1000);
      const result = await this.poll();
      switch (result.status) {
        case "tokens":
          return result.tokens;
        case "pending":
          continue;
        case "slow_down":
          continue; // interval already bumped inside poll()
        case "denied":
          throw new Error("device authorization denied");
        case "expired":
          throw new Error("device code expired");
      }
    }
  }

  /**
   * One refresh_token grant (RFC 6749 §6). Returns the new session, whose
   * `refreshToken` REPLACES the one passed in (now spent). The request carries
   * the login's client_id (`current.clientId`, else this instance's). Throws
   * ReauthRequiredError on `invalid_grant`, and a plain Error on anything else
   * (network, 5xx), after which the caller cannot know whether the token was
   * spent.
   *
   * Not single-flight by itself: go through TokenRefresher.
   */
  async refresh(
    current: Pick<TokenResponse, "refreshToken" | "scopes" | "clientId">,
  ): Promise<TokenResponse> {
    if (!current.refreshToken) throw new ReauthRequiredError();
    const clientId = current.clientId ?? this.clientId;
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: refreshTokenRequest(clientId, current.refreshToken),
    });
    if (res.status >= 200 && res.status < 300) {
      return parseTokenResponse(res.body, this.now(), current.scopes, clientId);
    }
    if (oauthErrorCode(res.body) === "invalid_grant") {
      throw new ReauthRequiredError(
        "not authenticated — the session can no longer be refreshed; log in again.",
      );
    }
    throw new Error(`token refresh failed: ${res.status}${oauthErrorSuffix(res.body)}`);
  }

  /**
   * Revoke a refresh token (RFC 7009), ending its whole login server-side.
   * The service answers 200 whether or not the token existed; any other status
   * throws.
   */
  async revoke(refreshToken: string): Promise<void> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/revoke",
      body: tokenRevocationRequest(refreshToken),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`token revoke failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
  }

  /** True when the access token has less than the refresh skew (5 min) left. */
  needsRefresh(tokens: Pick<TokenResponse, "expiresAt">): boolean {
    return tokens.expiresAt - this.now() <= this.refreshSkewMs;
  }

  /** True when the session is at (or within the skew of) its expiry. */
  isExpired(tokens: Pick<TokenResponse, "expiresAt">): boolean {
    return tokens.expiresAt - this.now() <= this.expirySkewMs;
  }

  private requestDeviceCode(): Promise<HttpResponse> {
    return this.transport.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: deviceAuthorizationRequest(this.clientId, this.scopes),
    });
  }
}

function oauthErrorSuffix(body: unknown): string {
  const err = oauthErrorCode(body);
  return err ? ` (${err})` : "";
}

/** `retry-after` of a response in milliseconds (whole seconds on the wire), if usable. */
function retryAfterMs(res: HttpResponse): number | undefined {
  const raw = res.headers?.["retry-after"];
  if (raw === undefined) return undefined;
  const sec = Number(raw.trim());
  return Number.isFinite(sec) && sec >= 0 ? Math.ceil(sec) * 1000 : undefined;
}
