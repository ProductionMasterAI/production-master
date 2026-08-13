/**
 * Deps — the injectable surface every command runs against.
 *
 * cli.ts builds this from real Node transports (NodeHttpTransport,
 * NodeSseConnector, keychain TokenStore). Tests build it from plugin-core's
 * in-memory doubles. No command constructs network objects itself, so every
 * verb is unit-testable without a socket.
 */
import type {
  ServiceClient,
  SseConnector,
  DeviceCodeAuth,
  TokenStore,
} from "@production-master/plugin-core";
import type { OutputFormat } from "./output.js";

export interface Deps {
  /** Typed BFF client (createRun / getRun / getReport / approveAction / ...). */
  client: ServiceClient;

  /** Resolved output format. */
  output: OutputFormat;
  /** stdout sink. */
  write: (s: string) => void;
  /** stderr sink. */
  writeErr: (s: string) => void;

  // --- streaming (events --follow) ---
  /** SSE connector (Node fetch in prod; fixture replayer in tests). */
  connector: SseConnector;
  /** Builds the stream URL for a run. */
  streamUrlFor: (id: string) => string;
  /** Per-connect headers (carries the bearer token). */
  streamHeaders: () => Record<string, string>;
  /** Injectable reconnect scheduler (synchronous in tests). */
  scheduleReconnect?: (fn: () => void, ms: number) => void;
  reconnectMs?: number;
  maxReconnects?: number;

  // --- auth (login) ---
  /** RFC-8628 device-code client. */
  deviceAuth: DeviceCodeAuth;
  /** Encrypted token store (keychain seam; in-memory fallback). */
  tokenStore: TokenStore;
  /** Account key under which the session is stored. */
  accountId: string;
}
