/**
 * Test-only Deps builder. Wires a command against a FakeTransport (+ optional
 * FixtureConnector) and captures stdout/stderr. No network, no keychain.
 */
import {
  ServiceClient,
  DeviceCodeAuth,
  TokenStore,
  type Scope,
} from "@production-master/plugin-core";
import type { Deps } from "../deps.js";
import type { OutputFormat } from "../output.js";
import { FakeTransport, FixtureConnector } from "./fakes.js";

export interface Captured {
  out: string[];
  err: string[];
  /** Joined stdout. */
  stdout(): string;
  /** Joined stderr. */
  stderr(): string;
}

const SCOPES: Scope[] = [
  "read-investigation",
  "write-investigation",
  "approve-action",
];

export function makeDeps(opts: {
  transport: FakeTransport;
  connector?: FixtureConnector;
  output?: OutputFormat;
  token?: string;
  idempotencyKey?: string;
  tokenStore?: TokenStore;
}): { deps: Deps; cap: Captured } {
  const out: string[] = [];
  const err: string[] = [];
  const cap: Captured = {
    out,
    err,
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };

  const transport = opts.transport;
  const tokenStore = opts.tokenStore ?? new TokenStore({ issuer: "test" });
  const client = new ServiceClient({
    transport,
    getAuthToken: () => opts.token ?? "tok",
    ...(opts.idempotencyKey
      ? { newIdempotencyKey: () => opts.idempotencyKey }
      : {}),
  });

  const deps: Deps = {
    client,
    output: opts.output ?? "table",
    write: (s) => out.push(s),
    writeErr: (s) => err.push(s),
    connector: opts.connector ?? new FixtureConnector([]),
    streamUrlFor: (id) => `https://svc.test/v1/runs/${id}/stream`,
    streamHeaders: () => ({ Authorization: "Bearer tok" }),
    scheduleReconnect: (fn) => fn(), // synchronous reconnect for deterministic tests
    deviceAuth: new DeviceCodeAuth({
      transport,
      clientId: "pmctl",
      scopes: SCOPES,
    }),
    tokenStore,
    accountId: "default",
  };
  return { deps, cap };
}
