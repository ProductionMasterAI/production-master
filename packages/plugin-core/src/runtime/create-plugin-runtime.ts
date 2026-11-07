/**
 * createPluginRuntime — the single composition root for every thin-client host.
 *
 * A per-IDE adapter supplies ONLY its `HostAdapter` sinks (register-MCP, render,
 * confirm-mutation, open-URL) plus connection config, and gets back a runtime
 * that can:
 *   - `login()`     — device-code grant (RFC 8628) → tokens in the keychain,
 *                     refreshed proactively before each command (RFC 6749 §6),
 *   - `investigate()` — start a hosted run (`POST /v1/runs` → worker fleet) and
 *                       stream its SSE into the host's render sink,
 *   - `connect()`   — replay + subscribe to an existing run (AD-9 continuity),
 *   - `update()`    — idempotent `investigation.*` mutation, preview-gated.
 *
 * This wires the already-built auth / session / transport / runner modules
 * together so no adapter re-implements protocol, projection, or rendering. It
 * targets ONLY the Streamable-HTTP service session (Mode B, AD-7 runtime
 * clause) — never the stdio toolkit MCP. NO LLM/provider SDK, no local pipeline
 * (enforced by validate-no-llm-sdk.sh).
 */
import { ServiceClient } from "../service/client.js";
import { NodeHttpTransport } from "../service/node-transport.js";
import { NodeSseConnector } from "../stream/node-sse-connector.js";
import { RemoteServiceRunner } from "../runner/remote-runner.js";
import { McpSessionManager } from "../mcp/session-manager.js";
import { McpTools } from "../mcp/tools.js";
import { HttpMcpToolTransport } from "../mcp/http-transport.js";
import { DeviceCodeAuth, ReauthRequiredError } from "../auth/device-code.js";
import { createTokenStore } from "../auth/create-token-store.js";
import {
  IN_PROCESS_ONLY,
  TokenRefresher,
  createRefreshLock,
  refreshLockKey,
  type RefreshLock,
} from "../auth/refresh.js";
import type { TokenStore } from "../auth/token-store.js";
import type { TokenResponse } from "../auth/types.js";
import type { HostAdapter } from "../host/host-adapter.js";
import type { Scope } from "../types.js";
import type { CreateRunRequest, HttpTransport } from "../service/types.js";
import type { RemoteRunResult, StreamOptions } from "../runner/remote-runner.js";
import type { SseConnector } from "../stream/event-stream.js";
import type {
  AuditSink,
  McpSessionGrant,
  McpToolTransport,
} from "../mcp/types.js";

const DEFAULT_SCOPES: Scope[] = [
  "read-investigation",
  "write-investigation",
  "approve-action",
];

/** Connection + identity config. Every field falls back to a PM_* env var. */
export interface PluginRuntimeConfig {
  /** Base URL of the edge-api service (`PM_SERVICE_URL`). Required. */
  serviceUrl?: string;
  /**
   * Streamable-HTTP MCP gateway base URL (`PM_MCP_GATEWAY_URL`). Defaults to
   * `serviceUrl` when omitted (single-host deployments).
   */
  mcpGatewayUrl?: string;
  /** Device-code client id (`PM_CLIENT_ID`, default `pm-plugin`). */
  clientId?: string;
  /**
   * Scopes for the per-investigation MCP session mint (default
   * read+write+approve). These are plugin session scopes, not service OAuth
   * scopes, so the device login sends NO `scope`: the grant then carries the
   * user's own live roles (a narrowed device token is refused on
   * identity-only routes with 403 insufficient_scope).
   */
  scopes?: Scope[];
  /** Keychain account slot (`PM_ACCOUNT_ID`, default `default`). */
  accountId?: string;
  /** Presence surface label attached to streamed runs (default `plugin`). */
  surface?: string;
  /**
   * Optional MCP-session TTL request, sent as `ttlSeconds` on the mint. The
   * service defaults to 300 s and caps at 300 s (a longer request is a 400, so
   * keep this at or under 300); the plugin re-mints shortly before the granted
   * expiry either way, and never extends beyond what is granted.
   */
  sessionTtlSeconds?: number;
}

/**
 * Injectable seams. All optional — real Node transports are built from config
 * when omitted. Tests (and the live-conformance tier) inject fakes/emulators.
 */
export interface PluginRuntimeDeps {
  transport?: HttpTransport;
  sseConnector?: SseConnector;
  mcpToolTransport?: McpToolTransport;
  tokenStore?: TokenStore;
  /**
   * Cross-process lock around a token refresh. Defaults to the shared lock
   * file when the default OS credential store is used (pmctl and other plugin
   * processes share it), and to in-process exclusion only when `tokenStore`
   * is injected.
   */
  refreshLock?: RefreshLock;
  /** Overrides the default `POST /v1/mcp/sessions` session mint. */
  createServiceSession?: (
    investigationIds: string[],
    scopes: Scope[],
  ) => Promise<McpSessionGrant>;
  /** Where user-facing notices go (e.g. "your account is read-only"); default stderr. */
  notify?: (message: string) => void;
  /** Client-side audit sink (e.g. user.mutation_rejected). */
  audit?: AuditSink;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newIdempotencyKey?: () => string;
}

export interface PluginRuntimeOptions {
  host: HostAdapter;
  config?: PluginRuntimeConfig;
  deps?: PluginRuntimeDeps;
}

/** Result of a successful `login()`. */
export interface LoginResult {
  accountId: string;
  scopes: Scope[];
  expiresAt: number;
}

/**
 * The composed thin-client runtime. Also exposes `client` / `sessions` /
 * `tools` as escape hatches for hosts that need finer control than the four
 * high-level commands.
 */
export class PluginRuntime {
  readonly client: ServiceClient;
  readonly sessions: McpSessionManager;
  readonly tools: McpTools;

  private readonly host: HostAdapter;
  private readonly auth: DeviceCodeAuth;
  private readonly tokenStore: TokenStore;
  private readonly refresher: TokenRefresher;
  private readonly notify: (message: string) => void;
  private readonly runner: RemoteServiceRunner;
  private readonly serviceUrl: string;
  private readonly accountId: string;
  private readonly surface: string;
  private readonly scopes: Scope[];

  private currentTokens: TokenResponse | undefined;
  private accessToken: string | undefined;

  constructor(opts: PluginRuntimeOptions) {
    const config = opts.config ?? {};
    const deps = opts.deps ?? {};

    const serviceUrl = config.serviceUrl ?? process.env.PM_SERVICE_URL;
    if (!serviceUrl) {
      throw new Error(
        "createPluginRuntime: serviceUrl is required (set config.serviceUrl or PM_SERVICE_URL).",
      );
    }
    this.serviceUrl = serviceUrl.replace(/\/$/, "");
    this.host = opts.host;
    this.accountId = config.accountId ?? process.env.PM_ACCOUNT_ID ?? "default";
    this.surface = config.surface ?? "plugin";
    this.scopes = config.scopes ?? DEFAULT_SCOPES;

    const gatewayUrl =
      config.mcpGatewayUrl ?? process.env.PM_MCP_GATEWAY_URL ?? this.serviceUrl;
    const clientId =
      config.clientId ?? process.env.PM_CLIENT_ID ?? "pm-plugin";

    const transport = deps.transport ?? new NodeHttpTransport(this.serviceUrl);
    this.tokenStore = deps.tokenStore ?? createTokenStore();

    this.client = new ServiceClient({
      transport,
      getAuthToken: () => this.accessToken,
      ...(deps.newIdempotencyKey
        ? { newIdempotencyKey: deps.newIdempotencyKey }
        : {}),
    });

    this.auth = new DeviceCodeAuth({
      transport,
      clientId,
      // No `scope` on the device login: DEFAULT_SCOPES are plugin session
      // scopes, not service scopes, and would pin the login to nothing.
      scopes: [],
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    });
    this.refresher = new TokenRefresher({
      auth: this.auth,
      store: this.tokenStore,
      accountId: this.accountId,
      lock: deps.refreshLock ?? (deps.tokenStore ? IN_PROCESS_ONLY : createRefreshLock()),
      lockKey: refreshLockKey(this.accountId),
    });
    this.notify = deps.notify ?? ((message) => void process.stderr.write(`${message}\n`));

    const createServiceSession =
      deps.createServiceSession ??
      ((ids: string[], scopes: Scope[]) =>
        this.client.createMcpSession(ids, scopes, config.sessionTtlSeconds));
    this.sessions = new McpSessionManager({
      client: this.client,
      host: this.host,
      createServiceSession,
      notify: this.notify,
      ...(deps.now ? { now: deps.now } : {}),
    });

    const mcpToolTransport =
      deps.mcpToolTransport ??
      new HttpMcpToolTransport(gatewayUrl, () => this.accessToken);
    this.tools = new McpTools({
      sessions: this.sessions,
      host: this.host,
      transport: mcpToolTransport,
      ...(deps.audit ? { audit: deps.audit } : {}),
      ...(deps.newIdempotencyKey
        ? { newIdempotencyKey: deps.newIdempotencyKey }
        : {}),
    });

    this.runner = new RemoteServiceRunner({
      client: this.client,
      host: this.host,
      connector: deps.sseConnector ?? new NodeSseConnector(),
      streamUrlFor: (id) =>
        new URL(
          `/v1/runs/${encodeURIComponent(id)}/stream`,
          `${this.serviceUrl}/`,
        ).toString(),
      authHeader: () => this.accessToken,
    });
  }

  /**
   * Run the RFC-8628 device-code grant: start the flow, open the verification
   * URL via the host, poll to completion, and persist the encrypted tokens.
   */
  async login(): Promise<LoginResult> {
    const start = await this.auth.start();
    await this.host.openExternalUrl(start.verificationUriComplete);
    const tokens = await this.auth.waitForTokens();
    await this.setTokens(tokens);
    return {
      accountId: this.accountId,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    };
  }

  /**
   * Start a hosted investigation and stream it to the host's render sink until
   * a terminal event. The worker fleet runs the pipeline server-side (AD-19).
   */
  async investigate(
    req: CreateRunRequest,
    opts: StreamOptions = {},
  ): Promise<RemoteRunResult> {
    await this.ensureAuth();
    return this.runner.run(req, this.withPresence(opts));
  }

  /**
   * Attach to an existing run: mint/reuse a scoped session, replay the durable
   * event slice, then subscribe live and render (AD-9 continuity).
   */
  async connect(
    investigationId: string,
    opts: StreamOptions = {},
  ): Promise<RemoteRunResult> {
    await this.ensureAuth();
    await this.ensureSession([investigationId]);
    const slice = await this.client.getEventSlice(investigationId, 0);
    return this.runner.attach(investigationId, {
      ...this.withPresence(opts),
      replaySlice: slice.events,
    });
  }

  /**
   * Invoke an idempotent `investigation.*` mutation tool. Mutations are
   * preview-gated by the host; a reject throws USER_REJECTED_CONFIRMATION and
   * never reaches the service.
   */
  async update(
    investigationId: string,
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureAuth();
    await this.ensureSession([investigationId]);
    return this.tools.invoke(tool, { investigationId, ...args });
  }

  /**
   * Discard the active MCP session, revoke the refresh token server-side
   * (`POST /v1/oauth/revoke`, RFC 7009) and wipe the stored tokens. The local
   * wipe happens even when the revoke fails, so no orphaned secret survives;
   * a failed revoke is reported through `notify`.
   */
  async logout(): Promise<void> {
    this.sessions.discard();
    const cached = this.currentTokens;
    this.currentTokens = undefined;
    this.accessToken = undefined;
    const result = await this.refresher.logout(cached);
    if (result.error !== undefined) {
      const why = result.error instanceof Error ? result.error.message : String(result.error);
      this.notify(
        `Logged out locally, but the server-side revoke failed (${why}); the login expires on its own.`,
      );
    }
  }

  private withPresence(opts: StreamOptions): StreamOptions {
    if (opts.presence) return opts;
    return { ...opts, presence: { surface: this.surface } };
  }

  /** Cache + persist tokens after a login. */
  private async setTokens(tokens: TokenResponse): Promise<void> {
    this.currentTokens = tokens;
    this.accessToken = tokens.accessToken;
    await this.tokenStore.save(this.accountId, tokens);
  }

  /**
   * Ensure a usable access token: hydrate from the store on first use, and
   * refresh it when under ~5 min remain (single-flight, see TokenRefresher).
   * Throws "not authenticated" when the user never logged in, or the login is
   * over (refresh refused with invalid_grant, or expired with no refresh
   * token); the stored session is wiped and the user is told to log in again
   * rather than being handed a token the service will reject mid-run.
   */
  private async ensureAuth(): Promise<void> {
    let tokens: TokenResponse | undefined;
    try {
      tokens = await this.refresher.ensureFresh(this.currentTokens);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        this.currentTokens = undefined;
        this.accessToken = undefined;
      }
      throw err;
    }
    if (!tokens) {
      throw new Error("not authenticated — call login() first.");
    }
    this.currentTokens = tokens;
    this.accessToken = tokens.accessToken;
  }

  /** Mint (or reuse) a scoped session covering the given investigation ids. */
  private async ensureSession(investigationIds: string[]): Promise<void> {
    const active = this.sessions.getActiveSession();
    const covered =
      active !== undefined &&
      investigationIds.every((id) => this.sessions.isInScope(id));
    if (!covered) {
      await this.sessions.createSession(investigationIds, this.scopes);
    } else {
      await this.sessions.ensureFresh();
    }
  }
}

/**
 * Compose the thin-client runtime for a host. The host supplies its sinks (via
 * the `HostAdapter`) and connection config; everything else — auth, session
 * scoping, transport, streaming, projection, rendering — is reused from
 * plugin-core.
 */
export function createPluginRuntime(opts: PluginRuntimeOptions): PluginRuntime {
  return new PluginRuntime(opts);
}
