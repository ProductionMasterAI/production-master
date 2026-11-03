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
    const headers = { ...opts.headers ?? {} };
    let body;
    if (opts.body !== void 0) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { method: opts.method, headers, body });
    let parsed = void 0;
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
var McpSessionManager = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  active;
  getActiveSession() {
    return this.active;
  }
  /**
   * Create (or switch to) a scoped session for the given investigation(s).
   * Any prior session is discarded first so it can never be reused. A session
   * requesting a write scope expands capability past read-only, so it is backed
   * by a baseline trust grant (audited locally and mirrored to the service).
   */
  async createSession(investigationIds, scopes) {
    if (this.active) this.discard();
    const grant = await this.deps.createServiceSession(investigationIds, scopes);
    await this.deps.host.registerMcpServer({
      endpoint: grant.endpoint,
      audience: grant.audience,
      sessionJwt: grant.sessionJwt,
      scopes
    });
    this.active = { grant, investigationIds, scopes };
    if (this.deps.trust && scopes.some((s) => WRITE_SCOPES.includes(s))) {
      for (const investigationId of investigationIds) {
        void this.issueGrant(investigationId);
      }
    }
    return this.active;
  }
  /** Discard the active session and revoke any grants it minted (on exit). */
  discard() {
    const investigationIds = this.active?.investigationIds ?? [];
    this.active = void 0;
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
    const session = this.deps.sessions.getActiveSession();
    if (!session) throw new ToolError("PERMISSION_DENIED", "no active MCP session");
    const investigationId = args.investigationId ?? session.investigationIds[0];
    if (!this.deps.sessions.isInScope(investigationId)) {
      throw new ToolError("PERMISSION_DENIED", `investigation ${investigationId} out of session scope`);
    }
    if (!isReadTool(tool) && !isMutationTool(tool)) {
      throw new ToolError("NOT_FOUND", `unknown tool ${tool}`);
    }
    if (isMutationTool(tool)) {
      await this.gateMutation(tool, investigationId, args);
    }
    const idempotencyKey = isMutationTool(tool) ? this.deps.newIdempotencyKey?.() : void 0;
    const res = await this.deps.transport.call({
      endpoint: session.grant.endpoint,
      sessionJwt: session.grant.sessionJwt,
      tool,
      args,
      idempotencyKey
    });
    if (res.status >= 200 && res.status < 300) return res.body;
    const message = res.body?.message ?? `tool ${tool} failed`;
    if (res.status === 403) throw new ToolError("PERMISSION_DENIED", message);
    if (res.status === 404) throw new ToolError("NOT_FOUND", message);
    if (res.status === 409) throw new ToolError("IDEMPOTENCY_CONFLICT", message);
    if (res.status === 402) throw new ToolError("BUDGET_EXHAUSTED", message);
    throw new ToolError("NOT_FOUND", message);
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

// packages/plugin-core/src/auth/device-code.ts
var FIVE_MIN_MS = 5 * 60 * 1e3;
var DeviceCodeAuth = class {
  transport;
  clientId;
  scopes;
  now;
  sleep;
  refreshSkewMs;
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
    this.refreshSkewMs = opts.refreshSkewMs ?? FIVE_MIN_MS;
  }
  async start() {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/device",
      body: { clientId: this.clientId, scope: this.scopes.join(" ") }
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`device start failed: ${res.status}`);
    }
    const body = res.body;
    this.deviceCode = body.deviceCode;
    this.interval = Math.max(1, body.interval);
    this.deviceExpiresAt = this.now() + body.expiresIn * 1e3;
    return body;
  }
  /** One poll tick. Never call faster than `this.interval` seconds yourself. */
  async poll() {
    if (!this.deviceCode) throw new Error("poll() called before start()");
    if (this.now() >= this.deviceExpiresAt) return { status: "expired" };
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
        deviceCode: this.deviceCode,
        clientId: this.clientId
      }
    });
    if (res.status >= 200 && res.status < 300) {
      return { status: "tokens", tokens: res.body };
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
        return { status: "pending" };
    }
  }
  /**
   * Drive poll() to a terminal state, sleeping `interval` between attempts
   * (honoring slow_down). Returns tokens or throws on denied/expired/timeout.
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
  /** True when the access token is within the refresh skew of expiry. */
  needsRefresh(tokens) {
    return tokens.expiresAt - this.now() < this.refreshSkewMs;
  }
  async refresh(refreshToken) {
    const res = await this.transport.request({
      method: "POST",
      path: "/v1/oauth/token",
      body: {
        grantType: "refresh_token",
        refreshToken,
        clientId: this.clientId
      }
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`refresh failed: ${res.status}`);
    }
    return res.body;
  }
  async revoke(refreshToken) {
    await this.transport.request({
      method: "POST",
      path: "/v1/oauth/revoke",
      body: { token: refreshToken, clientId: this.clientId }
    });
  }
};

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
      updatedAt: this.now()
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
      scopes: s.scopes
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
      scopes: this.scopes,
      ...deps.now ? { now: deps.now } : {},
      ...deps.sleep ? { sleep: deps.sleep } : {}
    });
    const createServiceSession = deps.createServiceSession ?? ((ids, scopes) => this.client.createMcpSession(ids, scopes, config.sessionTtlSeconds));
    this.sessions = new McpSessionManager({
      client: this.client,
      host: this.host,
      createServiceSession
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
  /** Discard the active MCP session and wipe stored tokens. */
  async logout() {
    this.sessions.discard();
    this.currentTokens = void 0;
    this.accessToken = void 0;
    await this.tokenStore.clear(this.accountId);
  }
  withPresence(opts) {
    if (opts.presence) return opts;
    return { ...opts, presence: { surface: this.surface } };
  }
  /** Cache + persist tokens after a login or refresh. */
  async setTokens(tokens) {
    this.currentTokens = tokens;
    this.accessToken = tokens.accessToken;
    await this.tokenStore.save(this.accountId, tokens);
  }
  /**
   * Ensure a usable access token: hydrate from the store on first use and
   * refresh proactively when within the refresh skew. Throws when the user has
   * never logged in.
   */
  async ensureAuth() {
    if (!this.currentTokens) {
      this.currentTokens = await this.tokenStore.load(this.accountId);
      this.accessToken = this.currentTokens?.accessToken;
    }
    if (!this.currentTokens) {
      throw new Error("not authenticated — call login() first.");
    }
    if (this.auth.needsRefresh(this.currentTokens)) {
      const refreshed = await this.auth.refresh(this.currentTokens.refreshToken);
      await this.setTokens(refreshed);
    }
  }
  /** Mint (or reuse) a scoped session covering the given investigation ids. */
  async ensureSession(investigationIds) {
    const active = this.sessions.getActiveSession();
    const covered = active !== void 0 && investigationIds.every((id) => this.sessions.isInScope(id));
    if (!covered) {
      await this.sessions.createSession(investigationIds, this.scopes);
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
  if (flags.help === "true" || positionals[0] === "help") {
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
