/**
 * DeviceCodeAuth — RFC 8628 device-authorization-grant client.
 *
 * start() -> { userCode, verificationUriComplete, interval, expiresIn }
 * poll()  -> respects `interval` (and slow_down backoff), returns tokens on
 *            status 'tokens'.
 * waitForTokens() -> drives poll() to completion, never faster than interval.
 * refresh() -> exchanges the refresh token; callers fire it when TTL < 5 min.
 *
 * Transport + clock + sleep are injected so the whole flow is deterministic in
 * tests against the in-memory mock auth server (no real network, no lockout).
 * No LLM/provider SDK.
 */
import type { HttpTransport } from "../service/types.js";
import type { Scope } from "../types.js";
import type {
  DeviceStartResponse,
  PollResult,
  TokenResponse,
} from "./types.js";

export interface DeviceCodeAuthOptions {
  transport: HttpTransport;
  clientId: string;
  scopes: Scope[];
  /** Injectable now() in ms (default Date.now). */
  now?: () => number;
  /** Injectable sleep (default real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Refresh when remaining TTL drops below this (default 5 min). */
  refreshSkewMs?: number;
}

const FIVE_MIN_MS = 5 * 60 * 1000;

export class DeviceCodeAuth {
  private readonly transport: HttpTransport;
  private readonly clientId: string;
  private readonly scopes: Scope[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly refreshSkewMs: number;

  private deviceCode: string | undefined;
  private interval = 5; // seconds
  private deviceExpiresAt = 0;

  constructor(opts: DeviceCodeAuthOptions) {
    this.transport = opts.transport;
    this.clientId = opts.clientId;
    this.scopes = opts.scopes;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.refreshSkewMs = opts.refreshSkewMs ?? FIVE_MIN_MS;
  }

  async start(): Promise<DeviceStartResponse> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: { clientId: this.clientId, scope: this.scopes.join(" ") },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`device start failed: ${res.status}`);
    }
    const body = res.body as DeviceStartResponse;
    this.deviceCode = body.deviceCode;
    this.interval = Math.max(1, body.interval);
    this.deviceExpiresAt = this.now() + body.expiresIn * 1000;
    return body;
  }

  /** One poll tick. Never call faster than `this.interval` seconds yourself. */
  async poll(): Promise<PollResult> {
    if (!this.deviceCode) throw new Error("poll() called before start()");
    if (this.now() >= this.deviceExpiresAt) return { status: "expired" };

    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
        deviceCode: this.deviceCode,
        clientId: this.clientId,
      },
    });

    if (res.status >= 200 && res.status < 300) {
      return { status: "tokens", tokens: res.body as TokenResponse };
    }
    const err = (res.body as { error?: string } | undefined)?.error;
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
        return { status: "pending" };
    }
  }

  /**
   * Drive poll() to a terminal state, sleeping `interval` between attempts
   * (honoring slow_down). Returns tokens or throws on denied/expired/timeout.
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

  /** True when the access token is within the refresh skew of expiry. */
  needsRefresh(tokens: TokenResponse): boolean {
    return tokens.expiresAt - this.now() < this.refreshSkewMs;
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grantType: "refresh_token",
        refreshToken,
        clientId: this.clientId,
      },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`refresh failed: ${res.status}`);
    }
    return res.body as TokenResponse;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.transport.request({
      method: "POST",
      path: "/v1/oauth/revoke",
      body: { token: refreshToken, clientId: this.clientId },
    });
  }
}
