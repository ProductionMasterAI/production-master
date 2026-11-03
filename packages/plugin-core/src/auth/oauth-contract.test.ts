/**
 * Contract test: the device-code auth client against the service's OpenAPI
 * spec (`../service/__fixtures__/edge-api-v1.yaml`, a vendored copy of
 * production-master-service `tools/openapi/edge-api-v1.yaml`; the service's CI
 * fails when the two differ).
 *
 * THE REAL QUESTION: "would the hosted service accept what this client sends,
 * and can this client read what the service returns?" — asked of request AND
 * response BODIES, not just paths.
 *
 * Why it exists (#89): the client spoke camelCase (`clientId`, `deviceCode`,
 * `grantType`) while the service spoke RFC 8628 snake_case, from the day the
 * client was written. Nothing compared them: `/oauth/*` was missing from the
 * spec, the route-parity test (client-parity.test.ts, decision 079) checks
 * ServiceClient PATHS only and DeviceCodeAuth bypasses ServiceClient, and each
 * side was unit-tested against a mock of its own dialect. This test reads the
 * field names from the spec — never a hand-copied list — and fails, never
 * skips, if the spec stops describing the auth flow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { DeviceCodeAuth } from "./device-code.js";
import { MockAuthServer } from "./__fixtures__/mock-auth-server.js";
import { parseDeviceAuthorizationResponse, parseTokenResponse } from "./wire.js";

interface Schema {
  type?: string;
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
}

const spec = parse(
  readFileSync(join(__dirname, "../service/__fixtures__/edge-api-v1.yaml"), "utf8"),
) as { servers?: { url: string }[]; paths: Record<string, Record<string, unknown>> };
const BASE = spec.servers?.[0]?.url ?? "";

function op(path: string): Record<string, unknown> {
  const p = spec.paths[path]?.["post"] as Record<string, unknown> | undefined;
  if (!p) throw new Error(`spec has no POST ${path} — the auth flow fell out of the contract`);
  return p;
}
function requestSchema(path: string): Schema {
  return (op(path)["requestBody"] as { content: Record<string, { schema: Schema }> }).content["application/json"].schema;
}
function okSchema(path: string): Schema {
  const responses = op(path)["responses"] as Record<string, { content: Record<string, { schema: Schema }> }>;
  return responses["200"].content["application/json"].schema;
}

/** Minimal structural check: required present, no undeclared keys, const/type honoured. */
function violations(body: unknown, schema: Schema, where: string): string[] {
  const out: string[] = [];
  if (typeof body !== "object" || body === null) return [`${where}: not an object`];
  const o = body as Record<string, unknown>;
  for (const k of schema.required ?? []) if (!(k in o)) out.push(`${where}: missing required "${k}"`);
  for (const [k, v] of Object.entries(o)) {
    const prop = schema.properties?.[k];
    if (!prop) {
      if (schema.additionalProperties === false) out.push(`${where}: "${k}" is not in the contract`);
      continue;
    }
    if ("const" in prop && v !== prop.const) out.push(`${where}: "${k}" must be ${JSON.stringify(prop.const)}`);
    if (prop.type === "string" && typeof v !== "string") out.push(`${where}: "${k}" must be a string`);
    if (prop.type === "integer" && !Number.isInteger(v)) out.push(`${where}: "${k}" must be an integer`);
    if (prop.type === "boolean" && typeof v !== "boolean") out.push(`${where}: "${k}" must be a boolean`);
  }
  return out;
}

/** A body holding ONLY the schema's required fields, with type-appropriate values. */
function minimalBody(schema: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of schema.required ?? []) {
    const p = schema.properties?.[k] ?? {};
    out[k] = "const" in p ? p.const : p.type === "integer" ? 5 : p.type === "boolean" ? true : `x-${k}`;
  }
  return out;
}

async function runFlow(scopes: string[]): Promise<MockAuthServer> {
  const server = new MockAuthServer({ interval: 1 });
  const auth = new DeviceCodeAuth({
    transport: server,
    clientId: "pm-plugin",
    scopes: scopes as never[],
    sleep: async () => {},
  });
  await auth.start();
  server.approve();
  await auth.waitForTokens();
  return server;
}

describe("device-code auth ⟷ edge-api-v1.yaml", () => {
  it("the spec describes the device-code flow", () => {
    expect(BASE).toBe("/v1");
    for (const p of ["/oauth/device", "/oauth/token"]) {
      expect(requestSchema(p).required?.length, `${p} request`).toBeGreaterThan(0);
      expect(okSchema(p).required?.length, `${p} 200`).toBeGreaterThan(0);
    }
  });

  it.each([[["read-investigation", "approve-action"]], [[]]])(
    "every request body the client sends matches the spec (scopes %j)",
    async (scopes) => {
      const server = await runFlow(scopes);
      expect(server.received.length).toBeGreaterThanOrEqual(2);
      for (const { path, body } of server.received) {
        expect(path.startsWith(`${BASE}/`), path).toBe(true);
        const specPath = path.slice(BASE.length);
        expect(violations(body, requestSchema(specPath), `request ${specPath}`)).toEqual([]);
      }
    },
  );

  it("every path DeviceCodeAuth calls is a POST the spec serves", async () => {
    const server = await runFlow(["read-investigation"]);
    for (const { path } of server.received) expect(() => op(path.slice(BASE.length))).not.toThrow();
  });

  it("the test mock answers in the spec's shape (so it can't drift into a private dialect)", async () => {
    const server = new MockAuthServer();
    const start = await server.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: { client_id: "c", scope: "read-investigation" },
    });
    expect(violations(start.body, okSchema("/oauth/device"), "mock 200 /oauth/device")).toEqual([]);
    server.approve();
    const token = await server.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: (start.body as { device_code: string }).device_code,
        client_id: "c",
      },
    });
    expect(violations(token.body, okSchema("/oauth/token"), "mock 200 /oauth/token")).toEqual([]);
  });

  it("the parsers need nothing beyond what the spec marks required", () => {
    expect(() => parseDeviceAuthorizationResponse(minimalBody(okSchema("/oauth/device")))).not.toThrow();
    expect(() => parseTokenResponse(minimalBody(okSchema("/oauth/token")), 0, [])).not.toThrow();
  });
});
