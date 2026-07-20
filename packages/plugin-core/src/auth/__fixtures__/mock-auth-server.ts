/**
 * In-memory mock of the pm-service device-code auth endpoints, implemented as an
 * HttpTransport so it drops straight into DeviceCodeAuth. Deterministic: it
 * returns `authorization_pending` until `approve()` is called, then issues
 * tokens. Supports slow_down injection and refresh/revoke.
 */
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../service/types.js";
import type { Scope } from "../../types.js";

export interface MockAuthOptions {
  interval?: number;
  expiresIn?: number;
  /** Emit one slow_down before the first pending (to test backoff). */
  slowDownOnce?: boolean;
  now?: () => number;
}

export class MockAuthServer implements HttpTransport {
  private deviceCode = "dev-code-1";
  private approved = false;
  private denied = false;
  private slowDownPending: boolean;
  private interval: number;
  private expiresIn: number;
  private now: () => number;
  private revoked = new Set<string>();
  readonly pollCalls: number[] = []; // timestamps of /v1/oauth/token device polls

  constructor(opts: MockAuthOptions = {}) {
    this.interval = opts.interval ?? 5;
    this.expiresIn = opts.expiresIn ?? 600;
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
    if (req.path === "/v1/oauth/device") {
      return {
        status: 200,
        body: {
          deviceCode: this.deviceCode,
          userCode: "WXYZ-1234",
          verificationUri: "https://auth.example/device",
          verificationUriComplete: "https://auth.example/device?code=WXYZ-1234",
          interval: this.interval,
          expiresIn: this.expiresIn,
        },
      };
    }
    if (req.path === "/v1/oauth/token") {
      const body = req.body as { grantType?: string; refreshToken?: string };
      if (body.grantType === "refresh_token") {
        if (!body.refreshToken || this.revoked.has(body.refreshToken)) {
          return { status: 400, body: { error: "invalid_grant" } };
        }
        return { status: 200, body: this.tokens() };
      }
      // device_code grant
      this.pollCalls.push(this.now());
      if (this.denied) return { status: 400, body: { error: "access_denied" } };
      if (this.slowDownPending) {
        this.slowDownPending = false;
        return { status: 400, body: { error: "slow_down" } };
      }
      if (!this.approved)
        return { status: 400, body: { error: "authorization_pending" } };
      return { status: 200, body: this.tokens() };
    }
    if (req.path === "/v1/oauth/revoke") {
      const token = (req.body as { token?: string }).token;
      if (token) this.revoked.add(token);
      return { status: 200, body: {} };
    }
    return { status: 404, body: { message: `no route ${req.path}` } };
  }

  isRevoked(token: string): boolean {
    return this.revoked.has(token);
  }

  private tokens() {
    const scopes: Scope[] = [
      "read-investigation",
      "write-investigation",
      "approve-action",
    ];
    return {
      accessToken: "access-tok-abc",
      refreshToken: "refresh-tok-xyz",
      expiresAt: this.now() + 30 * 60 * 1000,
      scopes,
    };
  }
}
