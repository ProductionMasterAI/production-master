/**
 * Regression guard: every path template `ServiceClient` (plugin-core) emits must
 * be a route the pm-service surface actually serves — derived from the service's
 * OpenAPI spec, not a hand-maintained copy.
 *
 * The per-host conformance suite (`packages/conformance`) only asserts
 * adapter<->adapter parity over FAKE transports — it never checks these
 * hardcoded ServiceClient paths against what the service serves. That gap let
 * PRD-11 path drift ship undetected: ServiceClient was calling
 * `/v1/investigations/{id}/events` and `/v1/runs/{id}/actions`, which the BFF
 * never served (fixed in #115). This test fails loudly if that recurs.
 *
 * How the allowed-route set is built (this file, #118):
 *   1. OPENAPI_ROUTES — parsed from the vendored `__fixtures__/edge-api-v1.yaml`
 *      by the dependency-free `extractRoutes` helper. This is the authoritative
 *      edge-api v1 route surface.
 *   2. CROSS_SERVICE_ROUTES — four routes ServiceClient emits that are served by
 *      SIBLING services or are read projections, so they are intentionally NOT
 *      in edge-api-v1.yaml (see the set below for the per-route justification).
 *   allowed = OPENAPI_ROUTES ∪ CROSS_SERVICE_ROUTES.
 *
 * Vendored fixture provenance:
 *   `src/service/__fixtures__/edge-api-v1.yaml` is a byte-identical copy of
 *   `production-master-service/tools/openapi/edge-api-v1.yaml` (the sibling
 *   backend repo, not checked out in CI). The freshness test below asserts the
 *   copy is current whenever the sibling source is present; when it is absent
 *   (CI, where only this repo is checked out) it skips cleanly. Re-vendor with:
 *     cp ../production-master-service/tools/openapi/edge-api-v1.yaml \
 *        packages/plugin-core/src/service/__fixtures__/edge-api-v1.yaml
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ServiceClient } from './client.js';
import { extractRoutes } from './openapi-routes.js';
import type { HttpRequest, HttpResponse, HttpTransport } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDORED_SPEC = resolve(HERE, './__fixtures__/edge-api-v1.yaml');
// packages/plugin-core/src/service -> repo root is four levels up.
const PLUGIN_REPO_ROOT = resolve(HERE, '../../../..');
const SIBLING_SPEC = resolve(
  PLUGIN_REPO_ROOT,
  '../production-master-service/tools/openapi/edge-api-v1.yaml',
);

/** Stand-in for path params; encodeURIComponent leaves it unchanged. */
const SENTINEL_ID = '__pmid__';

/** OpenAPI-derived route surface (the authoritative edge-api v1 routes). */
const OPENAPI_ROUTES: ReadonlySet<string> = extractRoutes(readFileSync(VENDORED_SPEC, 'utf8'));

/**
 * Routes ServiceClient emits that are intentionally NOT in edge-api-v1.yaml.
 * Each is served by a sibling service or is a read projection. Confirmed
 * against the live BFF in PRs #115/#116 — these are correct, not drift.
 *
 * This set must stay MINIMAL: the tests below assert (a) every entry is
 * actually emitted by an invoker, and (b) it is disjoint from the OpenAPI set —
 * so if the service later adds one of these to edge-api-v1.yaml, the disjoint
 * check fails and tells you to delete the now-redundant allowlist entry.
 */
const CROSS_SERVICE_ROUTES: ReadonlySet<string> = new Set([
  // Served by edge-actions (propose/approve/reject action lifecycle), not edge-api.
  'POST /v1/actions',
  'POST /v1/actions/{id}/approve',
  'POST /v1/actions/{id}/reject',
  // Q9 capability tokens — also served by edge-actions (trust-grants routes).
  'POST /v1/trust-grants',
  // Report projection — rendered artifact served outside the edge-api CRUD surface.
  'GET /v1/runs/{id}/report',
  // Presence (ephemeral, 30s TTL) — served by edge-web-bff (continuity surface),
  // never written to the AD-1 event log, so intentionally absent from edge-api.
  'POST /v1/investigations/{id}/presence',
  'GET /v1/investigations/{id}/presence',
  'DELETE /v1/investigations/{id}/presence',
]);

/** allowed = OpenAPI-derived routes ∪ documented cross-service routes. */
const ALLOWED_ROUTES: ReadonlySet<string> = new Set([...OPENAPI_ROUTES, ...CROSS_SERVICE_ROUTES]);

/** Records every request without a network; returns a benign 2xx. */
class CapturingTransport implements HttpTransport {
  readonly calls: Array<{ method: string; path: string }> = [];
  async request(opts: HttpRequest): Promise<HttpResponse> {
    this.calls.push({ method: opts.method, path: opts.path });
    return { status: 200, body: { events: [] } };
  }
}

/** Collapse a concrete path back to its template (sentinel -> `{id}`). */
function toTemplate(method: string, path: string): string {
  const norm = path
    .split('/')
    .map((seg) => (seg === SENTINEL_ID ? '{id}' : seg))
    .join('/');
  return `${method} ${norm}`;
}

/**
 * One invoker per HTTP-emitting ServiceClient method. Each drives exactly one
 * method so the capturing transport records the real {method, path} it emits.
 * The coverage test below fails if a new HTTP method is added without an entry.
 */
const INVOKERS: Record<string, (c: ServiceClient) => Promise<unknown>> = {
  createRun: (c) => c.createRun({ ticket: 'INC-1' }),
  createMcpSession: (c) => c.createMcpSession([SENTINEL_ID], ['read-investigation']),
  getRun: (c) => c.getRun(SENTINEL_ID),
  listRuns: (c) => c.listRuns(),
  rerunFromPhase: (c) => c.rerunFromPhase(SENTINEL_ID, { phaseId: 'p1' }),
  proposeAction: (c) =>
    c.proposeAction({
      runId: 'inv_1',
      type: 'restart',
      proposedBy: 'u1',
      requiresApproval: true,
    }),
  approveAction: (c) => c.approveAction(SENTINEL_ID, 'approver'),
  rejectAction: (c) => c.rejectAction(SENTINEL_ID, 'rejector', 'reason'),
  mintTrustGrant: (c) =>
    c.mintTrustGrant({
      investigationId: SENTINEL_ID,
      riskClass: 'low',
      reversibility: 'reversible',
      grantedBy: 'approver',
      ttlMinutes: 60,
    }),
  getReport: (c) => c.getReport(SENTINEL_ID),
  getEventSlice: (c) => c.getEventSlice(SENTINEL_ID),
  attachPresence: (c) => c.attachPresence(SENTINEL_ID, 'pmctl'),
  getPresence: (c) => c.getPresence(SENTINEL_ID),
  detachPresence: (c) => c.detachPresence(SENTINEL_ID, 'pmctl'),
};

/** Prototype members that are not HTTP calls (ctor + private helpers). */
const NON_HTTP_METHODS = new Set([
  'constructor',
  'authHeaders',
  'mapError',
  'ok',
  'presencePath',
]);

function newClient(transport: HttpTransport): ServiceClient {
  return new ServiceClient({ transport, newIdempotencyKey: () => 'k' });
}

/** Drive every invoker and collect the set of `METHOD {template}` it emits. */
async function collectEmittedTemplates(): Promise<Set<string>> {
  const emitted = new Set<string>();
  for (const invoke of Object.values(INVOKERS)) {
    const transport = new CapturingTransport();
    await invoke(newClient(transport));
    for (const call of transport.calls) emitted.add(toTemplate(call.method, call.path));
  }
  return emitted;
}

describe('ServiceClient <-> pm-service route parity', () => {
  it('has an invoker for every HTTP-emitting ServiceClient method', () => {
    const httpMethods = Object.getOwnPropertyNames(ServiceClient.prototype).filter(
      (m) => !NON_HTTP_METHODS.has(m),
    );
    // If this fails, a new ServiceClient method was added: give it an INVOKERS
    // entry so its path is parity-checked (or add it to NON_HTTP_METHODS).
    expect(new Set(httpMethods)).toEqual(new Set(Object.keys(INVOKERS)));
  });

  it('parses a non-empty OpenAPI route surface from the vendored spec', () => {
    // Sanity: a malformed vendored fixture must fail loudly, not silently allow
    // everything. extractRoutes throws on an empty/baseless spec; assert it
    // yielded the expected canonical routes too.
    expect(OPENAPI_ROUTES.size).toBeGreaterThan(0);
    expect(OPENAPI_ROUTES.has('POST /v1/runs')).toBe(true);
    expect(OPENAPI_ROUTES.has('GET /v1/runs/{id}/events')).toBe(true);
    expect(OPENAPI_ROUTES.has('POST /v1/mcp/sessions')).toBe(true);
  });

  it('emits only paths the pm-service actually serves', async () => {
    const emitted = await collectEmittedTemplates();
    const drift = [...emitted].filter((t) => !ALLOWED_ROUTES.has(t));
    expect(drift, `ServiceClient paths not served by pm-service:\n${drift.join('\n')}`).toEqual([]);
  });

  it('guards the exact PRD-11 drift that shipped', () => {
    // The paths ServiceClient wrongly used before #115 — the allowed set must
    // not contain them, so the parity test above rejects them if they return.
    expect(ALLOWED_ROUTES.has('GET /v1/investigations/{id}/events')).toBe(false);
    expect(ALLOWED_ROUTES.has('POST /v1/runs/{id}/actions')).toBe(false);
  });

  it('keeps CROSS_SERVICE_ROUTES minimal — every entry is actually emitted', async () => {
    const emitted = await collectEmittedTemplates();
    const dead = [...CROSS_SERVICE_ROUTES].filter((r) => !emitted.has(r));
    expect(
      dead,
      `CROSS_SERVICE_ROUTES entries no ServiceClient invoker emits (delete them):\n${dead.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps CROSS_SERVICE_ROUTES disjoint from the OpenAPI-derived set', () => {
    // If the service later adds one of these to edge-api-v1.yaml, this fails to
    // tell you the allowlist entry is now redundant and should be deleted.
    const overlap = [...CROSS_SERVICE_ROUTES].filter((r) => OPENAPI_ROUTES.has(r));
    expect(
      overlap,
      `CROSS_SERVICE_ROUTES now in the OpenAPI spec (delete the allowlist entry):\n${overlap.join('\n')}`,
    ).toEqual([]);
  });

  it('vendored OpenAPI fixture is byte-identical to the sibling source (when present)', () => {
    if (!existsSync(SIBLING_SPEC)) {
      // Sibling backend repo not checked out (e.g. CI runs this repo alone).
      // Skip cleanly — never fail — and log why.
      console.info(
        `[parity] freshness check skipped: sibling spec not found at ${SIBLING_SPEC} ` +
          '(production-master-service not checked out — expected in single-repo CI).',
      );
      return;
    }
    const vendored = readFileSync(VENDORED_SPEC, 'utf8');
    const sibling = readFileSync(SIBLING_SPEC, 'utf8');
    expect(
      vendored,
      'Vendored edge-api-v1.yaml is stale. Re-copy from production-master-service/tools/openapi/edge-api-v1.yaml.',
    ).toBe(sibling);
  });
});
