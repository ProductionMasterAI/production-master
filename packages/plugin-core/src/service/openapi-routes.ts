/**
 * Dependency-free OpenAPI path extractor (test helper).
 *
 * Parses the pm-service edge-api OpenAPI document (a plain, regularly-indented
 * OpenAPI 3.x YAML) into the set of `"<METHOD> <base><path>"` route strings the
 * service serves, e.g. `POST /v1/runs`. This exists so the ServiceClient parity
 * guard derives its allowed-route set from the vendored spec instead of a
 * hand-copied list that silently drifts.
 *
 * Why NO YAML npm dependency: adding one would (a) violate the thin-client
 * guard's spirit (plugin-core stays dependency-lean) and (b) churn the lockfile.
 * The edge-api spec is hand-authored with predictable two-space indentation, so
 * a small line scanner is sufficient and fully deterministic.
 *
 * This parser is intentionally narrow — it understands ONLY the shape of
 * `edge-api-v1.yaml`:
 *   servers:
 *     - url: /v1                 # single server base, read from servers[0].url
 *   paths:
 *     /runs:                     # top-level path key: `^  (/\S+):`
 *       post:                    # HTTP method:        `^    (get|post|...):`
 *         summary: ...
 *     /runs/{id}/events:
 *       get: ...
 *
 * It does NOT resolve `$ref`, multiple servers, or path-level `parameters`.
 * If the spec ever grows those, this helper (and the parity test) must be
 * revisited — a loud failure is preferred over a silent wrong answer, hence the
 * guards in `extractRoutes`.
 */

/** HTTP methods recognised as operations under a path item. */
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

/**
 * Read `servers[0].url` from the document. Returns the trimmed base (e.g.
 * `/v1`) or `undefined` when no server url is present.
 */
export function extractServerBase(yaml: string): string | undefined {
  const lines = yaml.split('\n');
  let inServers = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    // Top-level `servers:` key (column 0).
    if (/^servers:\s*$/.test(line)) {
      inServers = true;
      continue;
    }
    if (inServers) {
      // A new top-level key (column 0, non-space) ends the servers block.
      if (/^\S/.test(line)) break;
      // First `- url: <base>` list entry wins (servers[0]).
      const m = line.match(/^\s*-\s*url:\s*(\S+)\s*$/);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

/**
 * Extract the set of `"<METHOD> <base><path>"` route strings from the OpenAPI
 * document. `<METHOD>` is upper-cased; `<base>` is `servers[0].url`.
 *
 * Throws when the document is malformed for our purposes — no `/v1`-style
 * server base, or a `paths:` block that yields zero routes. A malformed
 * vendored fixture must fail loudly rather than silently pass parity.
 */
export function extractRoutes(yaml: string): Set<string> {
  const base = extractServerBase(yaml);
  if (!base || !base.startsWith('/')) {
    throw new Error(
      `openapi-routes: could not read a '/'-prefixed servers[0].url base (got: ${String(base)})`,
    );
  }

  const lines = yaml.split('\n');
  const routes = new Set<string>();
  let inPaths = false;
  let currentPath: string | undefined;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.trim().length === 0) continue;

    // Top-level `paths:` key (column 0).
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;

    // A new top-level key (column 0, non-space) ends the paths block.
    if (/^\S/.test(line)) break;

    // Path key at two-space indent: `  /runs:` or `  /runs/{id}/events:`.
    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    // HTTP method at four-space indent under the current path: `    post:`.
    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (methodMatch && currentPath && HTTP_METHODS.has(methodMatch[1])) {
      routes.add(`${methodMatch[1].toUpperCase()} ${base}${currentPath}`);
    }
  }

  if (routes.size === 0) {
    throw new Error('openapi-routes: parsed zero routes from the paths: block (malformed spec?)');
  }
  return routes;
}
