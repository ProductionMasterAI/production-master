/**
 * In-memory mock of the pm-service device-code auth endpoints, implemented as an
 * HttpTransport so it drops straight into DeviceCodeAuth. Deterministic: it
 * returns `authorization_pending` until `approve()` is called, then issues a
 * token. Supports slow_down injection.
 *
 * It speaks the SERVICE's wire format (RFC 8628 snake_case, the `/oauth/*`
 * paths of edge-api-v1.yaml) and is STRICT: any request field outside the
 * contract is a 400 invalid_request, like a real server validating its input.
 * Until #89 this mock spoke a camelCase dialect the service never accepted, so
 * the client passed every test here and failed against production.
 * `oauth-contract.test.ts` checks this mock's responses against the spec too.
 */
import type { HttpRequest, HttpResponse, HttpTransport } from "../../service/types.js";
import { DEVICE_CODE_GRANT_TYPE } from "../wire.js";

export interface MockAuthOptions {
  interval?: number;
  expiresIn?: number;
  /** Lifetime of the issued access token, seconds (default 30 min). */
  tokenTtlSec?: number;
  /** Emit one slow_down before the first pending (to test backoff). */
  slowDownOnce?: boolean;
  now?: () => number;
}

const ALLOWED: Record<string, { required: string[]; optional: string[] }> = {
  "/v1/oauth/device": { required: ["client_id"], optional: ["scope"] },
  "/v1/oauth/token": { required: ["grant_type", "device_code", "client_id"], optional: [] },
};

export const MOCK_USER_CODE = "WXYZ-1234";
export const MOCK_DEVICE_CODE = "dev-code-1";

export class MockAuthServer implements HttpTransport {
  private approved = false;
  private denied = false;
  private slowDownPending: boolean;
  private interval: number;
  private expiresIn: number;
  private tokenTtlSec: number;
  private now: () => number;
  readonly pollCalls: number[] = []; // timestamps of /v1/oauth/token device polls
  /** Every request body received, for contract assertions. */
  readonly received: { path: string; body: unknown }[] = [];

  constructor(opts: MockAuthOptions = {}) {
    this.interval = opts.interval ?? 5;
    this.expiresIn = opts.expiresIn ?? 600;
    this.tokenTtlSec = opts.tokenTtlSec ?? 30 * 60;
    this.slowDownPending = opts.slowDownOnce ?? false;
    this.now = opts.now ?? (() => Date.now());
  }

  approve(): void {
    this.approved = true;
  }
  deny(): void {
    this.denied = true;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.received.push({ path: req.path, body: req.body });
    const shape = ALLOWED[req.path];
    if (!shape) return { status: 404, body: { error: "not_found" } };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const keys = Object.keys(body);
    const unknown = keys.filter((k) => !shape.required.includes(k) && !shape.optional.includes(k));
    const missing = shape.required.filter((k) => typeof body[k] !== "string" || body[k] === "");
    if (unknown.length || missing.length) {
      return {
        status: 400,
        body: {
          error: "invalid_request",
          error_description: `unknown: [${unknown.join(", ")}] missing: [${missing.join(", ")}]`,
        },
      };
    }

    if (req.path === "/v1/oauth/device") {
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

    // /v1/oauth/token — device_code grant only (the service has no refresh grant).
    if (body["grant_type"] !== DEVICE_CODE_GRANT_TYPE) {
      return { status: 400, body: { error: "unsupported_grant_type" } };
    }
    if (body["device_code"] !== MOCK_DEVICE_CODE) return { status: 400, body: { error: "invalid_grant" } };
    this.pollCalls.push(this.now());
    if (this.denied) return { status: 403, body: { error: "access_denied" } };
    if (this.slowDownPending) {
      this.slowDownPending = false;
      return { status: 429, body: { error: "slow_down" } };
    }
    if (!this.approved) return { status: 400, body: { error: "authorization_pending" } };
    return {
      status: 200,
      body: {
        access_token: "access-tok-abc",
        token_type: "Bearer",
        expires_in: this.tokenTtlSec,
        scope: "read-investigation write-investigation approve-action",
      },
    };
  }
}
