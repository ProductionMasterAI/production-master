/**
 * DeviceCodeAuth — RFC 8628 device-authorization-grant client.
 *
 * start() -> { userCode, verificationUri(Complete), interval, expiresIn }
 * poll()  -> respects `interval` (and slow_down backoff), returns tokens on
 *            status 'tokens'.
 * waitForTokens() -> drives poll() to completion, never faster than interval.
 * isExpired() -> whether a stored session has (nearly) reached its expiry.
 *
 * Wire format (RFC 8628 snake_case) lives in `./wire.ts` and is checked
 * against the service's OpenAPI spec. There is no refresh(): the hosted
 * service implements no refresh grant, so a session ends at its expiry and the
 * user logs in again. (Until #89 this class carried refresh()/revoke() methods
 * calling grants the service never served.)
 *
 * Transport + clock + sleep are injected so the whole flow is deterministic in
 * tests against the in-memory mock auth server (no real network, no lockout).
 * No LLM/provider SDK.
 */
import type { HttpTransport } from "../service/types.js";
import type { Scope } from "../types.js";
import type { DeviceStartResponse, PollResult, TokenResponse } from "./types.js";
import {
  deviceAuthorizationRequest,
  deviceTokenRequest,
  parseDeviceAuthorizationResponse,
  parseTokenResponse,
} from "./wire.js";

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
}

const ONE_MIN_MS = 60 * 1000;

export class DeviceCodeAuth {
  private readonly transport: HttpTransport;
  private readonly clientId: string;
  private readonly scopes: Scope[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly expirySkewMs: number;

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
  }

  async start(): Promise<DeviceStartResponse> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: deviceAuthorizationRequest(this.clientId, this.scopes),
    });
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
      return { status: "tokens", tokens: parseTokenResponse(res.body, this.now(), this.scopes) };
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

  /** True when the session is at (or within the skew of) its expiry. */
  isExpired(tokens: Pick<TokenResponse, "expiresAt">): boolean {
    return tokens.expiresAt - this.now() <= this.expirySkewMs;
  }
}

function oauthErrorSuffix(body: unknown): string {
  const err = (body as { error?: unknown } | undefined)?.error;
  return typeof err === "string" ? ` (${err})` : "";
}
