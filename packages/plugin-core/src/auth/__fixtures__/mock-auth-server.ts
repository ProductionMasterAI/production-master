/**
 * In-memory mock of the pm-service device-code auth endpoints, implemented as an
 * HttpTransport so it drops straight into DeviceCodeAuth. Deterministic: it
 * returns `authorization_pending` until `approve()` is called, then issues a
 * token. Supports slow_down injection.
 *
 * It speaks the SERVICE's wire format (RFC 8628 / RFC 6749 snake_case, the
 * `/oauth/*` paths of edge-api-v1.yaml v1.7) and is STRICT: a request body that
 * matches none of the contract's shapes is a 400 invalid_request, like a real
 * server validating its input. Until #89 this mock spoke a camelCase dialect
 * the service never accepted, so the client passed every test here and failed
 * against production. `oauth-contract.test.ts` checks this mock's responses
 * against the spec too.
 *
 * Token lifecycle, as the service implements it (service#1691):
 *   - both grants answer with a NEW refresh token; the presented one is spent;
 *   - presenting a spent refresh token is replay: the whole login is revoked
 *     and every later refresh is `invalid_grant`;
 *   - a refresh with a client_id other than the login's is `invalid_grant`;
 *   - `/oauth/revoke` with `{token}` revokes the login, with `{device_code}`
 *     denies the device code; both answer `200 {}` whatever the token was.
 */
import type { HttpRequest, HttpResponse, HttpTransport } from "../../service/types.js";
import { DEVICE_CODE_GRANT_TYPE, REFRESH_TOKEN_GRANT_TYPE } from "../wire.js";

export interface MockAuthOptions {
  interval?: number;
  expiresIn?: number;
  /** Lifetime of the issued access token, seconds (default 900, as the service). */
  tokenTtlSec?: number;
  /** Emit one slow_down before the first pending (to test backoff). */
  slowDownOnce?: boolean;
  now?: () => number;
}

interface Shape {
  required: string[];
  optional: string[];
}

/** The request bodies the contract accepts, per path (a `oneOf` is several shapes). */
const SHAPES: Record<string, Shape[]> = {
  "/v1/oauth/device": [{ required: ["client_id"], optional: ["scope"] }],
  "/v1/oauth/token": [
    { required: ["grant_type", "device_code", "client_id"], optional: [] },
    { required: ["grant_type", "refresh_token", "client_id"], optional: [] },
  ],
  "/v1/oauth/revoke": [
    { required: ["token"], optional: ["token_type_hint", "client_id"] },
    { required: ["device_code"], optional: [] },
  ],
};

export const MOCK_USER_CODE = "WXYZ-1234";
export const MOCK_DEVICE_CODE = "dev-code-1";

function shapeErrors(body: Record<string, unknown>, shape: Shape): string[] {
  const keys = Object.keys(body);
  const unknown = keys.filter((k) => !shape.required.includes(k) && !shape.optional.includes(k));
  const missing = shape.required.filter((k) => typeof body[k] !== "string" || body[k] === "");
  return [...unknown.map((k) => `unknown ${k}`), ...missing.map((k) => `missing ${k}`)];
}

export class MockAuthServer implements HttpTransport {
  private approved = false;
  private denied = false;
  private slowDownPending: boolean;
  private interval: number;
  private expiresIn: number;
  private tokenTtlSec: number;
  private now: () => number;
  /** client_id the device login was started with (refresh must match it). */
  private loginClientId: string | undefined;
  /** The one refresh token that is currently live, if the login is. */
  private liveRefresh: string | undefined;
  private readonly spent = new Set<string>();
  private loginRevoked = false;
  private issued = 0;
  /** Status to answer `/oauth/revoke` with instead of 200 (simulates an outage). */
  revokeFailsWith: number | undefined;
  /** Status to answer refresh grants with instead of processing them (e.g. 503). */
  refreshFailsWith: number | undefined;
  /** Status + retry-after for the next N `/oauth/device` starts (429 rate_limited). */
  rateLimitStarts: { count: number; retryAfterSec: number } | undefined;
  readonly pollCalls: number[] = []; // timestamps of /v1/oauth/token device polls
  /** Every refresh grant received (the presented refresh tokens). */
  readonly refreshCalls: string[] = [];
  /** Every revoke body received. */
  readonly revokeCalls: Record<string, unknown>[] = [];
  /** Every request body received, for contract assertions. */
  readonly received: { path: string; body: unknown }[] = [];

  constructor(opts: MockAuthOptions = {}) {
    this.interval = opts.interval ?? 5;
    this.expiresIn = opts.expiresIn ?? 600;
    this.tokenTtlSec = opts.tokenTtlSec ?? 900;
    this.slowDownPending = opts.slowDownOnce ?? false;
    this.now = opts.now ?? (() => Date.now());
  }

  approve(): void {
    this.approved = true;
  }
  deny(): void {
    this.denied = true;
  }
  /** True once replay or a revoke ended the login. */
  get revoked(): boolean {
    return this.loginRevoked;
  }
  /** The refresh token the server currently accepts. */
  get currentRefreshToken(): string | undefined {
    return this.liveRefresh;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.received.push({ path: req.path, body: req.body });
    const shapes = SHAPES[req.path];
    if (!shapes) return { status: 404, body: { error: "not_found" } };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors = shapes.map((s) => shapeErrors(body, s));
    if (errors.every((e) => e.length > 0)) {
      return {
        status: 400,
        body: { error: "invalid_request", error_description: errors.map((e) => e.join(", ")).join(" | ") },
      };
    }

    if (req.path === "/v1/oauth/device") return this.deviceStart(body);
    if (req.path === "/v1/oauth/revoke") return this.revoke(body);
    if (body["grant_type"] === DEVICE_CODE_GRANT_TYPE) return this.devicePoll(body);
    if (body["grant_type"] === REFRESH_TOKEN_GRANT_TYPE) return this.refreshGrant(body);
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }

  private deviceStart(body: Record<string, unknown>): HttpResponse {
    if (this.rateLimitStarts && this.rateLimitStarts.count > 0) {
      this.rateLimitStarts.count -= 1;
      return {
        status: 429,
        body: { error: "rate_limited" },
        headers: { "retry-after": String(this.rateLimitStarts.retryAfterSec) },
      };
    }
    this.loginClientId = body["client_id"] as string;
    return {
      status: 200,
      body: {
        device_code: MOCK_DEVICE_CODE,
        user_code: MOCK_USER_CODE,
        verification_uri: "https://app.example/device",
        verification_uri_complete: `https://app.example/device?user_code=${MOCK_USER_CODE}`,
        interval: this.interval,
        expires_in: this.expiresIn,
      },
    };
  }

  private devicePoll(body: Record<string, unknown>): HttpResponse {
    if (body["device_code"] !== MOCK_DEVICE_CODE) return { status: 400, body: { error: "invalid_grant" } };
    this.pollCalls.push(this.now());
    if (this.denied) return { status: 403, body: { error: "access_denied" } };
    if (this.slowDownPending) {
      this.slowDownPending = false;
      return { status: 429, body: { error: "slow_down" } };
    }
    if (!this.approved) return { status: 400, body: { error: "authorization_pending" } };
    this.loginRevoked = false;
    this.spent.clear();
    return this.mint();
  }

  private refreshGrant(body: Record<string, unknown>): HttpResponse {
    const presented = body["refresh_token"] as string;
    this.refreshCalls.push(presented);
    if (this.refreshFailsWith !== undefined) {
      return { status: this.refreshFailsWith, body: { error: "temporarily_unavailable" } };
    }
    if (this.spent.has(presented)) {
      // Replay: revoke the whole login.
      this.loginRevoked = true;
      this.liveRefresh = undefined;
      return { status: 400, body: { error: "invalid_grant" } };
    }
    if (
      this.loginRevoked ||
      presented !== this.liveRefresh ||
      body["client_id"] !== this.loginClientId
    ) {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    this.spent.add(presented);
    return this.mint();
  }

  private revoke(body: Record<string, unknown>): HttpResponse {
    this.revokeCalls.push(body);
    if (this.revokeFailsWith !== undefined) {
      return { status: this.revokeFailsWith, body: { error: "server_error" } };
    }
    if (typeof body["token"] === "string") {
      const t = body["token"];
      if (t === this.liveRefresh || this.spent.has(t)) {
        this.loginRevoked = true;
        this.liveRefresh = undefined;
      }
    } else {
      this.denied = true;
    }
    return { status: 200, body: {} };
  }

  private mint(): HttpResponse {
    this.issued += 1;
    this.liveRefresh = `refresh-tok-${this.issued}`;
    return {
      status: 200,
      body: {
        access_token: `access-tok-${this.issued}`,
        token_type: "Bearer",
        expires_in: this.tokenTtlSec,
        refresh_token: this.liveRefresh,
        scope: "runs:read runs:write",
      },
    };
  }
}
