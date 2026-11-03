/**
 * The device-code auth WIRE format — exactly what crosses HTTP to pm-service.
 *
 * Source of truth: the `/oauth/*` paths of the service's OpenAPI contract
 * (`tools/openapi/edge-api-v1.yaml`, vendored at
 * `src/service/__fixtures__/edge-api-v1.yaml`).
 * Field names are RFC 8628 / RFC 6749 snake_case. The rest of plugin-core uses
 * the camelCase domain types in `./types.ts`; this module is the ONLY place the
 * two meet, and `oauth-contract.test.ts` checks it against the vendored spec.
 *
 * Why this file exists: until #89 the client spoke a camelCase dialect
 * (`clientId`, `deviceCode`, `grantType`, …) that the service never accepted.
 * Every test passed because the client was tested only against its own
 * camelCase mock. Parsers here throw on a missing required field instead of
 * letting `undefined` flow on — `body.deviceCode` silently being undefined is
 * how that mismatch stayed invisible.
 */
import type { Scope } from "../types.js";
import type { DeviceStartResponse, TokenResponse } from "./types.js";

export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** POST /v1/oauth/device request (RFC 8628 §3.1). */
export interface DeviceAuthorizationRequestWire {
  client_id: string;
  /** Space-delimited (RFC 6749 §3.3). */
  scope?: string;
}

/** POST /v1/oauth/token request — device_code grant (RFC 8628 §3.4). */
export interface DeviceTokenRequestWire {
  grant_type: typeof DEVICE_CODE_GRANT_TYPE;
  device_code: string;
  client_id: string;
}

export function deviceAuthorizationRequest(
  clientId: string,
  scopes: readonly Scope[],
): DeviceAuthorizationRequestWire {
  const body: DeviceAuthorizationRequestWire = { client_id: clientId };
  if (scopes.length > 0) body.scope = scopes.join(" ");
  return body;
}

export function deviceTokenRequest(clientId: string, deviceCode: string): DeviceTokenRequestWire {
  return { grant_type: DEVICE_CODE_GRANT_TYPE, device_code: deviceCode, client_id: clientId };
}

function record(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`${what}: expected a JSON object, got ${body === null ? "null" : typeof body}`);
  }
  return body as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== "string" || v === "") throw new Error(`${what}: missing or empty "${key}"`);
  return v;
}

function int(o: Record<string, unknown>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`${what}: missing or invalid "${key}"`);
  }
  return v;
}

/** Parse a 200 from POST /v1/oauth/device into the domain type. Throws on a malformed body. */
export function parseDeviceAuthorizationResponse(body: unknown): DeviceStartResponse {
  const what = "device start response";
  const o = record(body, what);
  return {
    deviceCode: str(o, "device_code", what),
    userCode: str(o, "user_code", what),
    verificationUri: str(o, "verification_uri", what),
    // Required by our contract (optional in RFC 8628): hosts open it directly
    // and have no surface to display user_code separately.
    verificationUriComplete: str(o, "verification_uri_complete", what),
    interval: int(o, "interval", what),
    expiresIn: int(o, "expires_in", what),
  };
}

/**
 * Parse a 200 from POST /v1/oauth/token into the domain type.
 *
 * The service issues no refresh token (it implements no refresh grant), so
 * `refreshToken` is '' — a real state, not a masked failure: the session simply
 * ends at `expiresAt` and the user logs in again. Granted scopes come from the
 * response's `scope` when present, else the scopes that were requested.
 */
export function parseTokenResponse(
  body: unknown,
  now: number,
  requestedScopes: readonly Scope[],
): TokenResponse {
  const what = "token response";
  const o = record(body, what);
  const tokenType = str(o, "token_type", what);
  if (tokenType.toLowerCase() !== "bearer") throw new Error(`${what}: unsupported token_type "${tokenType}"`);
  const scope = typeof o["scope"] === "string" ? o["scope"].trim() : "";
  return {
    accessToken: str(o, "access_token", what),
    refreshToken: "",
    expiresAt: now + int(o, "expires_in", what) * 1000,
    scopes: scope ? (scope.split(/\s+/) as Scope[]) : [...requestedScopes],
  };
}
