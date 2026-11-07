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
  oneOf?: Schema[];
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
/** The request body shapes a path accepts: each `oneOf` branch, or the one schema. */
function requestShapes(path: string): Schema[] {
  const s = requestSchema(path);
  return s.oneOf ?? [s];
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

/** Violations against a `oneOf`: none if ANY branch accepts the body, else every branch's. */
function oneOfViolations(body: unknown, shapes: Schema[], where: string): string[] {
  const per = shapes.map((s, i) => violations(body, s, `${where} [oneOf ${i}]`));
  return per.some((v) => v.length === 0) ? [] : per.flat();
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

/** Full lifecycle: device login, one refresh, revoke on logout. */
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
  const tokens = await auth.waitForTokens();
  const next = await auth.refresh(tokens);
  await auth.revoke(next.refreshToken);
  return server;
}

describe("device-code auth ⟷ edge-api-v1.yaml", () => {
  it("the spec describes the device-code flow", () => {
    expect(BASE).toBe("/v1");
    for (const p of ["/oauth/device", "/oauth/token", "/oauth/revoke"]) {
      for (const shape of requestShapes(p)) {
        expect(shape.required?.length, `${p} request`).toBeGreaterThan(0);
      }
    }
    for (const p of ["/oauth/device", "/oauth/token"]) {
      expect(okSchema(p).required?.length, `${p} 200`).toBeGreaterThan(0);
    }
  });

  it("the spec serves both token grants and RFC 7009 revocation (v1.7, service#1691)", () => {
    const grants = requestShapes("/oauth/token").map((s) => s.properties?.["grant_type"]?.const);
    expect(grants).toEqual(
      expect.arrayContaining(["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]),
    );
    // Every token response carries the rotated refresh token.
    expect(okSchema("/oauth/token").required).toContain("refresh_token");
    expect(requestShapes("/oauth/revoke").some((s) => s.required?.includes("token"))).toBe(true);
  });

  it.each([[["read-investigation", "approve-action"]], [[]]])(
    "every request body the client sends matches the spec (scopes %j)",
    async (scopes) => {
      const server = await runFlow(scopes);
      const paths = server.received.map((r) => r.path);
      expect(paths).toEqual(expect.arrayContaining(["/v1/oauth/device", "/v1/oauth/token", "/v1/oauth/revoke"]));
      // The refresh grant was really exercised, not only the device poll.
      expect(server.refreshCalls).toHaveLength(1);
      for (const { path, body } of server.received) {
        expect(path.startsWith(`${BASE}/`), path).toBe(true);
        const specPath = path.slice(BASE.length);
        expect(oneOfViolations(body, requestShapes(specPath), `request ${specPath}`)).toEqual([]);
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
    const refreshed = await server.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grant_type: "refresh_token",
        refresh_token: (token.body as { refresh_token: string }).refresh_token,
        client_id: "c",
      },
    });
    expect(refreshed.status).toBe(200);
    expect(violations(refreshed.body, okSchema("/oauth/token"), "mock 200 refresh")).toEqual([]);
    const revoked = await server.request({
      method: "POST",
      path: "/v1/oauth/revoke",
      body: { token: (refreshed.body as { refresh_token: string }).refresh_token },
    });
    expect(revoked.status).toBe(200);
    expect(violations(revoked.body, okSchema("/oauth/revoke"), "mock 200 /oauth/revoke")).toEqual([]);
  });

  it("the mock refuses a body that matches no oneOf branch, like the service", async () => {
    const server = new MockAuthServer();
    const res = await server.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: { grant_type: "refresh_token", refresh_token: "r", device_code: "d", client_id: "c" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_request");
  });

  it("every error code the client branches on is one the spec's OAuthError allows", () => {
    const comps = (spec as unknown as {
      components: { responses: { OAuthError: { content: Record<string, { schema: Schema }> } } };
    }).components;
    const errorEnum = (comps.responses.OAuthError.content["application/json"].schema.properties?.["error"] as {
      enum?: string[];
    }).enum;
    for (const code of ["authorization_pending", "slow_down", "access_denied", "expired_token", "invalid_grant", "unsupported_grant_type"]) {
      expect(errorEnum, code).toContain(code);
    }
  });

  it("the parsers need nothing beyond what the spec marks required", () => {
    expect(() => parseDeviceAuthorizationResponse(minimalBody(okSchema("/oauth/device")))).not.toThrow();
    expect(() => parseTokenResponse(minimalBody(okSchema("/oauth/token")), 0, [])).not.toThrow();
  });
});
