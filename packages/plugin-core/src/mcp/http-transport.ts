/**
 * HttpMcpToolTransport — routes investigation.* MCP tool calls through a
 * Streamable HTTP MCP gateway instead of a local stdio process.
 *
 * Motivation (Research Decision #7): stdio MCP collapses at concurrency —
 * measured 96% failure rate at 20 simultaneous connections.  Routing through
 * a gateway enables multi-session concurrency, connection pooling, and
 * gateway-level rate limiting without changing any plugin business logic.
 *
 * Configuration:
 *   Set PM_MCP_GATEWAY_URL in the environment and source
 *   plugin/scripts/setup/mode-resolve.sh to export MCP_TRANSPORT=http before
 *   the plugin starts.  Host adapters then construct this transport and pass it
 *   to McpTools instead of a stdio transport.
 *
 * No LLM/provider SDK.
 */
import type { McpToolTransport } from './types.js';

/**
 * Transport mode for the MCP client.
 * - `"stdio"`:  spawn a local MCP server process (default for local dev).
 * - `"http"`:   route calls through the Streamable HTTP gateway (production).
 */
export type McpTransportMode = 'stdio' | 'http';

/**
 * Configuration for creating an {@link McpToolTransport} via
 * {@link createMcpToolTransport}.
 */
export interface McpClientConfig {
  /** Which wire protocol to use. */
  transport: McpTransportMode;
  /**
   * Base URL of the Streamable HTTP MCP gateway, e.g.
   * `"https://mcp.production-master.ai"`.
   * Required when `transport === "http"`.
   */
  gatewayUrl?: string;
  /**
   * Returns the bearer token sent in the `Authorization` header on every
   * gateway request.  When omitted, no authorization header is added.
   */
  getAuthToken?: () => string | undefined;
}

/**
 * Concrete HTTP implementation of {@link McpToolTransport}.
 *
 * Each {@link call} issues a single `POST` to `${gatewayUrl}/v1/mcp/call`
 * carrying the tool name, arguments, scoped session JWT, and optional
 * idempotency key.  Backed by the global `fetch` API (Node 18+ / browsers).
 *
 * Connection keep-alive is handled transparently by the runtime's HTTP/1.1
 * connection pool — no per-request spawn overhead.
 */
export class HttpMcpToolTransport implements McpToolTransport {
  private readonly gatewayUrl: string;
  private readonly getAuthToken: (() => string | undefined) | undefined;

  constructor(gatewayUrl: string, getAuthToken?: () => string | undefined) {
    this.gatewayUrl = gatewayUrl.replace(/\/$/, '');
    this.getAuthToken = getAuthToken;
  }

  async call(opts: {
    endpoint: string;
    sessionJwt: string;
    tool: string;
    args: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<{ status: number; body: unknown }> {
    const url = `${this.gatewayUrl}/v1/mcp/call`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // MCP session JWT scopes the tool call to the correct investigation.
      'X-Mcp-Session-Jwt': opts.sessionJwt,
      // The original service endpoint the session was minted against; the
      // gateway uses this to proxy to the correct MCP server replica.
      'X-Mcp-Endpoint': opts.endpoint,
    };

    const token = this.getAuthToken?.();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const body = JSON.stringify({
      tool: opts.tool,
      args: opts.args,
    });

    const res = await fetch(url, { method: 'POST', headers, body });

    let parsed: unknown;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }

    return { status: res.status, body: parsed };
  }
}

/**
 * Factory: create the right {@link McpToolTransport} from a config object.
 *
 * When `transport === "http"`, returns an {@link HttpMcpToolTransport} pointed
 * at the provided `gatewayUrl`.  The `"stdio"` variant intentionally throws —
 * stdio transports are host-specific (they spawn a process) and must be
 * constructed by the host adapter.
 *
 * ```ts
 * const transport = createMcpToolTransport({
 *   transport: 'http',
 *   gatewayUrl: process.env.PM_MCP_GATEWAY_URL!,
 *   getAuthToken: () => tokenStore.get(),
 * });
 * ```
 */
export function createMcpToolTransport(config: McpClientConfig): McpToolTransport {
  if (config.transport === 'http') {
    if (!config.gatewayUrl) {
      throw new Error(
        'McpClientConfig.gatewayUrl is required when transport is "http". ' +
          'Set PM_MCP_GATEWAY_URL in the environment.',
      );
    }
    return new HttpMcpToolTransport(config.gatewayUrl, config.getAuthToken);
  }
  // stdio: host adapter must construct and inject a stdio transport.
  throw new Error(
    'Stdio McpToolTransport must be constructed by the host adapter — ' +
      'plugin-core does not spawn processes.',
  );
}
