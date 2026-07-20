/**
 * Emulated, schema-real BFF over the in-memory {@link FakeTransport}.
 *
 * Everything else in the test suite drives adapters against ad-hoc canned
 * responses. This helper is the ONE reusable emulator that serves the real v1
 * route surface with response bodies whose SHAPES match what `ServiceClient`
 * (plugin-core), pmctl, and the Python client actually parse — `Run` /
 * `{events:[...]}` page / `ReportResponse` / `ActionRef`. It lets a per-surface
 * test do a real round-trip (createRun -> getRun -> getReport / getEventSlice)
 * against a single coherent, stateful emulator rather than a scenario-specific
 * stub.
 *
 * Routes served (concrete paths registered against a fixed seeded id):
 *   POST /v1/runs                     -> 202 { investigationId }
 *   GET  /v1/runs/{id}                -> 200 Run (detail projection)
 *   GET  /v1/runs/{id}/events         -> 200 { events: [...] } (event page)
 *   GET  /v1/runs/{id}/report         -> 200 ReportResponse
 *   POST /v1/actions                  -> 201 ActionRef (proposed)
 *   POST /v1/actions/{id}/approve     -> 200 ActionRef (approved)
 *   POST /v1/actions/{id}/reject      -> 200 ActionRef (rejected)
 *
 * Schema-real invariant: {@link EmulatedBff.registeredTemplates} exposes the
 * `METHOD {id}` template of every route the emulator serves. The companion test
 * asserts that set is a subset of `extractRoutes(edge-api-v1.yaml)` ∪
 * {@link EMULATOR_CROSS_SERVICE_ROUTES}, so the emulator can never drift away
 * from the routes the schema-real surface actually serves. Pure TS (no `fs`) so
 * it is safe to import from `dist` in downstream packages (pmctl).
 */
import { FakeTransport } from "./fake-transport.js";
import type {
  ActionRef,
  HttpRequest,
  HttpResponse,
  ReportResponse,
  Run,
} from "../types.js";
import type { InvestigationEventEnvelope } from "../../types.js";

export interface EmulatedBffOptions {
  /** Seeded investigation id (default `inv_emulated`). */
  investigationId?: string;
  /** Seeded action id used by the action lifecycle routes (default `act_emulated`). */
  actionId?: string;
  /** Initial run title (overwritten by a `title` in the createRun body). */
  title?: string;
}

/**
 * Documented cross-service routes: served by SIBLING services (edge-actions) or
 * are read projections, so they are intentionally NOT in `edge-api-v1.yaml`.
 * Mirrors `CROSS_SERVICE_ROUTES` in `client-parity.test.ts` — kept in sync by
 * the emulator self-check test, which requires each entry to actually be served.
 */
export const EMULATOR_CROSS_SERVICE_ROUTES: ReadonlySet<string> = new Set([
  "POST /v1/actions",
  "POST /v1/actions/{id}/approve",
  "POST /v1/actions/{id}/reject",
  "GET /v1/runs/{id}/report",
]);

function evt(
  investigationId: string,
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): InvestigationEventEnvelope {
  return {
    eventId: `evt_${sequence}`,
    investigationId,
    type,
    timestamp: new Date(Date.UTC(2026, 5, 30, 10, 0, sequence)).toISOString(),
    sequence,
    schemaVersion: "investigation.events.v1",
    payload,
  };
}

export class EmulatedBff {
  readonly transport: FakeTransport;
  readonly investigationId: string;
  readonly actionId: string;
  /** Schema-real run detail projection returned by GET /v1/runs/{id}. */
  readonly run: Run;
  /** Schema-real rendered report returned by GET /v1/runs/{id}/report. */
  readonly report: ReportResponse;
  /** Schema-real event page served by GET /v1/runs/{id}/events. */
  readonly events: InvestigationEventEnvelope[];
  private readonly templates = new Set<string>();

  constructor(opts: EmulatedBffOptions = {}) {
    this.investigationId = opts.investigationId ?? "inv_emulated";
    this.actionId = opts.actionId ?? "act_emulated";
    const id = this.investigationId;
    const reportUri = `https://api.productionmaster.ai/v1/runs/${id}/report`;

    this.run = {
      investigationId: id,
      status: "completed",
      title: opts.title ?? "Checkout 500s after deploy",
      createdAt: "2026-06-30T10:00:00.000Z",
      completedAt: "2026-06-30T10:04:12.000Z",
      reportUri,
      costUsd: 0.42,
    };

    this.events = [
      evt(id, 1, "investigation.created", { title: this.run.title }),
      evt(id, 2, "investigation.status_changed", { status: "running" }),
      evt(id, 3, "phase.started", { phaseId: "understand", label: "Understand" }),
      evt(id, 4, "investigation.completed", { reportUri }),
    ];

    this.report = {
      investigationId: id,
      format: "md",
      content:
        "# Root cause\n\nNull deref in the checkout handler after the deploy.\n",
      reportUri,
    };

    this.transport = new FakeTransport();

    this.register("POST", "/v1/runs", "/v1/runs", (req) => {
      const body = (req.body ?? {}) as { title?: string };
      if (typeof body.title === "string") this.run.title = body.title;
      return { status: 202, body: { investigationId: id } };
    });
    this.register("POST", "/v1/mcp/sessions", "/v1/mcp/sessions", () => ({
      status: 201,
      body: {
        endpoint: `https://mcp.productionmaster.ai/v1/mcp/${id}`,
        audience: "pm-mcp",
        sessionJwt: `session-jwt-${id}`,
        ttlSeconds: 300,
      },
    }));
    this.register("GET", "/v1/runs/{id}", `/v1/runs/${id}`, () => ({
      status: 200,
      body: this.run,
    }));
    this.register(
      "GET",
      "/v1/runs/{id}/events",
      `/v1/runs/${id}/events`,
      () => ({ status: 200, body: { events: this.events } }),
    );
    this.register(
      "GET",
      "/v1/runs/{id}/report",
      `/v1/runs/${id}/report`,
      () => ({ status: 200, body: this.report }),
    );
    this.register("POST", "/v1/actions", "/v1/actions", () => ({
      status: 201,
      body: { actionId: this.actionId, status: "proposed" } satisfies ActionRef,
    }));
    this.register(
      "POST",
      "/v1/actions/{id}/approve",
      `/v1/actions/${this.actionId}/approve`,
      () => ({
        status: 200,
        body: {
          actionId: this.actionId,
          status: "approved",
        } satisfies ActionRef,
      }),
    );
    this.register(
      "POST",
      "/v1/actions/{id}/reject",
      `/v1/actions/${this.actionId}/reject`,
      () => ({
        status: 200,
        body: {
          actionId: this.actionId,
          status: "rejected",
        } satisfies ActionRef,
      }),
    );
  }

  /** The `METHOD {id}` template of every route the emulator serves. */
  registeredTemplates(): ReadonlySet<string> {
    return this.templates;
  }

  private register(
    method: HttpRequest["method"],
    template: string,
    concretePath: string,
    handler: (req: HttpRequest) => HttpResponse,
  ): void {
    this.templates.add(`${method} ${template}`);
    this.transport.on(method, concretePath, handler);
  }
}
