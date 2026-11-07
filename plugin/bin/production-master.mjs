#!/usr/bin/env node
// GENERATED FILE — do not edit by hand.
// Built by scripts/build-plugin.mjs from packages/adapter-claude-code/src/cli.ts
// and packages/plugin-core/src. Rebuild with `npm run build:plugin`; CI fails
// when this file drifts from its sources (`npm run check:plugin`).

// packages/adapter-claude-code/src/cli.ts
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

// packages/plugin-core/src/service/types.ts
var ServiceError = class extends Error {
  constructor(code, httpStatus, message) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "ServiceError";
  }
  code;
  httpStatus;
};
var InsufficientScopeError = class extends ServiceError {
  constructor(requiredScope, message) {
    super("PERMISSION_DENIED", 403, message);
    this.requiredScope = requiredScope;
    this.name = "InsufficientScopeError";
  }
  requiredScope;
};
var IdempotencyConflict = class extends ServiceError {
  constructor(message = "Idempotency key already used") {
    super("IDEMPOTENCY_CONFLICT", 409, message);
    this.name = "IdempotencyConflict";
  }
};

// packages/plugin-core/src/service/client.ts
var SERVICE_SCOPE = {
  "read-investigation": "read",
  "write-investigation": "mutate",
  "approve-action": "mutate"
};
function toServiceScopes(scopes) {
  return [...new Set(scopes.map((s) => SERVICE_SCOPE[s]))];
}
function describeMissingScope(requiredScope, serviceMessage) {
  if (requiredScope === "runs:write") {
    return `Your account does not hold runs:write, so it cannot make changes to investigations (the engineer role or above grants it). ${serviceMessage}`;
  }
  if (requiredScope === "runs:read") {
    return `Your account does not hold runs:read, so it cannot open investigations (the viewer role or above grants it; ask an org admin). ${serviceMessage}`;
  }
  return `Your account is missing a required permission${requiredScope ? ` (${requiredScope})` : ""}. ${serviceMessage}`;
}
function defaultIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
var ServiceClient = class {
  transport;
  getAuthToken;
  newIdempotencyKey;
  constructor(opts) {
    this.transport = opts.transport;
    this.getAuthToken = opts.getAuthToken ?? (() => void 0);
    this.newIdempotencyKey = opts.newIdempotencyKey ?? defaultIdempotencyKey;
  }
  authHeaders(extra) {
    const headers = { ...extra };
    const token = this.getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }
  mapError(res, context) {
    const message = res.body?.message ?? `${context} failed (${res.status})`;
    if (res.status === 409) return new IdempotencyConflict(message);
    if (res.status === 404) return new ServiceError("NOT_FOUND", 404, message);
    if (res.status === 403) {
      const body = res.body;
      if (body?.error === "insufficient_scope") {
        const requiredScope = typeof body.requiredScope === "string" ? body.requiredScope : void 0;
        return new InsufficientScopeError(
          requiredScope,
          describeMissingScope(requiredScope, message)
        );
      }
      return new ServiceError("NOT_FOUND", 404, message);
    }
    if (res.status === 402)
      return new ServiceError("BUDGET_EXHAUSTED", 402, message);
    return new ServiceError("UNKNOWN", res.status, message);
  }
  ok(res) {
    return res.status >= 200 && res.status < 300;
  }
  async createRun(req) {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/runs",
      body: req,
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey()
      })
    });
    if (!this.ok(res)) throw this.mapError(res, "createRun");
    return res.body;
  }
  /**
   * Mint a scoped MCP session for one or more investigations
   * (`POST /v1/mcp/sessions`). The returned grant carries the per-investigation
   * MCP endpoint + short-lived session JWT the thin client registers with the
   * host and stamps on every `investigation.*` tool call. Plugin scopes are
   * collapsed to the service `[read, mutate]` enum.
   */
  async createMcpSession(investigationIds, scopes, ttlSeconds) {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/mcp/sessions",
      body: {
        investigationIds,
        scopes: toServiceScopes(scopes),
        ...ttlSeconds !== void 0 ? { ttlSeconds } : {}
      },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "createMcpSession");
    return res.body;
  }
  async getRun(investigationId) {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}`,
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "getRun");
    return res.body;
  }
  async listRuns(filter = {}) {
    const res = await this.transport.request({
      method: "GET",
      path: "/v1/runs",
      query: {
        status: filter.status,
        cursor: filter.cursor,
        limit: filter.limit
      },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "listRuns");
    return res.body;
  }
  async rerunFromPhase(investigationId, req) {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/rerun-from-step`,
      body: req,
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey()
      })
    });
    if (!this.ok(res)) throw this.mapError(res, "rerunFromPhase");
    return res.body;
  }
  async proposeAction(req) {
    const idempotencyKey = this.newIdempotencyKey();
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/actions",
      body: { ...req, idempotencyKey },
      headers: this.authHeaders({ "Idempotency-Key": idempotencyKey })
    });
    if (!this.ok(res)) throw this.mapError(res, "proposeAction");
    return res.body;
  }
  async approveAction(actionId, approverId, actorRoles) {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/actions/${encodeURIComponent(actionId)}/approve`,
      body: { approverId, ...actorRoles ? { actorRoles } : {} },
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey()
      })
    });
    if (!this.ok(res)) throw this.mapError(res, "approveAction");
    return res.body;
  }
  /**
   * Reject a proposed action. Like approveAction this is PROPOSE/APPROVE-layer
   * only — it never executes a side effect. Carries an Idempotency-Key so a
   * repeat returns the original action.
   */
  async rejectAction(actionId, rejectorId, reason) {
    const res = await this.transport.request({
      method: "POST",
      path: `/v1/actions/${encodeURIComponent(actionId)}/reject`,
      body: { rejectorId, reason },
      headers: this.authHeaders({
        "Idempotency-Key": this.newIdempotencyKey()
      })
    });
    if (!this.ok(res)) throw this.mapError(res, "rejectAction");
    return res.body;
  }
  /**
   * Q9 — mint a session-scoped capability token (`POST /v1/trust-grants`). The
   * grant auto-approves later actions of the same risk × reversibility class for
   * one investigation until it expires. The service caps `ttlMinutes` at 24h and
   * is authoritative; the web Settings surface lists and revokes what this mints.
   */
  async mintTrustGrant(req) {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/trust-grants",
      body: req,
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "mintTrustGrant");
    return res.body.grant;
  }
  /** Fetch the rendered report for a run (`md` | `json` | `html`). */
  async getReport(investigationId, format = "md") {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/report`,
      query: { format },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "getReport");
    return res.body;
  }
  /** Fetch a durable slice of the event log for replay (`sequence > sinceSeq`). */
  async getEventSlice(investigationId, sinceSeq = 0) {
    const res = await this.transport.request({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(investigationId)}/events`,
      query: { sinceSeq },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "getEventSlice");
    const events = res.body.events ?? [];
    const lastSeq = events.reduce((m, e) => Math.max(m, e.sequence), sinceSeq);
    return { events, lastSeq };
  }
  // ── Presence (ephemeral, 30s TTL) ─────────────────────────────────────────
  // Presence is a live-only signal: it is NEVER carried on an Idempotency-Key
  // (a heartbeat is meant to be replayed) and NEVER hits the durable event log.
  // The route lives under `/v1/investigations/:id/presence` (continuity), not
  // the `/v1/runs/:id` mutation surface.
  presencePath(investigationId) {
    return `/v1/investigations/${encodeURIComponent(investigationId)}/presence`;
  }
  /**
   * Attach (or refresh) this surface's presence. Call on `/connect` and then on
   * a heartbeat interval well under the 30s TTL. `surface` labels the caller
   * (e.g. "claude-code", "pmctl"). Returns the current presence snapshot.
   */
  async attachPresence(investigationId, surface) {
    const res = await this.transport.request({
      method: "POST",
      path: this.presencePath(investigationId),
      body: { surface },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "attachPresence");
    return res.body;
  }
  /** Read the current presence snapshot for an investigation. */
  async getPresence(investigationId) {
    const res = await this.transport.request({
      method: "GET",
      path: this.presencePath(investigationId),
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "getPresence");
    return res.body;
  }
  /** Detach this surface's presence on disconnect. Returns the new snapshot. */
  async detachPresence(investigationId, surface) {
    const res = await this.transport.request({
      method: "DELETE",
      path: this.presencePath(investigationId),
      body: { surface },
      headers: this.authHeaders()
    });
    if (!this.ok(res)) throw this.mapError(res, "detachPresence");
    return res.body;
  }
};

// packages/plugin-core/src/presence/heartbeat.ts
var DEFAULT_PRESENCE_INTERVAL_MS = 1e4;
var PresenceHeartbeat = class {
  client;
  investigationId;
  surface;
  intervalMs;
  setIntervalFn;
  clearIntervalFn;
  onError;
  onSnapshot;
  handle = void 0;
  running = false;
  constructor(opts) {
    this.client = opts.client;
    this.investigationId = opts.investigationId;
    this.surface = opts.surface;
    this.intervalMs = opts.intervalMs ?? DEFAULT_PRESENCE_INTERVAL_MS;
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((h) => clearInterval(h));
    this.onError = opts.onError;
    this.onSnapshot = opts.onSnapshot;
  }
  /**
   * Attach now, then beat on the interval. Idempotent: a second `start()` is a
   * no-op while already running. Resolves once the initial attach settles so a
   * caller may `await` first presence before opening the stream.
   */
  async start() {
    if (this.running) return;
    this.running = true;
    await this.beat();
    if (!this.running) return;
    this.handle = this.setIntervalFn(() => {
      void this.beat();
    }, this.intervalMs);
  }
  /** Cancel the timer and best-effort detach. Idempotent. */
  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== void 0) {
      this.clearIntervalFn(this.handle);
      this.handle = void 0;
    }
    try {
      const snapshot = await this.client.detachPresence(
        this.investigationId,
        this.surface
      );
      this.onSnapshot?.(snapshot);
    } catch (err) {
      this.onError?.(err);
    }
  }
  async beat() {
    try {
      const snapshot = await this.client.attachPresence(
        this.investigationId,
        this.surface
      );
      this.onSnapshot?.(snapshot);
    } catch (err) {
      this.onError?.(err);
    }
  }
};

// packages/plugin-core/src/stream/event-stream.ts
var EventStream = class {
  opts;
  listeners = /* @__PURE__ */ new Set();
  seenEventIds = /* @__PURE__ */ new Set();
  lastSeq = 0;
  lastEventId;
  connection;
  reconnects = 0;
  closed = false;
  schedule;
  constructor(opts) {
    this.opts = opts;
    this.schedule = opts.scheduleReconnect ?? ((fn, ms) => setTimeout(fn, ms));
  }
  /** Subscribe to ordered, de-duplicated events. Returns an unsubscribe fn. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Highest sequence delivered so far. */
  get highestSequence() {
    return this.lastSeq;
  }
  open() {
    this.closed = false;
    this.connect();
  }
  close() {
    this.closed = true;
    this.connection?.close();
    this.connection = void 0;
  }
  connect() {
    if (this.closed) return;
    this.connection = this.opts.connector.connect(
      { url: this.opts.url, lastEventId: this.lastEventId, headers: this.opts.headers },
      {
        onMessage: (raw) => this.handleRaw(raw),
        onError: () => this.scheduleReconnect(),
        onClose: () => this.scheduleReconnect()
      }
    );
  }
  scheduleReconnect() {
    if (this.closed) return;
    const max = this.opts.maxReconnects ?? Number.POSITIVE_INFINITY;
    if (this.reconnects >= max) {
      this.closed = true;
      return;
    }
    this.reconnects += 1;
    this.schedule(() => this.connect(), this.opts.reconnectMs ?? 1e3);
  }
  handleRaw(raw) {
    let env;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (!env || typeof env.eventId !== "string" || typeof env.sequence !== "number") {
      return;
    }
    if (this.seenEventIds.has(env.eventId)) return;
    this.reconnects = 0;
    this.seenEventIds.add(env.eventId);
    this.lastEventId = env.eventId;
    if (env.sequence > this.lastSeq) this.lastSeq = env.sequence;
    for (const l of this.listeners) l(env);
  }
  /**
   * Feed an already-fetched replay slice (e.g. from `ServiceClient.getEventSlice`)
   * through the same dedupe/ordering path before attaching the live stream.
   * Events are applied in ascending `sequence` order.
   */
  applyReplay(events) {
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    for (const e of ordered) this.handleRaw(JSON.stringify(e));
  }
};

// packages/plugin-core/src/contract/agents.ts
var CANONICAL_AGENT_ROLES = [
  "bug-context",
  "log-analyzer",
  "code-semantics",
  "change-analyzer",
  "hypothesis-gen",
  "verifier",
  "skeptic",
  "documenter"
];
var CANONICAL_SET = new Set(CANONICAL_AGENT_ROLES);
var AGENT_ROLE_ALIASES = {
  // canonical wire IDs (identity)
  "bug-context": "bug-context",
  "log-analyzer": "log-analyzer",
  "code-semantics": "code-semantics",
  "change-analyzer": "change-analyzer",
  "hypothesis-gen": "hypothesis-gen",
  verifier: "verifier",
  skeptic: "skeptic",
  documenter: "documenter",
  // service v1 snake_case aliases (parity with service AGENT_ROLE_ALIASES)
  bug_context: "bug-context",
  log_analyzer: "log-analyzer",
  code_semantics: "code-semantics",
  change_analyzer: "change-analyzer",
  comms_analyzer: "change-analyzer",
  "comms-analyzer": "change-analyzer",
  hypothesis_generator: "hypothesis-gen",
  hypotheses: "hypothesis-gen",
  // earlier agent names -> canonical, kept so an older event stream still
  // renders on the canonical agent panel.
  "grafana-analyzer": "log-analyzer",
  "codebase-semantics": "code-semantics",
  "production-analyzer": "change-analyzer",
  "root-cause": "hypothesis-gen",
  "evidence-synthesizer": "hypothesis-gen"
};
function normalizeAgentId(agentId) {
  if (!agentId) return void 0;
  return AGENT_ROLE_ALIASES[agentId] ?? agentId;
}

// packages/plugin-core/src/projections/index.ts
function num(payload, key) {
  const v = payload?.[key];
  return typeof v === "number" ? v : 0;
}
function str(payload, key) {
  const v = payload?.[key];
  return typeof v === "string" ? v : void 0;
}
function initialProjection(investigationId) {
  return {
    runSummary: { investigationId, status: "created", costUsd: 0 },
    pipeline: { investigationId, steps: [] },
    logs: [],
    agents: /* @__PURE__ */ new Map(),
    pendingActions: /* @__PURE__ */ new Map()
  };
}
function upsertStep(steps, stepId, patch) {
  const existing = steps.find((s) => s.stepId === stepId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    steps.push({ stepId, label: patch.label ?? stepId, status: patch.status ?? "pending" });
  }
}
var STATUS_BY_TYPE = {
  "investigation.created": "created",
  "investigation.status_changed": "running",
  "investigation.completed": "completed",
  "investigation.failed": "failed"
};
function reduce(state, e) {
  const p = e.payload;
  switch (e.type) {
    case "investigation.created":
      state.runSummary.status = "created";
      state.runSummary.title = str(p, "title") ?? state.runSummary.title;
      state.runSummary.startedAt = e.timestamp;
      break;
    case "investigation.status_changed":
      state.runSummary.status = str(p, "status") ?? "running";
      break;
    case "investigation.completed":
      state.runSummary.status = "completed";
      state.runSummary.completedAt = e.timestamp;
      state.runSummary.reportUri = str(p, "reportUri") ?? state.runSummary.reportUri;
      break;
    case "investigation.failed":
      state.runSummary.status = "failed";
      state.runSummary.completedAt = e.timestamp;
      break;
    case "phase.started":
      upsertStep(state.pipeline.steps, str(p, "phaseId") ?? "unknown", {
        label: str(p, "label") ?? str(p, "phaseId") ?? "phase",
        status: "running"
      });
      break;
    case "phase.completed":
      upsertStep(state.pipeline.steps, str(p, "phaseId") ?? "unknown", { status: "completed" });
      break;
    case "agent.invoked": {
      const id = str(p, "invocationId") ?? e.eventId;
      state.agents.set(id, {
        agentId: normalizeAgentId(str(p, "agentId")) ?? "agent",
        invocationId: id,
        status: "invoked",
        startedAt: e.timestamp,
        costUsd: 0,
        toolCalls: 0
      });
      break;
    }
    case "agent.completed": {
      const id = str(p, "invocationId") ?? "";
      const a = state.agents.get(id);
      if (a) {
        a.status = "completed";
        a.completedAt = e.timestamp;
      }
      break;
    }
    case "agent.tool_call.completed": {
      const id = str(p, "invocationId") ?? "";
      const a = state.agents.get(id);
      if (a) a.toolCalls += 1;
      break;
    }
    case "cost.consumed": {
      const delta = num(p, "costUsd");
      state.runSummary.costUsd = round6(state.runSummary.costUsd + delta);
      const id = str(p, "invocationId") ?? "";
      const a = state.agents.get(id);
      if (a) a.costUsd = round6(a.costUsd + delta);
      state.logs.push({
        sequence: e.sequence,
        timestamp: e.timestamp,
        level: "info",
        text: `cost +$${delta.toFixed(4)} (total $${state.runSummary.costUsd.toFixed(4)})`,
        agentId: normalizeAgentId(str(p, "agentId"))
      });
      break;
    }
    case "action.proposed":
      state.pendingActions.set(str(p, "actionId") ?? e.eventId, {
        actionId: str(p, "actionId") ?? e.eventId,
        kind: str(p, "kind") ?? "action",
        summary: str(p, "summary") ?? "",
        status: "proposed"
      });
      break;
    case "action.approved": {
      const a = state.pendingActions.get(str(p, "actionId") ?? "");
      if (a) a.status = "approved";
      break;
    }
    case "action.executed": {
      const a = state.pendingActions.get(str(p, "actionId") ?? "");
      if (a) a.status = "executed";
      break;
    }
    default: {
      const msg = str(p, "message");
      if (msg) {
        state.logs.push({
          sequence: e.sequence,
          timestamp: e.timestamp,
          level: "info",
          text: msg,
          agentId: normalizeAgentId(str(p, "agentId"))
        });
      }
    }
  }
  if (STATUS_BY_TYPE[e.type]) state.runSummary.status = STATUS_BY_TYPE[e.type];
  return state;
}
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
function fold(investigationId, events) {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const state = initialProjection(investigationId);
  for (const e of ordered) reduce(state, e);
  return state;
}
function toPanelView(state) {
  return {
    runSummary: { ...state.runSummary },
    pipeline: { investigationId: state.pipeline.investigationId, steps: state.pipeline.steps.map((s) => ({ ...s })) },
    logs: state.logs.map((l) => ({ ...l })),
    pendingActions: [...state.pendingActions.values()].map((a) => ({ ...a }))
  };
}

// packages/plugin-core/src/runner/remote-runner.ts
var TERMINAL = /* @__PURE__ */ new Set([
  "investigation.completed",
  "investigation.failed"
]);
var RemoteServiceRunner = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  /**
   * Start a run and stream it to terminal. Resolves with the final result.
   * `replaySlice` (optional) lets a caller pre-seed durable replay events
   * fetched via ServiceClient.getEventSlice before the live stream attaches.
   */
  async run(req, opts = {}) {
    const created = await this.deps.client.createRun(req);
    return this.streamToTerminal(created.investigationId, opts);
  }
  /**
   * Attach to an EXISTING run (`/connect <id>`) and stream it to terminal
   * without creating a new one. Callers pass the durable replay slice fetched
   * via ServiceClient.getEventSlice so projections are seeded before the live
   * stream attaches (AD-9 continuity). Same fold/render loop as run() — no
   * projection logic is duplicated per command.
   */
  async attach(investigationId, opts = {}) {
    return this.streamToTerminal(investigationId, opts);
  }
  async streamToTerminal(investigationId, opts) {
    const state = initialProjection(investigationId);
    this.deps.host.renderPanel(toPanelView(state));
    const heartbeat = opts.presence ? new PresenceHeartbeat({
      client: this.deps.client,
      investigationId,
      surface: opts.presence.surface,
      ...opts.presence.intervalMs !== void 0 ? { intervalMs: opts.presence.intervalMs } : {}
    }) : void 0;
    if (heartbeat) await heartbeat.start();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const headers = {};
      const auth = this.deps.authHeader?.();
      if (auth) headers["Authorization"] = `Bearer ${auth}`;
      const stream = new EventStream({
        url: this.deps.streamUrlFor(investigationId),
        connector: this.deps.connector,
        headers
      });
      const finish = (status) => {
        if (settled) return;
        settled = true;
        stream.close();
        void heartbeat?.stop();
        resolve({
          investigationId,
          status,
          reportUri: state.runSummary.reportUri,
          costUsd: state.runSummary.costUsd
        });
      };
      stream.subscribe((event) => {
        try {
          reduce(state, event);
          this.deps.host.renderPanel(toPanelView(state));
          if (TERMINAL.has(event.type)) {
            finish(event.type === "investigation.completed" ? "completed" : "failed");
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            stream.close();
            void heartbeat?.stop();
            reject(err);
          }
        }
      });
      if (opts.replaySlice && opts.replaySlice.length > 0) {
        stream.applyReplay(opts.replaySlice);
        const folded = fold(investigationId, opts.replaySlice);
        if (folded.runSummary.status === "completed" || folded.runSummary.status === "failed") {
        }
      }
      stream.open();
    });
  }
};

// packages/plugin-core/src/service/node-transport.ts
var NodeHttpTransport = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  baseUrl;
  async request(opts) {
    const url = new URL(opts.path, this.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== void 0) url.searchParams.set(k, String(v));
      }
    }
    const reqHeaders = { ...opts.headers ?? {} };
    let body;
    if (opts.body !== void 0) {
      reqHeaders["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { method: opts.method, headers: reqHeaders, body });
    let parsed = void 0;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }
    const headers = {};
    res.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return { status: res.status, body: parsed, headers };
  }
};

// packages/plugin-core/src/stream/node-sse-connector.ts
var NodeSseConnector = class {
  connect(opts, handlers) {
    const controller = new AbortController();
    const headers = {
      Accept: "text/event-stream",
      ...opts.headers ?? {}
    };
    if (opts.lastEventId) headers["Last-Event-ID"] = opts.lastEventId;
    (async () => {
      try {
        const res = await fetch(opts.url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) {
          handlers.onError(new Error(`SSE connect failed: ${res.status}`));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (; ; ) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLines = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart());
            if (dataLines.length > 0) handlers.onMessage(dataLines.join("\n"));
          }
        }
        handlers.onClose();
      } catch (err) {
        if (err.name === "AbortError") return;
        handlers.onError(err);
      }
    })();
    return { close: () => controller.abort() };
  }
};

// packages/plugin-core/src/trust/tool-trust.ts
var BASELINE_WRITE_TRUST = {
  riskClass: "low",
  reversibility: "reversible"
};
var MUTATION_TRUST = {
  // Additive, self-undoing record edits.
  "investigation.add_evidence": { riskClass: "low", reversibility: "reversible" },
  "investigation.correct_evidence": { riskClass: "low", reversibility: "reversible" },
  "investigation.add_correction": { riskClass: "low", reversibility: "reversible" },
  "investigation.create_snapshot": { riskClass: "low", reversibility: "reversible" },
  // Destructive but recoverable via a compensating correction.
  "investigation.invalidate_evidence": { riskClass: "low", reversibility: "compensable" },
  "investigation.invalidate_hypothesis": { riskClass: "low", reversibility: "compensable" },
  // Re-executes the pipeline (spend + downstream side effects).
  "investigation.rerun_from_phase": { riskClass: "high", reversibility: "compensable" },
  "investigation.resume": { riskClass: "high", reversibility: "compensable" }
};
function classifyMutation(tool) {
  return MUTATION_TRUST[tool];
}

// packages/plugin-core/src/mcp/session-manager.ts
var WRITE_SCOPES = ["write-investigation", "approve-action"];
var DEFAULT_REFRESH_SKEW_MS = 3e4;
var READ_ONLY_NOTICE = "Production Master: your account is read-only (it does not hold runs:write), so this session can read investigations but not change them. The engineer role or above grants write access; ask an org admin if you need it.";
function jwtExpiryMs(jwt) {
  const part = jwt.split(".")[1];
  if (!part) return void 0;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1e3 : void 0;
  } catch {
    return void 0;
  }
}
function superseded(investigationIds) {
  return new Error(
    `MCP session for ${investigationIds.join(", ")} was superseded by a newer session request before it was ready; it was discarded.`
  );
}
var McpSessionManager = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  active;
  refreshing;
  lastGeneration = 0;
  getActiveSession() {
    return this.active;
  }
  /**
   * Create (or switch to) a scoped session for the given investigation(s).
   * Any prior session is discarded first so it can never be reused. A session
   * requesting a write scope expands capability past read-only, so it is backed
   * by a baseline trust grant (audited locally and mirrored to the service).
   *
   * Mint by what the caller holds: if the service refuses the write scope
   * (`insufficient_scope` / `runs:write`) the mint is retried ONCE read-only and
   * the user is told. Any other refusal propagates.
   *
   * The most recent createSession() wins. If another one starts while this one
   * is still minting, this one's result is discarded — never made active, never
   * registered with the host, no grants issued — and it rejects as superseded.
   */
  async createSession(investigationIds, scopes) {
    if (this.active) this.discard();
    const generation = ++this.lastGeneration;
    const session = await this.mint(investigationIds, scopes, true, generation);
    if (this.lastGeneration !== generation) throw superseded(investigationIds);
    this.active = session;
    try {
      await this.register(session);
    } catch (err) {
      if (this.active === session) this.active = void 0;
      throw err;
    }
    if (this.lastGeneration !== generation) throw superseded(investigationIds);
    this.issueGrantsFor(session);
    return session;
  }
  /**
   * Re-mint the active session if it is within the refresh skew of expiry.
   * Returns the (possibly new) active session. Cheap when nothing is due.
   */
  async ensureFresh() {
    const active = this.active;
    if (!active) return void 0;
    if (active.refreshAtMs !== void 0 && this.now() >= active.refreshAtMs) {
      return this.refresh();
    }
    return active;
  }
  /**
   * Re-mint the active session for the same investigations and the originally
   * requested scopes (e.g. after a 401, or shortly before `exp`). Concurrent
   * callers share one mint. The trust grants the user already approved are kept
   * across a refresh; they are revoked only if the refresh comes back read-only.
   *
   * A refresh only ever acts for the session it started from. The minted result
   * is registered with the host only if that session is STILL the active one;
   * if the active investigation switched meanwhile, the result is discarded and
   * the host configuration is left alone. Pass `expectedGeneration` to refuse to
   * refresh at all (returns undefined) when the active session is not the one
   * the caller is working for.
   */
  async refresh(expectedGeneration) {
    const prev = this.active;
    if (!prev) return void 0;
    if (expectedGeneration !== void 0 && prev.generation !== expectedGeneration) return void 0;
    if (this.refreshing?.prev === prev) return this.refreshing.promise;
    const entry = {
      prev,
      promise: (async () => {
        try {
          const next = await this.mint(
            prev.investigationIds,
            prev.requestedScopes,
            !prev.readOnlyFallback,
            prev.generation
          );
          if (this.active !== prev) return this.active;
          this.active = next;
          try {
            await this.register(next);
          } catch (err) {
            if (this.active === next) this.active = prev;
            throw err;
          }
          if (next.readOnly && !prev.readOnly) this.revokeGrantsFor(prev.investigationIds);
          return next;
        } finally {
          if (this.refreshing?.prev === prev) this.refreshing = void 0;
        }
      })()
    };
    this.refreshing = entry;
    return entry.promise;
  }
  now() {
    return this.deps.now?.() ?? Date.now();
  }
  /**
   * Mint a grant (with the read-only fallback). Minting has no side effect on
   * the host: the caller registers the result only once it knows it still owns
   * the active session (see register()).
   */
  async mint(investigationIds, requested, announce, generation) {
    let scopes = requested;
    let grant;
    try {
      grant = await this.deps.createServiceSession(investigationIds, requested);
    } catch (err) {
      const refusedWrite = err instanceof InsufficientScopeError && err.requiredScope === "runs:write" && requested.some((s) => WRITE_SCOPES.includes(s));
      if (!refusedWrite) throw err;
      scopes = requested.filter((s) => !WRITE_SCOPES.includes(s));
      if (scopes.length === 0) scopes = ["read-investigation"];
      if (announce) this.deps.notify?.(READ_ONLY_NOTICE);
      grant = await this.deps.createServiceSession(investigationIds, scopes);
    }
    const issuedAt = this.now();
    const candidates = [
      grant.ttlSeconds > 0 ? issuedAt + grant.ttlSeconds * 1e3 : void 0,
      jwtExpiryMs(grant.sessionJwt)
    ].filter((v) => v !== void 0);
    const expiresAtMs = candidates.length > 0 ? Math.min(...candidates) : void 0;
    const skew = Math.min(
      this.deps.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS,
      expiresAtMs !== void 0 ? (expiresAtMs - issuedAt) / 2 : Infinity
    );
    return {
      generation,
      grant,
      investigationIds,
      scopes,
      requestedScopes: requested,
      readOnly: !scopes.some((s) => WRITE_SCOPES.includes(s)),
      readOnlyFallback: scopes !== requested,
      expiresAtMs,
      refreshAtMs: expiresAtMs !== void 0 ? expiresAtMs - skew : void 0
    };
  }
  /** Point the host at this session. Call only while it is the active session. */
  async register(session) {
    await this.deps.host.registerMcpServer({
      endpoint: session.grant.endpoint,
      audience: session.grant.audience,
      sessionJwt: session.grant.sessionJwt,
      scopes: session.scopes
    });
  }
  issueGrantsFor(session) {
    if (this.deps.trust && !session.readOnly) {
      for (const investigationId of session.investigationIds) {
        void this.issueGrant(investigationId);
      }
    }
  }
  /** Discard the active session and revoke any grants it minted (on exit). */
  discard() {
    const investigationIds = this.active?.investigationIds ?? [];
    this.active = void 0;
    this.revokeGrantsFor(investigationIds);
  }
  revokeGrantsFor(investigationIds) {
    const { trust } = this.deps;
    if (!trust) return;
    for (const investigationId of investigationIds) {
      for (const g of trust.listActive(investigationId)) {
        trust.revoke(g.grantId);
        void this.deps.emitTrustExpansion?.({
          type: "trust-grant-revoked",
          grant: g,
          at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
  issueGrant(investigationId) {
    const { trust } = this.deps;
    if (!trust) return;
    const at = (/* @__PURE__ */ new Date()).toISOString();
    const grant = {
      grantId: this.deps.newGrantId?.() ?? `grant-${investigationId}-connect`,
      investigationId,
      riskClass: BASELINE_WRITE_TRUST.riskClass,
      reversibility: BASELINE_WRITE_TRUST.reversibility,
      sessionLabel: this.deps.sessionLabel ?? "mcp-session",
      grantedAt: at
    };
    trust.issue(grant);
    void this.deps.emitTrustExpansion?.({ type: "trust-grant-issued", grant, at });
  }
  /** True when the given investigationId is in the active session's scope. */
  isInScope(investigationId) {
    return this.active?.investigationIds.includes(investigationId) ?? false;
  }
};

// packages/plugin-core/src/mcp/types.ts
var READ_TOOLS = [
  "investigation.get_summary",
  "investigation.list_evidence",
  "investigation.get_evidence",
  "investigation.list_hypotheses",
  "investigation.get_hypothesis",
  "investigation.list_actions",
  "investigation.get_event_log",
  "investigation.get_agent_prompt",
  "investigation.list_snapshots",
  "investigation.subscribe"
];
var MUTATION_TOOLS = [
  "investigation.add_evidence",
  "investigation.correct_evidence",
  "investigation.invalidate_evidence",
  "investigation.invalidate_hypothesis",
  "investigation.add_correction",
  "investigation.create_snapshot",
  "investigation.rerun_from_phase",
  "investigation.resume"
];
function isMutationTool(name) {
  return MUTATION_TOOLS.includes(name);
}
function isReadTool(name) {
  return READ_TOOLS.includes(name);
}
var ToolError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ToolError";
  }
  code;
};

// packages/plugin-core/src/mcp/tools.ts
function summarize(tool, args) {
  const id = args.investigationId ?? "";
  return `${tool} on ${id}`;
}
var McpTools = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  /**
   * Invoke an investigation.* tool. Mutations are preview-gated. Returns the
   * service response body on success.
   */
  async invoke(tool, args) {
    const session = await this.deps.sessions.ensureFresh() ?? this.deps.sessions.getActiveSession();
    if (!session) throw new ToolError("PERMISSION_DENIED", "no active MCP session");
    const investigationId = args.investigationId ?? session.investigationIds[0];
    await this.authorize(session, tool, investigationId, args, true);
    const idempotencyKey = isMutationTool(tool) ? this.deps.newIdempotencyKey?.() : void 0;
    const call = (s) => this.deps.transport.call({
      endpoint: s.grant.endpoint,
      sessionJwt: s.grant.sessionJwt,
      tool,
      args,
      idempotencyKey
    });
    let res = await call(session);
    if (res.status === 401) {
      const switched = () => new ToolError(
        "PERMISSION_DENIED",
        `${tool} on ${investigationId} was not retried: the active investigation switched while the call was in flight. Run it again for the current investigation.`
      );
      if (this.deps.sessions.getActiveSession()?.generation !== session.generation) throw switched();
      const fresh = await this.deps.sessions.refresh(session.generation);
      if (!fresh || fresh.generation !== session.generation || this.deps.sessions.getActiveSession() !== fresh) {
        throw switched();
      }
      await this.authorize(fresh, tool, investigationId, args, false);
      res = await call(fresh);
    }
    if (res.status >= 200 && res.status < 300) return res.body;
    const message = res.body?.message ?? `tool ${tool} failed`;
    if (res.status === 401) {
      throw new ToolError("PERMISSION_DENIED", `${message} (session rejected after re-mint; run /login again)`);
    }
    if (res.status === 403) throw new ToolError("PERMISSION_DENIED", message);
    if (res.status === 404) throw new ToolError("NOT_FOUND", message);
    if (res.status === 409) throw new ToolError("IDEMPOTENCY_CONFLICT", message);
    if (res.status === 402) throw new ToolError("BUDGET_EXHAUSTED", message);
    throw new ToolError("NOT_FOUND", message);
  }
  /**
   * Scope, tool-name and mutation checks for one attempt of a call. Run before
   * the first send and again before any retry. `firstAttempt` is false on a
   * retry: with a trust store the grant gate is re-evaluated (a grant revoked by
   * a demoting refresh must not be bypassed); without one, the user already
   * approved this exact call and is not asked a second time.
   */
  async authorize(session, tool, investigationId, args, firstAttempt) {
    if (!this.deps.sessions.isInScope(investigationId)) {
      throw new ToolError("PERMISSION_DENIED", `investigation ${investigationId} out of session scope`);
    }
    if (!isReadTool(tool) && !isMutationTool(tool)) {
      throw new ToolError("NOT_FOUND", `unknown tool ${tool}`);
    }
    if (isMutationTool(tool)) {
      if (session.readOnlyFallback) {
        throw new ToolError(
          "PERMISSION_DENIED",
          `${tool} needs write access, but this session is read-only (the account does not hold runs:write; the engineer role or above grants it).`
        );
      }
      if (firstAttempt || this.deps.trust) await this.gateMutation(tool, investigationId, args);
    }
  }
  /**
   * Trust-gate a mutation. A mutation covered by an active grant proceeds
   * silently; an uncovered one prompts for approval (a trust expansion). On
   * approve the grant is recorded and mirrored to the service; on reject the
   * mutation is audited and blocked before any wire call.
   */
  async gateMutation(tool, investigationId, args) {
    const { trust } = this.deps;
    const cls = classifyMutation(tool);
    if (trust?.match({ investigationId, ...cls })) return;
    const preview = {
      schemaVersion: "mutation-preview.v1",
      tool,
      investigationId,
      summary: summarize(tool, args),
      details: args
    };
    const decision = await this.deps.host.showMutationPreview(preview);
    if (decision === "reject") {
      this.deps.audit?.({ type: "user.mutation_rejected", tool, investigationId });
      throw new ToolError("USER_REJECTED_CONFIRMATION", `user rejected ${tool}`);
    }
    if (!trust) return;
    const at = (/* @__PURE__ */ new Date()).toISOString();
    const grant = {
      grantId: this.deps.newGrantId?.() ?? `grant-${investigationId}-${cls.riskClass}-${cls.reversibility}`,
      investigationId,
      riskClass: cls.riskClass,
      reversibility: cls.reversibility,
      sessionLabel: this.deps.sessionLabel ?? "mcp-session",
      grantedAt: at
    };
    trust.issue(grant);
    await this.deps.emitTrustExpansion?.({ type: "trust-grant-issued", grant, at });
  }
};

// packages/plugin-core/src/mcp/http-transport.ts
var HttpMcpToolTransport = class {
  gatewayUrl;
  getAuthToken;
  constructor(gatewayUrl, getAuthToken) {
    this.gatewayUrl = gatewayUrl.replace(/\/$/, "");
    this.getAuthToken = getAuthToken;
  }
  async call(opts) {
    const url = `${this.gatewayUrl}/v1/mcp/call`;
    const headers = {
      "Content-Type": "application/json",
      // MCP session JWT scopes the tool call to the correct investigation.
      "X-Mcp-Session-Jwt": opts.sessionJwt,
      // The original service endpoint the session was minted against; the
      // gateway uses this to proxy to the correct MCP server replica.
      "X-Mcp-Endpoint": opts.endpoint
    };
    const token = this.getAuthToken?.();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (opts.idempotencyKey) {
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }
    const body = JSON.stringify({
      tool: opts.tool,
      args: opts.args
    });
    const res = await fetch(url, { method: "POST", headers, body });
    let parsed;
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
};

// packages/plugin-core/src/auth/wire.ts
var DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
var REFRESH_TOKEN_GRANT_TYPE = "refresh_token";
function deviceAuthorizationRequest(clientId, scopes) {
  const body = { client_id: clientId };
  if (scopes.length > 0) body.scope = scopes.join(" ");
  return body;
}
function deviceTokenRequest(clientId, deviceCode) {
  return { grant_type: DEVICE_CODE_GRANT_TYPE, device_code: deviceCode, client_id: clientId };
}
function refreshTokenRequest(clientId, refreshToken) {
  return { grant_type: REFRESH_TOKEN_GRANT_TYPE, refresh_token: refreshToken, client_id: clientId };
}
function tokenRevocationRequest(refreshToken) {
  return { token: refreshToken };
}
function oauthErrorCode(body) {
  const err = body?.error;
  return typeof err === "string" ? err : void 0;
}
function record(body, what) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`${what}: expected a JSON object, got ${body === null ? "null" : typeof body}`);
  }
  return body;
}
function str2(o, key, what) {
  const v = o[key];
  if (typeof v !== "string" || v === "") throw new Error(`${what}: missing or empty "${key}"`);
  return v;
}
function int(o, key, what) {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`${what}: missing or invalid "${key}"`);
  }
  return v;
}
function parseDeviceAuthorizationResponse(body) {
  const what = "device start response";
  const o = record(body, what);
  return {
    deviceCode: str2(o, "device_code", what),
    userCode: str2(o, "user_code", what),
    verificationUri: str2(o, "verification_uri", what),
    // Required by our contract (optional in RFC 8628): hosts open it directly
    // and have no surface to display user_code separately.
    verificationUriComplete: str2(o, "verification_uri_complete", what),
    interval: int(o, "interval", what),
    expiresIn: int(o, "expires_in", what)
  };
}
function parseTokenResponse(body, now, requestedScopes, clientId) {
  const what = "token response";
  const o = record(body, what);
  const tokenType = str2(o, "token_type", what);
  if (tokenType.toLowerCase() !== "bearer") throw new Error(`${what}: unsupported token_type "${tokenType}"`);
  const scope = typeof o["scope"] === "string" ? o["scope"].trim() : "";
  const refresh = o["refresh_token"];
  if (refresh !== void 0 && (typeof refresh !== "string" || refresh === "")) {
    throw new Error(`${what}: invalid "refresh_token"`);
  }
  return {
    accessToken: str2(o, "access_token", what),
    refreshToken: typeof refresh === "string" ? refresh : "",
    expiresAt: now + int(o, "expires_in", what) * 1e3,
    scopes: scope ? scope.split(/\s+/) : [...requestedScopes],
    ...clientId ? { clientId } : {}
  };
}

// packages/plugin-core/src/auth/device-code.ts
var ReauthRequiredError = class extends Error {
  constructor(message = "not authenticated — the session expired; log in again.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
};
var ONE_MIN_MS = 60 * 1e3;
var FIVE_MIN_MS = 5 * ONE_MIN_MS;
var DeviceCodeAuth = class {
  transport;
  clientId;
  scopes;
  now;
  sleep;
  expirySkewMs;
  refreshSkewMs;
  maxStartAttempts;
  maxRetryAfterMs;
  deviceCode;
  interval = 5;
  // seconds
  deviceExpiresAt = 0;
  constructor(opts) {
    this.transport = opts.transport;
    this.clientId = opts.clientId;
    this.scopes = opts.scopes;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.expirySkewMs = opts.expirySkewMs ?? ONE_MIN_MS;
    this.refreshSkewMs = opts.refreshSkewMs ?? FIVE_MIN_MS;
    this.maxStartAttempts = Math.max(1, opts.maxStartAttempts ?? 3);
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? ONE_MIN_MS;
  }
  async start() {
    let res = await this.requestDeviceCode();
    for (let attempt = 1; res.status === 429 && attempt < this.maxStartAttempts; attempt++) {
      const waitMs = retryAfterMs(res);
      if (waitMs === void 0 || waitMs > this.maxRetryAfterMs) break;
      await this.sleep(waitMs);
      res = await this.requestDeviceCode();
    }
    if (res.status === 429) {
      const waitMs = retryAfterMs(res);
      const hint = waitMs === void 0 ? "" : `; try again in ${Math.ceil(waitMs / 1e3)} s`;
      throw new Error(`device start failed: 429${oauthErrorSuffix(res.body)}${hint}`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`device start failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
    const start = parseDeviceAuthorizationResponse(res.body);
    this.deviceCode = start.deviceCode;
    this.interval = Math.max(1, start.interval);
    this.deviceExpiresAt = this.now() + start.expiresIn * 1e3;
    return start;
  }
  /** One poll tick. Never call faster than `this.interval` seconds yourself. */
  async poll() {
    if (!this.deviceCode) throw new Error("poll() called before start()");
    if (this.now() >= this.deviceExpiresAt) return { status: "expired" };
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: deviceTokenRequest(this.clientId, this.deviceCode)
    });
    if (res.status >= 200 && res.status < 300) {
      return {
        status: "tokens",
        tokens: parseTokenResponse(res.body, this.now(), this.scopes, this.clientId)
      };
    }
    const err = res.body?.error;
    switch (err) {
      case "authorization_pending":
        return { status: "pending" };
      case "slow_down":
        this.interval += 5;
        return { status: "slow_down", interval: this.interval };
      case "access_denied":
        return { status: "denied" };
      case "expired_token":
        return { status: "expired" };
      default:
        throw new Error(`device token poll failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
  }
  /**
   * Drive poll() to a terminal state, sleeping `interval` between attempts
   * (honoring slow_down). Returns tokens or throws on denied/expired/failure.
   */
  async waitForTokens() {
    for (; ; ) {
      await this.sleep(this.interval * 1e3);
      const result = await this.poll();
      switch (result.status) {
        case "tokens":
          return result.tokens;
        case "pending":
          continue;
        case "slow_down":
          continue;
        // interval already bumped inside poll()
        case "denied":
          throw new Error("device authorization denied");
        case "expired":
          throw new Error("device code expired");
      }
    }
  }
  /**
   * One refresh_token grant (RFC 6749 §6). Returns the new session, whose
   * `refreshToken` REPLACES the one passed in (now spent). The request carries
   * the login's client_id (`current.clientId`, else this instance's). Throws
   * ReauthRequiredError on `invalid_grant`, and a plain Error on anything else
   * (network, 5xx), after which the caller cannot know whether the token was
   * spent.
   *
   * Not single-flight by itself: go through TokenRefresher.
   */
  async refresh(current) {
    if (!current.refreshToken) throw new ReauthRequiredError();
    const clientId = current.clientId ?? this.clientId;
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: refreshTokenRequest(clientId, current.refreshToken)
    });
    if (res.status >= 200 && res.status < 300) {
      return parseTokenResponse(res.body, this.now(), current.scopes, clientId);
    }
    if (oauthErrorCode(res.body) === "invalid_grant") {
      throw new ReauthRequiredError(
        "not authenticated — the session can no longer be refreshed; log in again."
      );
    }
    throw new Error(`token refresh failed: ${res.status}${oauthErrorSuffix(res.body)}`);
  }
  /**
   * Revoke a refresh token (RFC 7009), ending its whole login server-side.
   * The service answers 200 whether or not the token existed; any other status
   * throws.
   */
  async revoke(refreshToken) {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/revoke",
      body: tokenRevocationRequest(refreshToken)
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`token revoke failed: ${res.status}${oauthErrorSuffix(res.body)}`);
    }
  }
  /** True when the access token has less than the refresh skew (5 min) left. */
  needsRefresh(tokens) {
    return tokens.expiresAt - this.now() <= this.refreshSkewMs;
  }
  /** True when the session is at (or within the skew of) its expiry. */
  isExpired(tokens) {
    return tokens.expiresAt - this.now() <= this.expirySkewMs;
  }
  requestDeviceCode() {
    return this.transport.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: deviceAuthorizationRequest(this.clientId, this.scopes)
    });
  }
};
function oauthErrorSuffix(body) {
  const err = oauthErrorCode(body);
  return err ? ` (${err})` : "";
}
function retryAfterMs(res) {
  const raw = res.headers?.["retry-after"];
  if (raw === void 0) return void 0;
  const sec = Number(raw.trim());
  return Number.isFinite(sec) && sec >= 0 ? Math.ceil(sec) * 1e3 : void 0;
}

// packages/plugin-core/src/auth/token-store.ts
var InMemorySecretBackend = class {
  map = /* @__PURE__ */ new Map();
  async get(key) {
    return this.map.get(key);
  }
  async set(key, value) {
    this.map.set(key, value);
  }
  async delete(key) {
    this.map.delete(key);
  }
  async list() {
    return [...this.map.keys()];
  }
};
var Base64Cipher = class {
  encrypt(plaintext) {
    return `enc:${Buffer.from(plaintext, "utf8").toString("base64")}`;
  }
  decrypt(ciphertext) {
    const raw = ciphertext.startsWith("enc:") ? ciphertext.slice(4) : ciphertext;
    return Buffer.from(raw, "base64").toString("utf8");
  }
};
var KEY_PREFIX = "pm-session:";
var TokenStore = class {
  backend;
  cipher;
  issuer;
  now;
  constructor(opts) {
    this.backend = opts.backend ?? new InMemorySecretBackend();
    this.cipher = opts.cipher ?? new Base64Cipher();
    this.issuer = opts.issuer;
    this.now = opts.now ?? (() => Date.now());
  }
  key(accountId) {
    return `${KEY_PREFIX}${accountId}`;
  }
  async save(accountId, tokens) {
    const session = {
      version: 1,
      accountId,
      issuer: this.issuer,
      accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      updatedAt: this.now(),
      ...tokens.clientId ? { clientId: tokens.clientId } : {}
    };
    await this.backend.set(this.key(accountId), JSON.stringify(session));
  }
  async load(accountId) {
    const raw = await this.backend.get(this.key(accountId));
    if (!raw) return void 0;
    const s = JSON.parse(raw);
    return {
      accessToken: this.cipher.decrypt(s.accessTokenEnc),
      refreshToken: this.cipher.decrypt(s.refreshTokenEnc),
      expiresAt: s.expiresAt,
      scopes: s.scopes,
      ...s.clientId ? { clientId: s.clientId } : {}
    };
  }
  async scopes(accountId) {
    const raw = await this.backend.get(this.key(accountId));
    if (!raw) return void 0;
    return JSON.parse(raw).scopes;
  }
  /** Wipe the account's session. Idempotent; safe to call on network failure. */
  async clear(accountId) {
    await this.backend.delete(this.key(accountId));
  }
  async listAccounts() {
    const keys = await this.backend.list();
    return keys.filter((k) => k.startsWith(KEY_PREFIX)).map((k) => k.slice(KEY_PREFIX.length));
  }
};

// packages/plugin-core/src/auth/keychain.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var exec = promisify(execFile);
function warn(msg) {
  console.warn(`[pm-keychain] ${msg}`);
}
function detectPlatform() {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  if (p === "win32") return "win32";
  return "unknown";
}
async function macStore(service, account, value) {
  await exec("security", [
    "delete-generic-password",
    "-s",
    service,
    "-a",
    account
  ]).catch(() => {
  });
  await exec("security", [
    "add-generic-password",
    "-s",
    service,
    "-a",
    account,
    "-w",
    value,
    "-U"
  ]);
}
async function macGet(service, account) {
  try {
    const { stdout } = await exec("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w"
    ]);
    return stdout.trim() || void 0;
  } catch {
    return void 0;
  }
}
async function macDelete(service, account) {
  await exec("security", [
    "delete-generic-password",
    "-s",
    service,
    "-a",
    account
  ]).catch(() => {
  });
}
async function linuxStore(service, account, value) {
  await exec(
    "secret-tool",
    [
      "store",
      "--label",
      `${service}:${account}`,
      "service",
      service,
      "account",
      account
    ],
    { input: value }
  );
}
async function linuxGet(service, account) {
  try {
    const { stdout } = await exec("secret-tool", [
      "lookup",
      "service",
      service,
      "account",
      account
    ]);
    return stdout.trim() || void 0;
  } catch {
    return void 0;
  }
}
async function linuxDelete(service, account) {
  await exec("secret-tool", [
    "clear",
    "service",
    service,
    "account",
    account
  ]).catch(() => {
  });
}
function psEscape(s) {
  return s.replace(/'/g, "''");
}
async function winStore(service, account, value) {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try { $vault.Remove($vault.Retrieve('${psEscape(service)}','${psEscape(account)}')) } catch {}
    $cred = New-Object Windows.Security.Credentials.PasswordCredential('${psEscape(service)}','${psEscape(account)}','${psEscape(value)}')
    $vault.Add($cred)
  `.trim();
  await exec("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]);
}
async function winGet(service, account) {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try {
      $c = $vault.Retrieve('${psEscape(service)}','${psEscape(account)}')
      $c.RetrievePassword()
      Write-Output $c.Password
    } catch { Write-Output '' }
  `.trim();
  try {
    const { stdout } = await exec("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script
    ]);
    return stdout.trim() || void 0;
  } catch {
    return void 0;
  }
}
async function winDelete(service, account) {
  const script = `
    [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try { $vault.Remove($vault.Retrieve('${psEscape(service)}','${psEscape(account)}')) } catch {}
  `.trim();
  await exec("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]).catch(() => {
  });
}
var KEYCHAIN_PROBES = {
  darwin: ["security", ["list-keychains"]],
  linux: ["secret-tool", ["--version"]],
  win32: ["powershell", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]]
};
async function isAvailable(platform) {
  const probe = KEYCHAIN_PROBES[platform];
  if (!probe) return false;
  try {
    await exec(probe[0], [...probe[1]]);
    return true;
  } catch {
    return false;
  }
}
var KeychainSecretBackend = class {
  service;
  platform;
  fallback;
  _available;
  constructor(service = "production-master") {
    this.service = service;
    this.platform = detectPlatform();
  }
  async ensureAvailable() {
    if (this._available === void 0) {
      this._available = await isAvailable(this.platform);
      if (!this._available) {
        warn(
          `OS keychain CLI unavailable on ${this.platform}. Falling back to in-memory storage (tokens will not persist across sessions).`
        );
        this.fallback = new InMemorySecretBackend();
      }
    }
    return this._available;
  }
  async get(key) {
    if (!await this.ensureAvailable()) return this.fallback.get(key);
    if (this.platform === "darwin") return macGet(this.service, key);
    if (this.platform === "linux") return linuxGet(this.service, key);
    if (this.platform === "win32") return winGet(this.service, key);
    return void 0;
  }
  async set(key, value) {
    if (!await this.ensureAvailable()) return this.fallback.set(key, value);
    if (this.platform === "darwin") return macStore(this.service, key, value);
    if (this.platform === "linux") return linuxStore(this.service, key, value);
    if (this.platform === "win32") return winStore(this.service, key, value);
  }
  async delete(key) {
    if (!await this.ensureAvailable()) return this.fallback.delete(key);
    if (this.platform === "darwin") return macDelete(this.service, key);
    if (this.platform === "linux") return linuxDelete(this.service, key);
    if (this.platform === "win32") return winDelete(this.service, key);
  }
  async list() {
    if (!await this.ensureAvailable()) return this.fallback.list();
    return [];
  }
};

// packages/plugin-core/src/auth/create-token-store.ts
function createTokenStore(serviceName = "production-master") {
  const backend = new KeychainSecretBackend(serviceName);
  return new TokenStore({ backend, issuer: serviceName });
}

// packages/plugin-core/src/auth/refresh.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { hostname, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
var IN_PROCESS_ONLY = { withLock: (_key, fn) => fn() };
var FileRefreshLock = class {
  dir;
  staleMs;
  heartbeatMs;
  timeoutMs;
  pollMs;
  sleep;
  constructor(opts) {
    this.dir = opts.dir;
    this.staleMs = opts.staleMs ?? 6e4;
    this.heartbeatMs = opts.heartbeatMs ?? Math.max(10, Math.floor(this.staleMs / 4));
    this.timeoutMs = opts.timeoutMs ?? 9e4;
    this.pollMs = opts.pollMs ?? 100;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }
  /** The lock file used for `key` (exposed for tests and diagnostics). */
  pathFor(key) {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
    return join(this.dir, `refresh-${digest}.lock`);
  }
  async withLock(key, fn) {
    await mkdir(this.dir, { recursive: true, mode: 448 });
    const file = this.pathFor(key);
    const nonce = await this.acquire(file);
    let beat = Promise.resolve();
    const timer = setInterval(() => {
      beat = beat.then(() => this.heartbeat(file, nonce)).catch(() => {
      });
    }, this.heartbeatMs);
    timer.unref?.();
    try {
      return await fn();
    } finally {
      clearInterval(timer);
      await beat;
      await this.release(file, nonce);
    }
  }
  async acquire(file) {
    const deadline = Date.now() + this.timeoutMs;
    for (; ; ) {
      const nonce = randomUUID();
      try {
        const fh = await open(file, "wx", 384);
        try {
          await fh.writeFile(JSON.stringify(this.record(nonce)));
        } finally {
          await fh.close();
        }
        return nonce;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
      }
      const held = await readRecord(file);
      if (held === "gone") continue;
      if (held === void 0 ? await this.oldFile(file) : this.isStale(held)) {
        const again = await readRecord(file);
        if (again === "gone" || sameRecord(again, held)) await rm(file, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for the token-refresh lock held by pid ${held?.pid ?? "unknown"}`);
      }
      await this.sleep(this.pollMs);
    }
  }
  record(nonce) {
    return { pid: process.pid, host: hostname(), at: Date.now(), nonce };
  }
  /** Renew this holder's heartbeat, in place, only while the file is still ours. */
  async heartbeat(file, nonce) {
    const held = await readRecord(file);
    if (held === "gone" || held?.nonce !== nonce) return;
    const fh = await open(file, "r+");
    try {
      await fh.truncate(0);
      await fh.write(JSON.stringify(this.record(nonce)), 0);
    } finally {
      await fh.close();
    }
  }
  isStale(rec) {
    if (Date.now() - rec.at > this.staleMs) return true;
    const sameHost = rec.host === void 0 || rec.host === hostname();
    return sameHost && rec.pid !== process.pid && !processAlive(rec.pid);
  }
  async oldFile(file) {
    try {
      return Date.now() - (await stat(file)).mtimeMs > this.staleMs;
    } catch {
      return false;
    }
  }
  async release(file, nonce) {
    const held = await readRecord(file);
    if (held !== "gone" && held?.nonce === nonce) await rm(file, { force: true });
  }
};
async function readRecord(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "gone";
    throw err;
  }
  try {
    const rec = JSON.parse(raw);
    if (typeof rec.pid === "number" && typeof rec.at === "number" && typeof rec.nonce === "string") {
      return rec;
    }
  } catch {
  }
  return void 0;
}
function sameRecord(a, b) {
  if (a === "gone") return false;
  if (a === void 0 || b === void 0) return a === b;
  return a.nonce === b.nonce;
}
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function createRefreshLock(serviceName = "production-master") {
  let who;
  try {
    const info = userInfo();
    who = info.uid >= 0 ? String(info.uid) : info.username;
  } catch {
    who = "user";
  }
  return new FileRefreshLock({ dir: join(tmpdir(), `${serviceName}-${who}`) });
}
function refreshLockKey(accountId, serviceName = "production-master") {
  return `${serviceName}:${accountId}`;
}
var inflight = /* @__PURE__ */ new WeakMap();
var queues = /* @__PURE__ */ new WeakMap();
function serialize(store, accountId, fn) {
  let byAccount = queues.get(store);
  if (!byAccount) {
    byAccount = /* @__PURE__ */ new Map();
    queues.set(store, byAccount);
  }
  const prev = byAccount.get(accountId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => void 0);
  byAccount.set(accountId, tail);
  void tail.then(() => {
    if (byAccount.get(accountId) === tail) byAccount.delete(accountId);
  });
  return run;
}
var TokenRefresher = class {
  auth;
  store;
  accountId;
  lock;
  lockKey;
  constructor(opts) {
    this.auth = opts.auth;
    this.store = opts.store;
    this.accountId = opts.accountId;
    this.lock = opts.lock ?? IN_PROCESS_ONLY;
    this.lockKey = opts.lockKey ?? refreshLockKey(opts.accountId);
  }
  /**
   * Usable tokens for the account, refreshed first when under the refresh
   * skew. `undefined` means nobody is logged in. Throws ReauthRequiredError
   * when the login is over (refresh refused, or expired with no refresh
   * token); the stored session is wiped first. A transient refresh failure
   * (network, 5xx) keeps the current access token while it is still valid,
   * and throws once it is not.
   */
  async ensureFresh(cached) {
    const tokens = cached ?? await this.store.load(this.accountId);
    if (!tokens) return void 0;
    if (!this.auth.needsRefresh(tokens)) return tokens;
    if (!tokens.refreshToken) return this.withoutRefresh(tokens);
    try {
      return await this.refresh();
    } catch (err) {
      if (err instanceof ReauthRequiredError) throw err;
      if (!this.auth.isExpired(tokens)) return tokens;
      throw err;
    }
  }
  /**
   * Single-flight refresh of the stored login (in-process and cross-process).
   * The store is re-read under the lock, and a session that no longer needs a
   * refresh (another caller or process just did it) is returned as is.
   */
  refresh() {
    let byAccount = inflight.get(this.store);
    if (!byAccount) {
      byAccount = /* @__PURE__ */ new Map();
      inflight.set(this.store, byAccount);
    }
    const running = byAccount.get(this.accountId);
    if (running) return running;
    const map = byAccount;
    const p = serialize(
      this.store,
      this.accountId,
      () => this.lock.withLock(this.lockKey, () => this.refreshLocked())
    ).finally(() => map.delete(this.accountId));
    map.set(this.accountId, p);
    return p;
  }
  /**
   * Revoke the stored refresh token (RFC 7009) and wipe the local session.
   * Runs after any in-flight refresh (in-process queue + the RefreshLock), so
   * it revokes the token that refresh just rotated in, and nothing writes the
   * session back afterwards. The wipe happens even when the revoke fails or
   * the service is down.
   */
  logout(cached) {
    return serialize(this.store, this.accountId, async () => {
      try {
        return await this.lock.withLock(this.lockKey, async () => {
          try {
            const latest = await this.store.load(this.accountId).catch(() => void 0) ?? cached;
            if (!latest?.refreshToken) return { revoked: false };
            await this.auth.revoke(latest.refreshToken);
            return { revoked: true };
          } finally {
            await this.store.clear(this.accountId);
          }
        });
      } catch (error) {
        await this.store.clear(this.accountId).catch(() => {
        });
        return { revoked: false, error };
      }
    });
  }
  async refreshLocked() {
    const latest = await this.store.load(this.accountId);
    if (!latest) throw new ReauthRequiredError("not authenticated — call login() first.");
    if (!this.auth.needsRefresh(latest)) return latest;
    if (!latest.refreshToken) return this.withoutRefresh(latest);
    let next;
    try {
      next = await this.auth.refresh(latest);
    } catch (err) {
      if (err instanceof ReauthRequiredError) await this.store.clear(this.accountId);
      throw err;
    }
    await this.store.save(this.accountId, next);
    return next;
  }
  /** A session with no refresh token lives until it expires, then is over. */
  async withoutRefresh(tokens) {
    if (!this.auth.isExpired(tokens)) return tokens;
    await this.store.clear(this.accountId);
    throw new ReauthRequiredError();
  }
};

// packages/plugin-core/src/runtime/create-plugin-runtime.ts
var DEFAULT_SCOPES = [
  "read-investigation",
  "write-investigation",
  "approve-action"
];
var PluginRuntime = class {
  client;
  sessions;
  tools;
  host;
  auth;
  tokenStore;
  refresher;
  notify;
  runner;
  serviceUrl;
  accountId;
  surface;
  scopes;
  currentTokens;
  accessToken;
  constructor(opts) {
    const config = opts.config ?? {};
    const deps = opts.deps ?? {};
    const serviceUrl = config.serviceUrl ?? process.env.PM_SERVICE_URL;
    if (!serviceUrl) {
      throw new Error(
        "createPluginRuntime: serviceUrl is required (set config.serviceUrl or PM_SERVICE_URL)."
      );
    }
    this.serviceUrl = serviceUrl.replace(/\/$/, "");
    this.host = opts.host;
    this.accountId = config.accountId ?? process.env.PM_ACCOUNT_ID ?? "default";
    this.surface = config.surface ?? "plugin";
    this.scopes = config.scopes ?? DEFAULT_SCOPES;
    const gatewayUrl = config.mcpGatewayUrl ?? process.env.PM_MCP_GATEWAY_URL ?? this.serviceUrl;
    const clientId = config.clientId ?? process.env.PM_CLIENT_ID ?? "pm-plugin";
    const transport = deps.transport ?? new NodeHttpTransport(this.serviceUrl);
    this.tokenStore = deps.tokenStore ?? createTokenStore();
    this.client = new ServiceClient({
      transport,
      getAuthToken: () => this.accessToken,
      ...deps.newIdempotencyKey ? { newIdempotencyKey: deps.newIdempotencyKey } : {}
    });
    this.auth = new DeviceCodeAuth({
      transport,
      clientId,
      // No `scope` on the device login: DEFAULT_SCOPES are plugin session
      // scopes, not service scopes, and would pin the login to nothing.
      scopes: [],
      ...deps.now ? { now: deps.now } : {},
      ...deps.sleep ? { sleep: deps.sleep } : {}
    });
    this.refresher = new TokenRefresher({
      auth: this.auth,
      store: this.tokenStore,
      accountId: this.accountId,
      lock: deps.refreshLock ?? (deps.tokenStore ? IN_PROCESS_ONLY : createRefreshLock()),
      lockKey: refreshLockKey(this.accountId)
    });
    this.notify = deps.notify ?? ((message) => void process.stderr.write(`${message}
`));
    const createServiceSession = deps.createServiceSession ?? ((ids, scopes) => this.client.createMcpSession(ids, scopes, config.sessionTtlSeconds));
    this.sessions = new McpSessionManager({
      client: this.client,
      host: this.host,
      createServiceSession,
      notify: this.notify,
      ...deps.now ? { now: deps.now } : {}
    });
    const mcpToolTransport = deps.mcpToolTransport ?? new HttpMcpToolTransport(gatewayUrl, () => this.accessToken);
    this.tools = new McpTools({
      sessions: this.sessions,
      host: this.host,
      transport: mcpToolTransport,
      ...deps.audit ? { audit: deps.audit } : {},
      ...deps.newIdempotencyKey ? { newIdempotencyKey: deps.newIdempotencyKey } : {}
    });
    this.runner = new RemoteServiceRunner({
      client: this.client,
      host: this.host,
      connector: deps.sseConnector ?? new NodeSseConnector(),
      streamUrlFor: (id) => new URL(
        `/v1/runs/${encodeURIComponent(id)}/stream`,
        `${this.serviceUrl}/`
      ).toString(),
      authHeader: () => this.accessToken
    });
  }
  /**
   * Run the RFC-8628 device-code grant: start the flow, open the verification
   * URL via the host, poll to completion, and persist the encrypted tokens.
   */
  async login() {
    const start = await this.auth.start();
    await this.host.openExternalUrl(start.verificationUriComplete);
    const tokens = await this.auth.waitForTokens();
    await this.setTokens(tokens);
    return {
      accountId: this.accountId,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt
    };
  }
  /**
   * Start a hosted investigation and stream it to the host's render sink until
   * a terminal event. The worker fleet runs the pipeline server-side (AD-19).
   */
  async investigate(req, opts = {}) {
    await this.ensureAuth();
    return this.runner.run(req, this.withPresence(opts));
  }
  /**
   * Attach to an existing run: mint/reuse a scoped session, replay the durable
   * event slice, then subscribe live and render (AD-9 continuity).
   */
  async connect(investigationId, opts = {}) {
    await this.ensureAuth();
    await this.ensureSession([investigationId]);
    const slice = await this.client.getEventSlice(investigationId, 0);
    return this.runner.attach(investigationId, {
      ...this.withPresence(opts),
      replaySlice: slice.events
    });
  }
  /**
   * Invoke an idempotent `investigation.*` mutation tool. Mutations are
   * preview-gated by the host; a reject throws USER_REJECTED_CONFIRMATION and
   * never reaches the service.
   */
  async update(investigationId, tool, args = {}) {
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
  async logout() {
    this.sessions.discard();
    const cached = this.currentTokens;
    this.currentTokens = void 0;
    this.accessToken = void 0;
    const result = await this.refresher.logout(cached);
    if (result.error !== void 0) {
      const why = result.error instanceof Error ? result.error.message : String(result.error);
      this.notify(
        `Logged out locally, but the server-side revoke failed (${why}); the login expires on its own.`
      );
    }
  }
  withPresence(opts) {
    if (opts.presence) return opts;
    return { ...opts, presence: { surface: this.surface } };
  }
  /** Cache + persist tokens after a login. */
  async setTokens(tokens) {
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
  async ensureAuth() {
    let tokens;
    try {
      tokens = await this.refresher.ensureFresh(this.currentTokens);
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        this.currentTokens = void 0;
        this.accessToken = void 0;
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
  async ensureSession(investigationIds) {
    const active = this.sessions.getActiveSession();
    const covered = active !== void 0 && investigationIds.every((id) => this.sessions.isInScope(id));
    if (!covered) {
      await this.sessions.createSession(investigationIds, this.scopes);
    } else {
      await this.sessions.ensureFresh();
    }
  }
};
function createPluginRuntime(opts) {
  return new PluginRuntime(opts);
}

// packages/plugin-core/src/render/render-commands.ts
var LOG_TAIL = 8;
var STEP_GLYPH = {
  pending: "o",
  running: "~",
  completed: "*",
  failed: "x",
  skipped: "-"
};
var STATUS_LABEL = {
  created: "created",
  running: "running",
  completed: "completed",
  failed: "failed"
};
function fmtCost(usd) {
  return `$${usd.toFixed(4)}`;
}
function renderPanelCommands(view) {
  const { runSummary, pipeline, logs, pendingActions } = view;
  const stepsDone = pipeline.steps.filter((s) => s.status === "completed").length;
  const statusText = `PM ${STATUS_LABEL[runSummary.status]} - ${stepsDone}/${pipeline.steps.length} steps - ${fmtCost(runSummary.costUsd)} - ${pendingActions.filter((a) => a.status === "proposed").length} pending`;
  const commands = [
    { kind: "statusline", status: runSummary.status, text: statusText },
    {
      kind: "pipeline",
      steps: pipeline.steps.map((s) => ({
        stepId: s.stepId,
        label: s.label,
        status: s.status,
        glyph: STEP_GLYPH[s.status]
      }))
    },
    {
      kind: "log-tail",
      lines: logs.slice(-LOG_TAIL).map((l) => ({ sequence: l.sequence, level: l.level, text: l.text }))
    },
    {
      kind: "actions",
      actions: pendingActions.map((a) => ({
        actionId: a.actionId,
        kind: a.kind,
        summary: a.summary,
        status: a.status,
        actionable: a.status === "proposed"
      }))
    }
  ];
  if (runSummary.reportUri) {
    commands.push({ kind: "link", label: "Open report", url: runSummary.reportUri });
  }
  return commands;
}
function statuslineText(view) {
  const cmd = renderPanelCommands(view).find((c) => c.kind === "statusline");
  return cmd ? cmd.text : "";
}

// packages/plugin-core/src/context/redact.ts
var PATH_BLOCKLIST = [
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*service-account*.json",
  "**/.ssh/**",
  "**/id_rsa",
  "**/id_rsa.*",
  "**/*.pem",
  "**/*.key"
];
var MAX_TEXT_BYTES = 32 * 1024;
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$+?.()|[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
var BLOCKLIST_RE = PATH_BLOCKLIST.map(globToRegExp);

// packages/adapter-claude-code/src/host.ts
var ClaudeCodeHostAdapter = class {
  constructor(sinks) {
    this.sinks = sinks;
  }
  sinks;
  /** The most recent MCP server config registered (for diagnostics/tests). */
  mcpConfig;
  subscribers = /* @__PURE__ */ new Set();
  async registerMcpServer(cfg) {
    this.mcpConfig = cfg;
    await this.sinks.registerMcpServer?.(cfg);
  }
  /** Exposed for tests/diagnostics; never logs the sessionJwt. */
  getRegisteredEndpoint() {
    return this.mcpConfig?.endpoint;
  }
  async showMutationPreview(preview) {
    return this.sinks.confirmMutation(preview);
  }
  async openExternalUrl(url) {
    await this.sinks.openUrl(url);
  }
  renderPanel(view) {
    this.sinks.setStatusline(statuslineText(view));
    this.sinks.renderPanelCommands(renderPanelCommands(view));
  }
  subscribeUi(cb) {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
  /**
   * Called by the host wiring when the user interacts with the panel
   * (approve/reject an action, refresh, open the report). Fans the event out to
   * every plugin-core subscriber.
   */
  emitUi(event) {
    for (const cb of this.subscribers) cb(event);
  }
};

// packages/adapter-claude-code/src/cli.ts
var DEFAULT_SCOPES2 = ["read-investigation", "write-investigation", "approve-action"];
var DEFAULT_SERVICE_URL = "https://api.productionmaster.dev";
var TerminalSinks = class {
  constructor(out = process.stdout, err = process.stderr, isTty = Boolean(process.stdin.isTTY)) {
    this.out = out;
    this.err = err;
    this.isTty = isTty;
  }
  out;
  err;
  isTty;
  setStatusline(text) {
    this.err.write(`\r${text}   `);
  }
  renderPanelCommands(_commands) {
  }
  async confirmMutation(preview) {
    this.err.write(`
[mutation preview] ${preview.tool}: ${preview.summary}
`);
    if (!this.isTty) {
      this.err.write("Non-interactive terminal — auto-rejecting the mutation.\n");
      return "reject";
    }
    const rl = createInterface({ input: process.stdin, output: this.err });
    try {
      const answer = await new Promise(
        (resolve) => rl.question("Approve this action? [y/N] ", resolve)
      );
      return /^y(es)?$/i.test(answer.trim()) ? "approve" : "reject";
    } finally {
      rl.close();
    }
  }
  openUrl(url) {
    this.err.write(`
Open this URL in your browser:
  ${url}
`);
    openInBrowser(url);
  }
  registerMcpServer(_cfg) {
  }
};
function openInBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== void 0 && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = "true";
      }
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}
var KNOWN = /* @__PURE__ */ new Set(["login", "investigate", "connect", "update", "logout"]);
function usage(err) {
  err.write(
    `Usage: cli <login|investigate|connect|update|logout> [args] [--service <url>]
  investigate --input <ticket>
  connect <investigationId>
  update <investigationId> <tool> [jsonArgs]
  --service defaults to PM_SERVICE_URL, then ${DEFAULT_SERVICE_URL}
`
  );
}
async function main(argv = process.argv.slice(2)) {
  const { positionals, flags } = parseArgs(argv);
  if ("help" in flags || positionals[0] === "help") {
    usage(process.stdout);
    return 0;
  }
  const command = positionals[0] && KNOWN.has(positionals[0]) ? positionals.shift() : "investigate";
  const serviceUrl = flags.service ?? process.env.PM_SERVICE_URL ?? DEFAULT_SERVICE_URL;
  const clientId = flags.client ?? process.env.PM_OAUTH_CLIENT_ID;
  const accountId = flags.account ?? process.env.PM_ACCOUNT_ID ?? "default";
  const config = { serviceUrl, accountId };
  if (flags.gateway) config.mcpGatewayUrl = flags.gateway;
  if (clientId) config.clientId = clientId;
  const deps = {};
  const presetToken = flags.token;
  if (presetToken && command !== "login") {
    const store = new TokenStore({ backend: new InMemorySecretBackend(), issuer: serviceUrl });
    await store.save(accountId, {
      accessToken: presetToken,
      refreshToken: "",
      // Far-future so ensureAuth never tries to refresh a token it cannot
      // refresh; a shorter-lived real token is rejected by the service at call
      // time instead.
      expiresAt: Date.now() + 24 * 60 * 60 * 1e3,
      scopes: DEFAULT_SCOPES2
    });
    deps.tokenStore = store;
  }
  const runtime = createPluginRuntime({
    host: new ClaudeCodeHostAdapter(new TerminalSinks()),
    config,
    deps
  });
  try {
    switch (command) {
      case "login": {
        const result = await runtime.login();
        process.stdout.write(
          `
✓ Logged in (account ${result.accountId}) — scopes ${result.scopes.join(", ")}
`
        );
        return 0;
      }
      case "investigate": {
        const input = flags.input ?? "";
        if (!input) {
          process.stderr.write("cli investigate: --input <ticket> is required.\n");
          return 2;
        }
        const result = await runtime.investigate({ ticket: input });
        process.stdout.write(`
Run ${result.investigationId} → ${result.status}
`);
        if (result.reportUri) process.stdout.write(`Report: ${result.reportUri}
`);
        return result.status === "completed" ? 0 : 1;
      }
      case "connect": {
        const id = positionals[0];
        if (!id) {
          process.stderr.write("cli connect: <investigationId> is required.\n");
          return 2;
        }
        const result = await runtime.connect(id);
        process.stdout.write(`
Run ${result.investigationId} → ${result.status}
`);
        if (result.reportUri) process.stdout.write(`Report: ${result.reportUri}
`);
        return result.status === "completed" ? 0 : 1;
      }
      case "update": {
        const id = positionals[0];
        const tool = positionals[1];
        if (!id || !tool) {
          process.stderr.write("cli update: <investigationId> <tool> [jsonArgs] are required.\n");
          return 2;
        }
        const args = positionals[2] ? JSON.parse(positionals[2]) : {};
        const result = await runtime.update(id, tool, args);
        process.stdout.write(`
${JSON.stringify(result)}
`);
        return 0;
      }
      case "logout": {
        await runtime.logout();
        process.stdout.write("\n✓ Logged out.\n");
        return 0;
      }
      default: {
        usage(process.stderr);
        return 2;
      }
    }
  } catch (err) {
    const message = err.message ?? String(err);
    if (/not authenticated/i.test(message)) {
      process.stderr.write("\nNot authenticated — run /login first.\n");
      return 4;
    }
    process.stderr.write(`
cli error: ${message}
`);
    return 1;
  }
}
function isEntryPoint() {
  const entry = typeof process !== "undefined" ? process.argv[1] : void 0;
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}
var isMain = isEntryPoint();
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`cli fatal: ${err.message ?? String(err)}
`);
      process.exit(1);
    }
  );
}
export {
  DEFAULT_SERVICE_URL,
  TerminalSinks,
  main
};
